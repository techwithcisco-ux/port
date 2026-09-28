import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { AppUser } from '@branchport/shared';
import { supabase, isApiMode, apiBaseUrl } from '../lib/supabase';

interface AuthState {
  loading: boolean;
  authUserId: string | null;
  profile: AppUser | null;
  /** POS sign-in — phone + password on the Render API (password optional
   *  for legacy staff rows created before passwords existed). */
  signInWithPhone: (phone: string, password?: string) => Promise<{ error: string | null; passwordRequired?: boolean; limited?: boolean }>;
  /** Activate POS access from an activation link token. */
  activateAccount: (token: string) => Promise<{ error: string | null; user?: AppUser }>;
  signOut: () => Promise<void>;
}

const SESSION_KEY = 'branchport-pos-session';
const SAVED_PHONE_KEY = 'branchport-pos-saved-phone';

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
    // Render API mode: the JWT + profile are cached by the login calls
    // below, so boot straight from cache (no extra round-trip).
    if (isApiMode) {
      try {
        const raw = localStorage.getItem('branchport-pos-user');
        if (raw) {
          const cached = JSON.parse(raw) as AppUser;
          setAuthUserId(cached.id);
          setProfile(cached);
          setLoading(false);
          return;
        }
      } catch { /* corrupt cache — fall through to login */ }
      setLoading(false);
      return;
    }
    const savedSession = localStorage.getItem(SESSION_KEY);
    if (savedSession) {
      const userId = savedSession;
      setAuthUserId(userId);
      loadProfile(userId).finally(() => setLoading(false));
      return;
    }

    setLoading(false);
  }, []);

  /** POS sign-in. Render API path uses phone + password (JWT); legacy
   *  Supabase path keeps the original passwordless phone lookup. */
  async function signInWithPhone(phone: string, password?: string) {
    const cleanPhone = normalisePhone(phone);
    if (!cleanPhone) {
      return { error: 'Phone number is required.' };
    }

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
          return { error: body.error || 'Unable to verify phone number. Please try again.' };
        }
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

    // Legacy Supabase passwordless lookup
    const { data: users, error: queryErr } = await supabase
      .from('users')
      .select('*')
      .eq('phone', cleanPhone)
      .limit(1);

    if (queryErr) {
      console.error('Phone lookup failed:', queryErr.message);
      return { error: 'Unable to verify phone number. Please try again.' };
    }

    if (!users || users.length === 0) {
      return { error: 'No account found for this phone number. Ask your manager to register you first.' };
    }

    const user = users[0] as AppUser;

    // Verify the user has staff or manager role (POS is for staff/manager only)
    if (user.role !== 'staff' && user.role !== 'manager') {
      return { error: 'This account does not have POS access.' };
    }

    // Auto sign-in — LIMITED mode: with no Supabase Auth session the
    // server rejects every synced write (RLS), so sales stay on-device
    // until staff sign in with their activation link + password.
    localStorage.setItem(SESSION_KEY, user.id);
    setAuthUserId(user.id);
    setProfile(user);
    savePhone(cleanPhone);

    return { error: null, limited: true };
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

    // Legacy Supabase lookup
    const { data: users, error: queryErr } = await supabase
      .from('users')
      .select('*')
      .eq('pos_activation_token', token)
      .limit(1);

    if (queryErr) {
      console.error('Token lookup failed:', queryErr.message);
      return { error: 'Unable to verify activation link. Please try again.' };
    }

    if (!users || users.length === 0) {
      return { error: 'Invalid or expired activation link. Ask your manager for a new one.' };
    }

    const user = users[0] as AppUser;

    // Mark POS as activated
    const { error: updateErr } = await supabase
      .from('users')
      .update({ pos_activated: true })
      .eq('id', user.id);

    if (updateErr) {
      console.error('Activation update failed:', updateErr.message);
      return { error: 'Failed to activate POS access. Please try again.' };
    }

    // Auto sign-in after activation
    const activatedUser = { ...user, pos_activated: true } as AppUser;
    localStorage.setItem(SESSION_KEY, activatedUser.id);
    setAuthUserId(activatedUser.id);
    setProfile(activatedUser);
    savePhone(activatedUser.phone ?? '');

    return { error: null, user: activatedUser };
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
