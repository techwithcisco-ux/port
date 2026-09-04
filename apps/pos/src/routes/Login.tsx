import { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, loadSavedPhone } from '../contexts/AuthContext';

export default function Login() {
  const { signInWithPhone, authUserId, profile, activateAccount } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Activation link paste state
  const [showActivation, setShowActivation] = useState(false);
  const [activationUrl, setActivationUrl] = useState('');
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);

  // Auto-fill from saved phone number
  useEffect(() => {
    const saved = loadSavedPhone();
    if (saved) setPhone(saved);
  }, []);

  useEffect(() => {
    if (authUserId && profile?.role === 'staff' && profile.branch_id) {
      navigate('/', { replace: true });
    }
  }, [authUserId, profile, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error } = await signInWithPhone(phone);

    setSubmitting(false);
    if (error) setError(error);
  }

  // Handle pasted activation link
  async function handleActivate() {
    if (!activationUrl.trim()) return;
    setActivating(true);
    setActivationError(null);

    try {
      // Parse the activation URL to extract params
      const url = new URL(activationUrl.trim());
      const token = url.searchParams.get('token');

      if (!token) {
        setActivationError('Invalid activation link — no token found.');
        setActivating(false);
        return;
      }

      // Activate POS access from the token (handled by AuthContext)
      const result = await activateAccount(token);
      if ('error' in result) {
        setActivationError(result.error);
        setActivating(false);
        return;
      }

      // Navigate home — activation auto signs in via AuthContext
      navigate('/', { replace: true });
    } catch {
      setActivationError('Invalid URL. Paste the full activation link from WhatsApp.');
    }

    setActivating(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{background: 'var(--cream)'}}>
      <div className="bg-white shadow-xl rounded-3xl w-full max-w-sm space-y-0 overflow-hidden">
        {/* Ghana flag stripe */}
        <div className="ghana-stripe"><div className="red" /><div className="gold" /><div className="green" /></div>
        <div className="p-8 space-y-6">
        {/* Brand — Ghana cultural */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl mb-4" style={{background: 'var(--ghana-gold)'}}>
            <span className="text-2xl font-bold" style={{color: 'var(--ghana-black)'}}>★</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">🇬🇭 BranchPort</h1>
          <p className="text-sm mt-1" style={{color: 'var(--ghana-green)'}}>Akwaaba — Point of Sale</p>
        </div>

        {/* Phone input — large, visual, icon-prefixed */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="3" />
                  <path d="M12 18h.01" />
                </svg>
              </span>
              <input
                type="tel"
                required
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone number"
                inputMode="tel"
                className="w-full pl-12 pr-4 py-4 text-lg border-2 border-gray-200 rounded-2xl bg-gray-50 focus:outline-none focus:border-gray-900 focus:bg-white transition-colors"
              />
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">Your manager registered this number for you</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <span className="text-red-500">⚠</span>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <button type="submit" disabled={submitting} className="w-full text-white rounded-2xl py-4 text-lg font-bold disabled:opacity-60 min-h-[56px]" style={{background: 'var(--ghana-green)'}}>
            {submitting ? 'Signing in…' : '★ Bra / Sign In'}
          </button>
        </form>

        {/* ── Activation link section — visual, icon-first ── */}
        <div className="border-t border-gray-100 pt-4">
          {!showActivation ? (
            <button
              type="button"
              onClick={() => setShowActivation(true)}
              className="w-full flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-700 py-3 rounded-xl border border-dashed border-gray-200 hover:border-gray-400 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
              </svg>
              New here? Paste activation link
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                </svg>
                <span className="font-medium">Paste activation link</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={activationUrl}
                  onChange={(e) => setActivationUrl(e.target.value)}
                  placeholder="https://...activate?token=..."
                  className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:outline-none focus:border-gray-900 focus:bg-white"
                />
                <button
                  onClick={handleActivate}
                  disabled={activating || !activationUrl.trim()}
                  className="px-5 py-3 bg-gray-900 text-white rounded-xl text-sm font-medium disabled:opacity-50 min-h-[48px]"
                >
                  {activating ? '…' : 'Go'}
                </button>
              </div>
              {activationError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  <span className="text-red-500">⚠</span>
                  <p className="text-xs text-red-700">{activationError}</p>
                </div>
              )}
              <button
                type="button"
                onClick={() => { setShowActivation(false); setActivationUrl(''); setActivationError(null); }}
                className="w-full text-center text-xs text-gray-400 hover:text-gray-600 py-2"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Ensure a user exists in this device's localStorage from activation URL data.
 */
function ensureUserExists(userData: {
  id: string;
  name: string;
  phone: string;
  branch_id: string | null;
  business_id: string;
  role: string;
}, token: string) {
  const STORAGE_KEY = 'branchport-demo-users-v2';
  let users: Array<Record<string, unknown>> = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) users = JSON.parse(raw);
  } catch { /* empty */ }

  const existing = users.find((u) => u.id === userData.id);
  if (!existing) {
    users.push({
      ...userData,
      password_hash: null,
      pos_activated: false,
      pos_activation_token: token,
      created_at: new Date().toISOString(),
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  } else if (!existing.pos_activation_token) {
    existing.pos_activation_token = token;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  }
}
