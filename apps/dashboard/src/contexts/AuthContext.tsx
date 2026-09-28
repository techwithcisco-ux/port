import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

// ─── Types ───────────────────────────────────────────────────
export interface UserProfile {
  id: string;
  business_id: string;
  branch_id: string | null;
  role: 'owner' | 'manager' | 'staff';
  name: string;
  phone: string | null;
  created_at: string;
}

interface AuthState {
  loading: boolean;
  /** The current Supabase auth user id (may be null before profile loads) */
  authUserId: string | null;
  /** The full user profile from the users table (null until loaded) */
  profile: UserProfile | null;

  /** Legacy alias — same as profile */
  user: UserProfile | null;

  /** Sign in with phone + password */
  signInWithPhonePassword: (phone: string, password: string) => Promise<{ error: string | null }>;
  /** Alias */
  signIn: (phone: string, password: string) => Promise<{ error: string | null }>;

  /** Create a new owner account */
  signUpOwner: (params: {
    name: string;
    phone: string;
    businessName: string;
    businessType?: string;
    password: string;
  }) => Promise<{ error: string | null }>;
  /** Alias */
  signUp: (params: {
    name: string;
    phone: string;
    businessName: string;
    password: string;
  }) => Promise<{ error: string | null }>;

  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

// ─── Helpers ─────────────────────────────────────────────────
// NOTE: sessions live ONLY in Supabase Auth storage (managed by
// supabase-js). This app never keeps its own user-id shortcut or password
// copy: a bare id in localStorage proves nothing and a stored password is
// a theft waiting to happen. "Remember me" = Supabase's persisted session.

function phoneToEmail(phone: string): string {
  const clean = phone.replace(/\s+/g, '').replace(/[^+\d]/g, '');
  return `${clean}@branchport.app`;
}

function normalizePhone(v: string): string {
  return v.replace(/\s+/g, '').replace(/[^+\d]/g, '');
}

// Login rate-limit: slow brute force on shared manager devices.
let failCount = 0;
let lockedUntil = 0;

// ─── Context ─────────────────────────────────────────────────
const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // ── Load profile from DB ──
  const loadProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !data) {
        // No app row for this auth user (deleted, or signup RPC failed).
        // Never synthesize a role here — a forged owner stub with an empty
        // business_id would render owner screens with no data at best.
        console.error('loadProfile error:', error?.message);
        return null;
      }
      return data as UserProfile;
    } catch (err) {
      console.error('loadProfile exception:', err);
      return null;
    }
  }, []);

  // ── Initialize on mount ──
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;

        if (session?.user) {
          const userId = session.user.id;
          setAuthUserId(userId);
          const p = await loadProfile(userId);
          if (!cancelled) {
            setProfile(p);
            setLoading(false);
          }
        } else {
          // No Supabase session ⇒ logged out. A bare user id in storage
          // is never trusted on its own (anyone can write localStorage).
          if (!cancelled) setLoading(false);
        }
      } catch (err) {
        console.error('Auth init failed:', err);
        if (!cancelled) setLoading(false);
      }
    }

    init();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: string, session: { user?: { id: string } } | null) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const userId = session.user.id;
          setAuthUserId(userId);
          const p = await loadProfile(userId);
          setProfile(p);
        } else if (event === 'SIGNED_OUT') {
          setAuthUserId(null);
          setProfile(null);
        }
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  // ── Sign In ──
  const signInWithPhonePassword = useCallback(async (phone: string, password: string): Promise<{ error: string | null }> => {
    const cleanPhone = normalizePhone(phone);
    const cleanPw = password.trim();

    if (!cleanPhone || !cleanPw) {
      return { error: 'Phone number and password are required.' };
    }
    if (Date.now() < lockedUntil) {
      return { error: 'Too many attempts. Wait a minute and try again.' };
    }
    const fail = (msg: string) => {
      failCount += 1;
      if (failCount >= 5) {
        lockedUntil = Date.now() + 60_000;
        failCount = 0;
        return { error: 'Too many attempts. Wait a minute and try again.' };
      }
      return { error: msg };
    };

    const email = phoneToEmail(cleanPhone);

    const { data, error: authErr } = await supabase.auth.signInWithPassword({
      email,
      password: cleanPw,
    });

    if (authErr) {
      const msg = authErr.message;
      if (msg.includes('Invalid login credentials')) {
        return fail('Wrong phone number or password. Please check and try again.');
      }
      if (msg.includes('Email not confirmed')) {
        // BranchPort logins are phone@branchport.app — a fake domain whose
        // mailbox never exists — so "Confirm email" must stay OFF in
        // Supabase Auth settings. If it is ever ON, nobody can sign in and
        // no client trick can fix that; say so plainly.
        return fail('Account not confirmed. Ask your administrator to switch OFF “Confirm email” in Supabase Auth settings, then try again.');
      }
      if (msg.includes('too many')) {
        return { error: 'Too many attempts. Please wait a minute and try again.' };
      }
      return fail(msg || 'Login failed. Please try again.');
    }

    if (!data.user) {
      return fail('Login failed. Please try again.');
    }

    // Success — the session is persisted by supabase-js itself.
    failCount = 0;
    const userId = data.user.id;
    setAuthUserId(userId);
    const p = await loadProfile(userId);
    setProfile(p);

    return { error: null };
  }, [loadProfile]);

  // ── Sign Up ──
  const signUpOwner = useCallback(async (params: {
    name: string;
    phone: string;
    businessName: string;
    businessType?: string;
    password: string;
  }): Promise<{ error: string | null }> => {
    const cleanPhone = normalizePhone(params.phone);
    const cleanName = params.name.trim();
    const cleanBizName = params.businessName.trim();

    if (!cleanName) return { error: 'Your name is required.' };
    if (!cleanPhone || cleanPhone.length < 9) return { error: 'Please enter a valid Ghana phone number.' };
    if (!cleanBizName) return { error: 'Business name is required.' };
    if (params.password.length < 7) return { error: 'Password must be at least 7 characters.' };

    const email = phoneToEmail(cleanPhone);

    // Step 1: Create Supabase Auth user
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email,
      password: params.password,
      options: {
        data: { name: cleanName, phone: cleanPhone },
        emailRedirectTo: window.location.origin,
      },
    });

    if (authErr) {
      const msg = authErr.message;
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        return { error: 'This phone number is already registered. Please sign in instead.' };
      }
      return { error: msg || 'Signup failed. Please try again.' };
    }

    if (!authData.user) {
      return { error: 'Signup failed. Please try again.' };
    }

    const newUserId = authData.user.id;

    // With “Confirm email” OFF (required — see login), signUp may already
    // carry a session. Otherwise sign in to get one BEFORE any RPC: the
    // hardened RPCs (0023) only serve the caller themself.
    let sessionUserId: string | null = authData.session?.user.id ?? null;
    if (!sessionUserId) {
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: params.password,
      });
      if (signInErr || !signInData.session) {
        return { error: 'Account created, but sign-in failed. Please sign in with your phone + password.' };
      }
      sessionUserId = signInData.session.user.id;
    }
    if (sessionUserId !== newUserId) {
      await supabase.auth.signOut();
      return { error: 'Signup mismatch. Please sign in.' };
    }

    // Self-confirm (succeeds only for self under 0023; warn-and-continue
    // otherwise — sign-in already proved the account is usable).
    const { error: confirmErr } = await supabase.rpc('auto_confirm_user', {
      p_user_id: newUserId,
    });
    if (confirmErr) {
      console.warn('auto_confirm_user failed:', confirmErr.message);
    }

    // Create business + owner row. Failure here is FATAL — never fake a
    // login without a business (the old code did, leaving RLS dead).
    const { error: rpcErr } = await supabase.rpc('signup_create_owner', {
      p_auth_user_id: newUserId,
      p_name: cleanName,
      p_phone: cleanPhone,
      p_business_name: cleanBizName,
    });

    if (rpcErr) {
      console.error('signup_create_owner RPC failed:', rpcErr.message);
      await supabase.auth.signOut();
      setAuthUserId(null);
      setProfile(null);
      return { error: `Account created, but setup failed: ${rpcErr.message}. Please contact support.` };
    }

    setAuthUserId(newUserId);
    const p = await loadProfile(newUserId);
    setProfile(p);

    return { error: null };
  }, [loadProfile]);

  // ── Sign Out ──
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setAuthUserId(null);
    setProfile(null);
  }, []);

  // ── Refresh Profile ──
  const refreshProfile = useCallback(async () => {
    if (!authUserId) return;
    const p = await loadProfile(authUserId);
    setProfile(p);
  }, [authUserId, loadProfile]);

  return (
    <AuthContext.Provider
      value={{
        loading,
        authUserId,
        profile,
        user: profile, // alias
        signInWithPhonePassword,
        signIn: signInWithPhonePassword, // alias
        signUpOwner,
        signUp: signUpOwner, // alias
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
