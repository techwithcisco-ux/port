import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { AppUser } from '@branchport/shared';
import { supabase } from '../lib/supabase';
import { authenticatePOSUser, activatePOS } from '@branchport/shared';

interface AuthState {
  loading: boolean;
  authUserId: string | null;
  profile: AppUser | null;
  /** Phone-only sign-in — no password required. The owner activates POS
   *  access via a unique link; after activation the staff member logs in
   *  with just their phone number. */
  signInWithPhone: (phone: string) => Promise<{ error: string | null }>;
  /** Activate POS access from an activation link token. */
  activateAccount: (token: string) => Promise<{ error: string | null; user?: AppUser }>;
  signOut: () => Promise<void>;
}

const SESSION_KEY = 'branchport-pos-session';
const SAVED_PHONE_KEY = 'branchport-pos-saved-phone';

function normalisePhone(v: string) {
  return v.replace(/\s+/g, '').replace(/[^+\d]/g, '');
}

// Auto-save / load phone number
function savePhone(phone: string) {
  try {
    localStorage.setItem(SAVED_PHONE_KEY, phone);
  } catch { /* quota exceeded */ }
}

function loadSavedPhone(): string | null {
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
    const savedSession = localStorage.getItem(SESSION_KEY);
    if (savedSession) {
      const userId = savedSession;
      setAuthUserId(userId);
      loadProfile(userId).finally(() => setLoading(false));
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user ?? null;
      setAuthUserId(user?.id ?? null);
      if (user) loadProfile(user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setAuthUserId(user?.id ?? null);
      if (user) loadProfile(user.id);
      else setProfile(null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  /** Phone-only sign-in for POS. No password needed — the owner already
   *  activated this user's POS access via a unique link. */
  async function signInWithPhone(phone: string) {
    const cleanPhone = normalisePhone(phone);
    if (!cleanPhone) {
      return { error: 'Phone number is required.' };
    }

    const result = authenticatePOSUser(cleanPhone);
    if ('error' in result) return { error: result.error };

    const user = result.user;
    localStorage.setItem(SESSION_KEY, user.id);
    setAuthUserId(user.id);
    setProfile(user);

    // Save phone for next login
    savePhone(cleanPhone);

    return { error: null };
  }

  /** Activate POS access from an activation link token. */
  async function activateAccount(token: string) {
    const result = activatePOS(token);
    if ('error' in result) return { error: result.error };

    const user = result.user;
    // Auto sign-in after activation
    localStorage.setItem(SESSION_KEY, user.id);
    setAuthUserId(user.id);
    setProfile(user);
    savePhone(user.phone ?? '');

    return { error: null, user };
  }

  async function signOut() {
    localStorage.removeItem(SESSION_KEY);
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

// Export for login page auto-fill
export { loadSavedPhone };
