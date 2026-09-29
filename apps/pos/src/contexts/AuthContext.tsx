import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { AppUser } from '@branchport/shared';
import { api } from '../lib/api';

interface AuthState {
  loading: boolean;
  authUserId: string | null;
  profile: AppUser | null;
  /** POS sign-in — phone, plus the password whenever the account has one.
   *  The server answers `passwordRequired` so the terminal can prompt. */
  signInWithPhone: (phone: string, password?: string) => Promise<{ error: string | null; passwordRequired?: boolean }>;
  /** Activate POS access from an activation link token (single-use). */
  activateAccount: (token: string) => Promise<{ error: string | null; phone?: string }>;
  signOut: () => Promise<void>;
}

const SAVED_PHONE_KEY = 'branchport-pos-saved-phone';

// Login rate-limit: slow brute force on shared branch devices.
let failCount = 0;
let lockedUntil = 0;

function normalisePhone(v: string) {
  return v.replace(/\s+/g, '').replace(/[^+\d]/g, '');
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

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // The ONLY trusted session is a valid JWT — verify it with the
        // server instead of trusting whatever is in localStorage.
        const token = api.auth.getToken();
        if (!token) {
          if (!cancelled) setLoading(false);
          return;
        }
        const res = await api.auth.me();
        if (cancelled) return;
        if (res.ok) {
          setAuthUserId(res.user.id);
          setProfile(res.user as AppUser);
        } else {
          // Bad/expired token — drop it so login is forced. A network
          // failure lands here too: me() can't distinguish, so the till
          // asks for a fresh sign-in rather than trusting a stale session.
          api.auth.logout();
        }
      } catch (e) {
        console.error('POS auth init failed:', (e as Error).message);
        api.auth.logout();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void init();

    // Keep profile in step with sign-outs from other tabs.
    const unsub = api.auth.onChange((event: string) => {
      if (event === 'signed-out') {
        setAuthUserId(null);
        setProfile(null);
      }
    });

    return () => {
      cancelled = true;
      try { unsub(); } catch { /* noop */ }
    };
  }, []);

  /** POS sign-in. Phone + password are ALWAYS required (no passwordless
   *  path); the server also enforces POS-only roles. This adds the branch
   *  check the till itself needs. */
  async function signInWithPhone(phone: string, password?: string) {
    const cleanPhone = normalisePhone(phone);
    if (!cleanPhone) {
      return { error: 'Phone number is required.' };
    }
    if (!password) {
      return { error: 'Password is required. Use the password from your invite message.' };
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

    const res = await api.auth.posLogin(cleanPhone, password);
    if (!res.ok) {
      if (res.passwordRequired) {
        return { error: 'This account needs a password — enter it below.', passwordRequired: true };
      }
      if (/too many attempts/i.test(res.error || '')) {
        return { error: res.error };
      }
      return fail(res.error || 'Unable to verify phone number. Please try again.');
    }

    const user = res.user as AppUser;
    // The till is branch-scoped: no branch, no stock to sell.
    if (!user.branch_id) {
      api.auth.logout();
      return { error: 'This account does not have POS access.' };
    }

    failCount = 0;
    setAuthUserId(user.id);
    setProfile(user);
    savePhone(cleanPhone);
    return { error: null };
  }

  /** Activate POS access from an activation link token. The server burns
   *  the single-use token and returns a fresh session. */
  async function activateAccount(token: string) {
    const res = await api.auth.posActivate(token);
    if (!res.ok) {
      return { error: res.error || 'Invalid or expired activation link.' };
    }
    const user = res.user as AppUser;
    setAuthUserId(user.id);
    setProfile(user);
    savePhone(user.phone ?? '');
    return { error: null, phone: user.phone ?? undefined };
  }

  async function signOut() {
    try { await api.auth.logout(); } catch { /* best effort revoke */ }
    clearSavedPhone();
    setAuthUserId(null);
    setProfile(null);
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
