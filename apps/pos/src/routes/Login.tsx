import { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, loadSavedPhone } from '../contexts/AuthContext';

function EyeIcon({ off }: { off?: boolean }) {
  return off ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 11-4.24-4.24" />
      <path d="M2 2l20 20" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}

export default function Login() {
  const { signInWithPhone, authUserId, profile, activateAccount } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
    if (authUserId && (profile?.role === 'staff' || profile?.role === 'manager') && profile.branch_id) {
      navigate('/', { replace: true });
    }
  }, [authUserId, profile, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    const { error } = await signInWithPhone(phone, password || undefined);

    setSubmitting(false);
    if (error) setError(error);
    // Success navigates via the effect above.
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

      // Activate POS access from the token (handled by AuthContext).
      // The server burns the single-use token and opens a session.
      const result = await activateAccount(token);
      if (result.error) {
        setActivationError(result.error);
        setActivating(false);
        return;
      }

      setActivating(false);
      setShowActivation(false);
      setActivationUrl('');
      if (result.phone) setPhone(result.phone);
      setNotice('Activated! Now sign in below with your phone number + password.');
    } catch {
      setActivationError('Invalid URL. Paste the full activation link from WhatsApp.');
    }

    setActivating(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-7">
          <div className="inline-grid h-14 w-14 place-items-center rounded-2xl shadow-lg mb-4" style={{ background: 'var(--ghana-green)', boxShadow: '0 12px 28px rgba(0,107,63,0.25)' }}>
            <span className="text-xl font-black leading-none text-white">★</span>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">BranchPort POS</p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-gray-900">Till sign in</h1>
          <p className="mt-1 text-sm text-gray-500">Your branch, ready to sell</p>
        </div>

        <div className="rounded-3xl border border-gray-200/80 bg-white p-6 shadow-[0_8px_30px_rgba(17,24,39,0.08)] sm:p-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="pos-phone" className="label">Phone number</label>
              <input
                id="pos-phone"
                type="tel"
                required
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="054 354 7819"
                inputMode="tel"
                className="input w-full !py-3.5 !text-base"
              />
              <p className="mt-1.5 text-xs text-gray-400">The number your manager registered for you</p>
            </div>

            <div>
              <label htmlFor="pos-password" className="label">Password</label>
              <div className="relative">
                <input
                  id="pos-password"
                  type={showPw ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="From your invite message"
                  className="input w-full !py-3.5 !text-base pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <EyeIcon off={showPw} />
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-red-500 text-[11px] font-bold text-white">!</span>
                <p className="text-sm leading-snug text-red-800">{error}</p>
              </div>
            )}

            {notice && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-[11px] font-bold text-white">✓</span>
                <p className="text-sm leading-snug text-emerald-800">{notice}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-2xl py-4 text-base font-bold text-white transition-all disabled:opacity-60 active:scale-[0.99]"
              style={{ background: 'var(--ghana-green)' }}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Signing in…
                </span>
              ) : (
                'Sign in to till'
              )}
            </button>
          </form>

          <div className="mt-5 border-t border-gray-100 pt-4">
            {!showActivation ? (
              <button
                type="button"
                onClick={() => setShowActivation(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-200 py-3 text-sm font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700"
              >
                <LinkIcon />
                New here? Paste activation link
              </button>
            ) : (
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <LinkIcon />
                  Paste activation link
                </p>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={activationUrl}
                    onChange={(e) => setActivationUrl(e.target.value)}
                    placeholder="https://…/activate?token=…"
                    className="input min-w-0 flex-1"
                  />
                  <button
                    onClick={handleActivate}
                    disabled={activating || !activationUrl.trim()}
                    className="shrink-0 rounded-xl bg-gray-900 px-5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {activating ? '…' : 'Go'}
                  </button>
                </div>
                {activationError && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5">
                    <span className="text-red-500">⚠</span>
                    <p className="text-xs leading-snug text-red-700">{activationError}</p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => { setShowActivation(false); setActivationUrl(''); setActivationError(null); }}
                  className="w-full py-1 text-center text-xs text-gray-400 hover:text-gray-600"
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
