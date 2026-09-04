import { useState, FormEvent, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, loadSavedCredentials } from '../contexts/AuthContext';
import { AdinkraTrust, IconPhone } from '../components/Icons';

export default function Login() {
  const { signInWithPhonePassword, authUserId, profile } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Auto-fill from URL params (invite link) or saved credentials
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlPhone = params.get('phone');
    const urlPassword = params.get('password');
    if (urlPhone && urlPassword) {
      setPhone(urlPhone);
      setPassword(urlPassword);
      setRememberMe(true);
      // Clean the URL so credentials aren't visible in the address bar
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    const saved = loadSavedCredentials();
    if (saved) {
      setPhone(saved.phone);
      setPassword(saved.password);
      setRememberMe(true);
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

  const features: Array<{ icon: React.ReactNode; label: string }> = [
    { icon: <AdinkraTrust size={16} className="text-amber-400/80" />, label: 'Append-only — nothing is ever erased' },
    { icon: <AdinkraTrust size={16} className="text-emerald-400/80" />, label: 'Trust surfaced — flags appear on their own' },
    { icon: <AdinkraTrust size={16} className="text-blue-400/80" />, label: 'One honest record across all branches' },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 page-enter" style={{background: 'var(--cream)'}}>
      <div className="w-full max-w-3xl grid grid-cols-1 md:grid-cols-2 rounded-3xl overflow-hidden shadow-[0_12px_40px_rgba(17,24,39,0.12),0_2px_8px_rgba(17,24,39,0.06)] card-enter">
        <div className="ghana-stripe md:col-span-2" style={{gridColumn: '1 / -1'}}><div className="red" /><div className="gold" /><div className="green" /></div>
        <div className="p-6 sm:p-8 flex flex-col justify-between" style={{background: 'var(--ghana-black)'}}>
          <div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-white/10 ring-1 ring-white/10 grid place-items-center">
                <AdinkraTrust size={20} className="text-white/80" />
              </div>
              <div>
                <p className="font-semibold tracking-tight text-white leading-tight">BranchPort</p>
                <p className="text-[11px] text-gray-400">Management dashboard</p>
              </div>
            </div>

            <p className="mt-10 text-xl font-semibold tracking-tight text-white leading-snug">
              🇬🇭 Akwaaba! <br />
              Every branch. One honest record.
            </p>
            <p className="mt-2 text-sm leading-relaxed" style={{color: 'var(--ghana-gold)'}}>
              Sales, stock, supplier credit and an owner-level audit trail —
              built for the Ghanaian informal market.
            </p>
          </div>

          <ul className="mt-10 space-y-3">
            {features.map((f) => (
              <li key={f.label} className="flex items-start gap-2.5">
                <span className="mt-0.5 h-6 w-6 shrink-0 rounded-lg bg-white/10 grid place-items-center">
                  {f.icon}
                </span>
                <span className="text-sm text-gray-300 leading-snug">
                  {f.label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white p-6 sm:p-8 flex flex-col justify-center">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl mb-3" style={{background: 'var(--ghana-gold)'}}>
              <span className="text-lg font-bold" style={{color: 'var(--ghana-black)'}}>★</span>
            </div>
            <p className="text-lg font-semibold tracking-tight text-gray-900">Sign in — Medaase</p>
            <p className="text-xs text-gray-400 mt-1">Phone number and password</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Phone number</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <IconPhone size={18} />
                </span>
                <input
                  type="tel"
                  required
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="054 354 7819"
                  className="input w-full pl-10"
                />
              </div>
            </div>

            <div>
              <label className="label">Password</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                className="input w-full"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
              />
              <span className="text-sm text-gray-600">Remember my login</span>
            </label>

            {error && <p className="text-sm text-red-800">{error}</p>}

            <button type="submit" disabled={submitting} className="btn btn-primary w-full" style={{background: 'var(--ghana-green)'}}>
              {submitting ? 'Signing in…' : '★ Sign In — Bra / Come In'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link to="/signup" className="text-sm text-gray-600 hover:text-gray-900 font-medium">
              New business? Create an account →
            </Link>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!window.confirm('This will delete ALL saved data on this device (accounts, sales, everything). Continue?')) return;
              const keys = Object.keys(localStorage);
              for (const k of keys) {
                if (k.startsWith('branchport')) localStorage.removeItem(k);
              }
              sessionStorage.clear();
              alert('All data cleared! Page will now refresh.');
              window.location.href = window.location.pathname;
            }}
            className="mt-4 w-full text-center text-[11px] text-red-400 hover:text-red-600 transition-colors py-2 border border-red-200 rounded-lg"
          >
            Clear all data & start fresh
          </button>
        </div>
      </div>
    </div>
  );
}
