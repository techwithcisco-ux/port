import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { api } from '../lib/api';

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
  /** The authenticated user id (may be null before profile loads) */
  authUserId: string | null;
  /** The full user profile from the users table (null until loaded) */
  profile: UserProfile | null;

  /** Legacy alias — same as profile */
  user: UserProfile | null;

  /** Sign in with phone + password */
  signInWithPhonePassword: (phone: string, password: string) => Promise<{ error: string | null }>;
  /** Alias */
  signIn: (phone: string, password: string) => Promise<{ error: string | null }>;

  /** Create a new owner account (business + owner + Main Store branch) */
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
// NOTE: sessions live ONLY as the JWT + user JSON under the
// 'bp-session-token' / 'bp-session-user' keys (see packages/shared
// apiClient). This app never keeps its own user-id shortcut or password
// copy: a bare id in localStorage proves nothing and a stored password is
// a theft waiting to happen. "Remember me" = the 30-day JWT in storage.

function normalizePhone(v: string): string {
  return v.replace(/\s+/g, '').replace(/[^+\d]/g, '');
}

// Login rate-limit: slow brute force on shared manager devices.
// (The API rate-limits per IP too — this is the client-side backstop.)
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
      const { data, error } = await api
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !data) {
        // No row for this id (deleted mid-session). Never synthesize a role
        // here — a forged owner stub with an empty business_id would render
        // owner screens with no data at best.
        console.error('loadProfile error:', error?.message);
        return null;
      }
      return data as UserProfile;
    } catch (err) {
      console.error('loadProfile exception:', err);
      return null;
    }
  }, []);

  // ── Initialize on mount: validate the stored JWT via /auth/me ──
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const token = api.auth.getToken();
        if (!token) {
          if (!cancelled) setLoading(false);
          return;
        }
        const res = await api.auth.me();
        if (cancelled) return;
        if (res.ok) {
          setAuthUserId(res.user.id);
          const p = await loadProfile(res.user.id);
          if (!cancelled) {
            setProfile(p);
            setLoading(false);
          }
        } else {
          // Expired/invalid token or network failure — treat as logged out.
          // (A transient network error also lands here: the login screen
          // shown is recoverable, a phantom session is not.)
          api.auth.logout();
          setLoading(false);
        }
      } catch (err) {
        console.error('Auth init failed:', err);
        if (!cancelled) setLoading(false);
      }
    }

    init();

    // Cross-tab: another tab signed in/out.
    const unsubscribe = api.auth.onChange((event) => {
      if (cancelled) return;
      if (event === 'signed-out') {
        setAuthUserId(null);
        setProfile(null);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
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

    const res = await api.auth.login(cleanPhone, cleanPw);

    if (!res.ok) {
      if (/too many attempts/i.test(res.error)) {
        return { error: res.error };
      }
      return fail(res.error || 'Wrong phone number or password. Please check and try again.');
    }

    // Success — the JWT + user are persisted by the client itself.
    failCount = 0;
    setAuthUserId(res.user.id);
    const p = await loadProfile(res.user.id);
    setProfile(p);

    return { error: null };
  }, [loadProfile]);

  // ── Sign Up (owner) ──
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
    if (params.password.length < 8) return { error: 'Password must be at least 8 characters.' };
    if (!/[A-Za-z]/.test(params.password) || !/[0-9]/.test(params.password)) {
      return { error: 'Password must contain a letter and a number.' };
    }

    // One atomic call: business + owner user + Main Store branch + JWT.
    const res = await api.auth.signupOwner({
      name: cleanName,
      phone: cleanPhone,
      businessName: cleanBizName,
      businessType: params.businessType,
      password: params.password,
    });

    if (!res.ok) {
      return { error: res.error || 'Signup failed. Please try again.' };
    }

    setAuthUserId(res.user.id);
    const p = await loadProfile(res.user.id);
    setProfile(p);

    return { error: null };
  }, [loadProfile]);

  // ── Sign Out (revokes the refresh token server-side, best effort) ──
  const signOut = useCallback(async () => {
    try { await api.auth.logout(); } catch { /* best effort revoke */ }
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
