import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { AppUser } from '@branchport/shared';
import { supabase, isApiMode, apiBaseUrl } from '../lib/supabase';

interface AuthState {
  loading: boolean;
  authUserId: string | null;
  profile: AppUser | null;
  /** POS sign-in — phone + password on BOTH backends. The password is
   *  mandatory on the Supabase path: only a real Supabase Auth session
   *  satisfies RLS, so passwordless logins can never sync sales. */
  signInWithPhone: (phone: string, password?: string) => Promise<{ error: string | null; passwordRequired?: boolean }>;
  /** Activate POS access from an activation link token, then sign in
   *  with the password from the invite. */
  activateAccount: (token: string) => Promise<{ error: string | null; phone?: string }>;
  signOut: () => Promise<void>;
}

const SESSION_KEY = 'branchport-pos-session';
const SAVED_PHONE_KEY = 'branchport-pos-saved-phone';

// Login rate-limit: slow brute force on shared branch devices.
let failCount = 0;
let lockedUntil = 0;

function normalisePhone(v: string) {
  return v.replace(/\s+/g, '').replace(/[^+\d]/g, '');
}

function phoneToEmail(phone: string): string {
  return `${phone}@branchport.app`;
}

function savePhone(phone: string) {
  try {
    localStorage.setItem(SAVED_PHONE_KEY, phone);
  } catch { /* quota exceeded */ }
}

export function loadSavedPhone(): string | null {
  try {
    return localStorage.getItem(SAVED_PHONE_KEY);
  } catch { return null; }
}

