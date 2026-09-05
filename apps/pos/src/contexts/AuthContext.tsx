import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { AppUser } from '@branchport/shared';
import { supabase } from '../lib/supabase';

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
    const savedSession = localStorage.getItem(SESSION_KEY);
    if (savedSession) {
      const userId = savedSession;
      setAuthUserId(userId);
      loadProfile(userId).finally(() => setLoading(false));
      return;
    }

    setLoading(false);
  }, []);

  /** Phone-only sign-in for POS. No password needed — the owner already
   *  activated this user's POS access via a unique link. Queries Supabase
   *  directly for the user by phone number. */
  async function signInWithPhone(phone: string) {
    const cleanPhone = normalisePhone(phone);
    if (!cleanPhone) {
      return { error: 'Phone number is required.' };
    }

    // Look up user by phone in Supabase
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

    // Auto sign-in
    localStorage.setItem(SESSION_KEY, user.id);
    setAuthUserId(user.id);
    setProfile(user);
    savePhone(cleanPhone);

    return { error: null };
  }

  /** Activate POS access from an activation link token.
   *  Looks up the user by their activation token in Supabase. */
  async function activateAccount(token: string) {
    // Look up user by activation token
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
