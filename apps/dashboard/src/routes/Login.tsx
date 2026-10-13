import { useState, FormEvent, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AuthShell from '../components/AuthShell';

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="3" />
      <path d="M12 18h.01" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2.5" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}

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

export default function Login() {
  const { signInWithPhonePassword, authUserId, profile } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Auto-fill from legacy invite links carrying credentials in the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlPhone = params.get('phone');
    const urlPassword = params.get('password');
    if (urlPhone && urlPassword) {
      setPhone(urlPhone);
      setPassword(urlPassword);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (authUserId && profile) navigate('/', { replace: true });
  }, [authUserId, profile, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signInWithPhonePassword(phone, password);
    setSubmitting(false);
    if (error) setError(error);
  }

  return (
    <AuthShell
      eyebrow="BranchPort Business"
      title="Welcome back"
      subtitle="Sign in to manage your shops, stock and supplier credit."
      footer={
        <Link to="/signup" className="text-sm font-semibold text-ink hover:text-ghana-green">
          New business? Create an account →
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="login-phone" className="label">Phone number</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint">
              <PhoneIcon />
            </span>
            <input
              id="login-phone"
              type="tel"
              required
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="054 354 7819"
              className="input w-full pl-11"
            />
          </div>
        </div>

        <div>
          <label htmlFor="login-password" className="label">Password</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint">
              <LockIcon />
            </span>
            <input
              id="login-password"
              type={showPw ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              className="input w-full pl-11 pr-11"
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

        <button type="submit" disabled={submitting} className="btn btn-primary w-full !py-3.5 text-[15px]">
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Signing in…
            </span>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      <div className="mt-5 border-t border-line pt-5 text-center">
        <button
          type="button"
          onClick={() => {
            if (!window.confirm('This will delete ALL saved data on this device (accounts, sales, everything). Continue?')) return;
            const keys = Object.keys(localStorage);
            for (const k of keys) {
              // `bp-session-*` is the live JWT session — without it the
              // button looked like it worked but the user stayed signed in.
              if (k.startsWith('branchport') || k.startsWith('bp-') || k.startsWith('sb-')) {
                localStorage.removeItem(k);
              }
            }
            sessionStorage.clear();
            alert('All data cleared! Page will now refresh.');
            window.location.href = window.location.pathname;
          }}
          className="rounded-lg px-3 py-2 text-xs text-ink-faint hover:bg-sand-100 hover:text-ink-mute"
        >
          Clear all data on this device
        </button>
      </div>
    </AuthShell>
  );
}
