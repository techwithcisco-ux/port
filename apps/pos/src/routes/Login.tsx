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
    // The till accepts every role that has a branch, so a successful
    // sign-in goes straight to it. RequireAuth sends branch-less accounts
    // back here, so navigating them would create an endless /login ↔ /
    // bounce — show a notice instead.
    if (!authUserId || !profile) return;
    if (profile.branch_id) {
      navigate('/', { replace: true });
    } else {
      setNotice('This account has no branch assigned. Ask your manager to set one.');
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
    <div className="min-h-screen bg-cream flex flex-col">
      {/* Brand band — matches the dashboard chrome so the till reads as
          the same product rather than a different app. */}
      <header className="bg-ink text-white">
        <div className="ghana-stripe"><div className="red" /><div className="gold" /><div className="green" /></div>
        <div className="flex items-center gap-2.5 px-5 py-3.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-ghana-gold text-base font-black leading-none text-ink">
            B
          </div>
          <div>
            <p className="text-sm font-bold leading-none tracking-[-0.02em]">BranchPort POS</p>
            <p className="mt-1 text-[10px] font-medium tracking-wide text-gray-400">
              Your branch, ready to sell
            </p>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-sm">
          <div className="page-enter mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-faint">Till sign in</p>
            <h1 className="mt-2 text-[1.75rem] font-bold leading-[1.15] tracking-[-0.03em] text-ink">
              Sign in to sell
            </h1>
            <p className="mt-1.5 text-[15px] text-ink-mute">Sales queue on this device until you reconnect.</p>
          </div>

          <div className="card p-6 sm:p-7">
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
                <p className="mt-1.5 text-xs text-ink-faint">The number your manager registered for you</p>
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
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-faint hover:bg-sand-100 hover:text-ink"
                  >
                    <EyeIcon off={showPw} />
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 rounded-xl border border-ghana-red/20 px-4 py-3" style={{ background: 'var(--red-tint)' }}>
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ghana-red text-[11px] font-bold text-white">!</span>
                  <p className="text-sm leading-snug text-ghana-red">{error}</p>
                </div>
              )}

              {notice && (
                <div className="flex items-start gap-2.5 rounded-xl border px-4 py-3" style={{ background: 'var(--green-tint)', borderColor: 'rgba(0,107,63,0.2)' }}>
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ghana-green text-[11px] font-bold text-white">✓</span>
                  <p className="text-sm leading-snug text-ghana-green">{notice}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary w-full !py-4 !text-base !font-bold"
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

            <div className="mt-5 border-t border-line pt-4">
              {!showActivation ? (
                <button
                  type="button"
                  onClick={() => setShowActivation(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong py-3 text-sm font-medium text-ink-mute hover:border-ink-faint hover:text-ink"
                >
                  <LinkIcon />
                  New here? Paste activation link
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
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
                      className="btn btn-primary shrink-0"
                    >
                      {activating ? '…' : 'Go'}
                    </button>
                  </div>
                  {activationError && (
                    <div className="flex items-start gap-2 rounded-xl border border-ghana-red/20 px-3 py-2.5" style={{ background: 'var(--red-tint)' }}>
                      <span className="text-ghana-red">⚠</span>
                      <p className="text-xs leading-snug text-ghana-red">{activationError}</p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => { setShowActivation(false); setActivationUrl(''); setActivationError(null); }}
                    className="w-full py-1 text-center text-xs text-ink-faint hover:text-ink-mute"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          <p className="mt-6 text-center text-[11px] text-ink-faint">
            Offline sales queue on this device and sync when you reconnect.
          </p>
        </div>
      </main>
    </div>
  );
}