function clearSavedPhone() {
  localStorage.removeItem(SAVED_PHONE_KEY);
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);

  async function loadProfile(userId: string) {
    const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
    if (error) {
      console.error('Failed to load user profile:', error.message);
      setProfile(null);
      return;
    }
    setProfile(data as AppUser);
  }

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        if (isApiMode) {
          // Verify the cached JWT instead of trusting it blindly.
          const token = (() => { try { return localStorage.getItem('branchport-pos-token'); } catch { return null; } })();
          if (token) {
            const res = await fetch(`${apiBaseUrl}/auth/me`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const body = await res.json().catch(() => ({}));
            if (!cancelled && res.ok && body.user) {
              setAuthUserId(body.user.id);
              setProfile(body.user as AppUser);
              try { localStorage.setItem('branchport-pos-user', JSON.stringify(body.user)); } catch {}
              setLoading(false);
              return;
            }
            // Bad/expired token — drop it so login is forced.
            try {
              localStorage.removeItem('branchport-pos-token');
              localStorage.removeItem('branchport-pos-user');
              localStorage.removeItem(SESSION_KEY);
            } catch {}
          }
          if (!cancelled) setLoading(false);
          return;
        }
        // Supabase path: the ONLY trusted session is a real Supabase Auth
        // session. A bare user id in localStorage proves nothing (anyone
        // can write it), so it is never accepted on its own.
        const { data: { session } } = await supabase.auth.getSession();
        if (!cancelled && session?.user) {
          setAuthUserId(session.user.id);
          await loadProfile(session.user.id);
        }
      } catch (e) {
        console.error('POS auth init failed:', (e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();

    // Keep profile in step with sign-outs from other tabs.
    const sub = !isApiMode && supabase.auth.onAuthStateChange
      ? supabase.auth.onAuthStateChange(async (event: string, session: { user?: { id: string } } | null) => {
          if (event === 'SIGNED_OUT') {
            try { localStorage.removeItem(SESSION_KEY); } catch {}
            setAuthUserId(null);
            setProfile(null);
          } else if (event === 'SIGNED_IN' && session?.user) {
            setAuthUserId(session.user.id);
            await loadProfile(session.user.id);
          }
        })
      : null;
    return () => {
      cancelled = true;
      try { (sub as { data?: { subscription?: { unsubscribe?: () => void } } })?.data?.subscription?.unsubscribe?.(); } catch {}
    };
  }, []);

  /** POS sign-in. Both backends require phone + password so the session
   *  can actually write to the server (RLS on Supabase, JWT on the API). */
  async function signInWithPhone(phone: string, password?: string) {
    const cleanPhone = normalisePhone(phone);
    if (!cleanPhone) {
      return { error: 'Phone number is required.' };
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

    if (isApiMode) {
      try {
        const res = await fetch(`${apiBaseUrl}/auth/pos-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: cleanPhone, password }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (body.passwordRequired) return { error: 'This account needs a password — enter it below.', passwordRequired: true };
          return fail(body.error || 'Unable to verify phone number. Please try again.');
        }
        failCount = 0;
        // Persist the JWT where the apiClient data layer expects it,
        // plus the legacy session key the rest of the app reads.
        try {
          localStorage.setItem('branchport-pos-token', body.token);
          localStorage.setItem('branchport-pos-user', JSON.stringify(body.user));
        } catch { /* quota */ }
        localStorage.setItem(SESSION_KEY, body.user.id);
        setAuthUserId(body.user.id);
        setProfile(body.user as AppUser);
        savePhone(cleanPhone);
        return { error: null };
      } catch (e) {
        console.error('POS login failed:', (e as Error).message);
        return { error: 'Unable to reach the server. Check your connection.' };
      }
    }

    // Supabase path: real Auth session (phone maps to branchport.app email,
    // exactly like the dashboard). No session ⇒ RLS rejects every write.
    if (!password) {
      return { error: 'Password is required. Find it in your invite message from your manager.', passwordRequired: true };
    }
    const { data, error: authErr } = await supabase.auth.signInWithPassword({
      email: phoneToEmail(cleanPhone),
      password,
    });
    if (authErr || !data?.user) {
      const msg = authErr?.message ?? '';
      if (/invalid login credentials/i.test(msg)) {
        return fail('Wrong phone number or password. Ask your manager to resend your invite if needed.');
      }
      if (/email not confirmed/i.test(msg)) {
        return fail('Account not yet activated. Open your activation link first, then sign in.');
      }
      return fail(msg || 'Login failed. Please try again.');
    }
    failCount = 0;
    const userId = data.user.id;
    // Enforce POS-only roles BEFORE accepting the session. A bad role
    // signs straight back out so no session lingers.
    const { data: prow, error: prowErr } = await supabase.from('users').select('*').eq('id', userId).single();
    const roleUser = prow as AppUser | null;
    if (prowErr || !roleUser || (roleUser.role !== 'staff' && roleUser.role !== 'manager') || !roleUser.branch_id) {
      await supabase.auth.signOut();
      setAuthUserId(null);
      setProfile(null);
      return { error: 'This account does not have POS access.' };
    }
    localStorage.setItem(SESSION_KEY, userId);
    setAuthUserId(userId);
    setProfile(roleUser);
    savePhone(cleanPhone);
    return { error: null };
  }

  /** Activate POS access from an activation link token. */
  async function activateAccount(token: string) {
    if (isApiMode) {
      try {
        const res = await fetch(`${apiBaseUrl}/auth/pos-activate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return { error: body.error || 'Invalid or expired activation link.' };
        try {
          localStorage.setItem('branchport-pos-token', body.token);
          localStorage.setItem('branchport-pos-user', JSON.stringify(body.user));
        } catch { /* quota */ }
        localStorage.setItem(SESSION_KEY, body.user.id);
        setAuthUserId(body.user.id);
        setProfile(body.user as AppUser);
        savePhone(body.user.phone ?? '');
        return { error: null, user: body.user as AppUser };
      } catch {
        return { error: 'Unable to verify activation link. Please try again.' };
      }
    }

    // Legacy path: single-use server activation. The RPC burns the token
    // and returns the phone — then staff sign in WITH their password so
    // they hold a real session ( anon table reads can't work under RLS).
    const { data, error: rpcErr } = await supabase.rpc('activate_pos_account', { p_token: token });
    if (rpcErr) {
      console.error('Activation failed:', rpcErr.message);
      return { error: /invalid|expired/i.test(rpcErr.message) ? rpcErr.message : 'Unable to verify activation link. Please try again.' };
    }
    const phone = (data as { phone?: string } | null)?.phone ?? '';
    if (phone) savePhone(phone);
    // No auto sign-in: the password is required to create the session.
    return { error: null, phone };
  }

  async function signOut() {
    localStorage.removeItem(SESSION_KEY);
    try {
      localStorage.removeItem('branchport-pos-token');
      localStorage.removeItem('branchport-pos-user');
    } catch { /* noop */ }
    clearSavedPhone();
    setAuthUserId(null);
    setProfile(null);
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ loading, authUserId, profile, signInWithPhone, activateAccount, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
