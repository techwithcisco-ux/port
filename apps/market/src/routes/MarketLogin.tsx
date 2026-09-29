import { useState } from 'react';
import { useMarketAuth } from '../contexts/AuthContext';

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

export default function MarketLogin() {
  const { login } = useMarketAuth();
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Verified server-side (MARKET_ADMIN_PASS on branchport-api) and
    // exchanged for a 12h platform JWT.
    const { error: loginError } = await login(password);
    setLoading(false);

    if (loginError) {
      setError(loginError);
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-7">
          <div className="inline-grid h-14 w-14 place-items-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 mb-4">
            <span className="text-2xl leading-none">📈</span>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">BranchPort Market</p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-white">Admin access</h1>
          <p className="mt-1 text-sm text-gray-400">Stock intelligence, platform-wide</p>
        </div>

        <div className="rounded-3xl border border-gray-800 bg-gray-900 p-6 shadow-2xl sm:p-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="market-password" className="mb-1.5 block text-xs font-medium text-gray-400">
                Admin password
              </label>
              <div className="relative">
                <input
                  id="market-password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  autoFocus
                  autoComplete="current-password"
                  className="input mt-0 w-full pr-11 !border-gray-700 !bg-gray-800 !text-white placeholder:!text-gray-500 focus:!border-emerald-400/50 focus:!ring-emerald-400/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gray-500 hover:bg-gray-700 hover:text-gray-200"
                >
                  <EyeIcon off={showPw} />
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!password.trim() || loading}
              className="btn btn-green w-full !py-3.5 text-[15px] font-semibold"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verifying…
                </span>
              ) : (
                'Access dashboard'
              )}
            </button>
          </form>

          <div className="mt-5 border-t border-gray-800 pt-4 text-center">
            <p className="text-[11px] text-gray-600">
              Connected to <span className="text-gray-400">BranchPort</span> platform
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-gray-600">
          🔒 Unauthorized access is prohibited.
        </p>
      </div>
    </div>
  );
}
