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
const SESSION_KEY = 'bp-session';
const CREDS_KEY = 'bp-creds';

function phoneToEmail(phone: string): string {
  const clean = phone.replace(/\s+/g, '').replace(/[^+\d]/g, '');
  return `${clean}@branchport.app`;
}

function normalizePhone(v: string): string {
  return v.replace(/\s+/g, '').replace(/[^+\d]/g, '');
}

export function saveCreds(phone: string, password: string) {
  try { localStorage.setItem(CREDS_KEY, JSON.stringify({ phone, password })); } catch {}
}

export function loadSavedCredentials(): { phone: string; password: string } | null {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function clearCreds() {
  localStorage.removeItem(CREDS_KEY);
}

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
        console.error('loadProfile error:', error?.message);
        // Profile doesn't exist yet (signup in progress). Build minimal from auth metadata.
        const { data: authUser } = await supabase.auth.getUser();
        const meta = authUser.user?.user_metadata;
        return {
          id: userId,
          business_id: '',
          branch_id: null,
          role: 'owner',
          name: meta?.name ?? meta?.phone ?? 'User',
          phone: meta?.phone ?? null,
          created_at: new Date().toISOString(),
        };
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
          localStorage.setItem(SESSION_KEY, userId);
          setAuthUserId(userId);
          const p = await loadProfile(userId);
          if (!cancelled) {
            setProfile(p);
            setLoading(false);
          }
        } else {
          // No Supabase session. Check localStorage fallback.
          const saved = localStorage.getItem(SESSION_KEY);
          if (saved) {
            setAuthUserId(saved);
            const p = await loadProfile(saved);
            if (!cancelled) {
              setProfile(p);
              setLoading(false);
            }
          } else {
            if (!cancelled) setLoading(false);
          }
        }
      } catch (err) {
        console.error('Auth init failed:', err);
        if (!cancelled) setLoading(false);
      }
    }

    init();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const userId = session.user.id;
          localStorage.setItem(SESSION_KEY, userId);
          setAuthUserId(userId);
          const p = await loadProfile(userId);
          setProfile(p);
        } else if (event === 'SIGNED_OUT') {
          localStorage.removeItem(SESSION_KEY);
          clearCreds();
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

    const email = phoneToEmail(cleanPhone);

    const { data, error: authErr } = await supabase.auth.signInWithPassword({
      email,
      password: cleanPw,
    });

    if (authErr) {
      const msg = authErr.message;
      if (msg.includes('Invalid login credentials')) {
        return { error: 'Wrong phone number or password. Please check and try again.' };
      }
      if (msg.includes('Email not confirmed')) {
        // Auto-confirm and retry — handles existing users who signed up
        // before auto_confirm_user was added, or where the RPC failed.
        console.warn('Email not confirmed, auto-confirming and retrying...');
        const { data: users } = await supabase.from('users').select('id').eq('phone', cleanPhone).limit(1);
        if (users && users.length > 0) {
          await supabase.rpc('auto_confirm_user', { p_user_id: users[0].id });
        }
        const { data: retryData, error: retryErr } = await supabase.auth.signInWithPassword({ email, password: cleanPw });
        if (retryErr || !retryData?.user) {
          return { error: 'Account not confirmed. Please contact your administrator.' };
        }
        const userId = retryData.user.id;
        localStorage.setItem(SESSION_KEY, userId);
        setAuthUserId(userId);
        const p = await loadProfile(userId);
        setProfile(p);
        saveCreds(cleanPhone, cleanPw);
        return { error: null };
      }
      if (msg.includes('too many')) {
        return { error: 'Too many attempts. Please wait a minute and try again.' };
      }
      return { error: msg || 'Login failed. Please try again.' };
    }

    if (!data.user) {
      return { error: 'Login failed. Please try again.' };
    }

    // Success
    const userId = data.user.id;
    localStorage.setItem(SESSION_KEY, userId);
    setAuthUserId(userId);
    const p = await loadProfile(userId);
    setProfile(p);
    saveCreds(cleanPhone, cleanPw);

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

    // Step 1.5: Auto-confirm the user's email so they can sign in immediately.
    // BranchPort uses phone@branchport.app — a fake email domain — so the
    // confirmation email never arrives. We confirm the user via RPC.
    const { error: confirmErr } = await supabase.rpc('auto_confirm_user', {
      p_user_id: newUserId,
    });
    if (confirmErr) {
      console.warn('auto_confirm_user failed:', confirmErr.message);
    }

    // Step 2: Create business + user via RPC (bypasses RLS, works as anon)
    const { error: rpcErr } = await supabase.rpc('signup_create_owner', {
      p_auth_user_id: newUserId,
      p_name: cleanName,
      p_phone: cleanPhone,
      p_business_name: cleanBizName,
    });

    if (rpcErr) {
      console.error('signup_create_owner RPC failed:', rpcErr.message);
    }

    // Step 3: Sign in to get an active session
    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password: params.password,
    });

    if (signInErr) {
      console.warn('Post-signup signIn failed:', signInErr.message);
      localStorage.setItem(SESSION_KEY, newUserId);
      setAuthUserId(newUserId);
      const p = await loadProfile(newUserId);
      setProfile(p);
      return { error: null };
    }

    // Full success — session active
    const userId = signInData.session.user.id;
    localStorage.setItem(SESSION_KEY, userId);
    setAuthUserId(userId);
    const p = await loadProfile(userId);
    setProfile(p);
    saveCreds(cleanPhone, params.password);

    return { error: null };
  }, [loadProfile]);

  // ── Sign Out ──
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    localStorage.removeItem(SESSION_KEY);
    clearCreds();
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
