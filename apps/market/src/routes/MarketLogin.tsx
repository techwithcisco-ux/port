import { useState } from 'react';
import { useMarketAuth } from '../contexts/AuthContext';

export default function MarketLogin() {
  const { login } = useMarketAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Small delay to prevent brute-force feel
    await new Promise((r) => setTimeout(r, 400));

    const ok = login(password);
    setLoading(false);

    if (!ok) {
      setError('Invalid password. Access denied.');
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo & branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
            <span className="text-3xl">📈</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Market Analytics</h1>
          <p className="text-sm text-gray-400 mt-1">Stock Intelligence Platform</p>
        </div>

        {/* Login card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl">
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-300">Admin Access</h2>
            <p className="text-xs text-gray-500 mt-1">
              This dashboard is private. Enter your admin password to continue.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <label className="block">
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                autoFocus
                autoComplete="current-password"
                className="input mt-1.5 w-full"
              />
            </label>

            {error && (
              <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!password.trim() || loading}
              className="btn btn-green mt-5 w-full"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verifying...
                </span>
              ) : (
                'Access Dashboard'
              )}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-gray-800 text-center">
            <p className="text-[11px] text-gray-600">
              Connected to <span className="text-gray-500">BranchPort</span> platform
            </p>
          </div>
        </div>

        {/* Security notice */}
        <p className="text-center text-[10px] text-gray-600 mt-6 leading-relaxed">
          🔒 Unauthorized access is prohibited.<br />
          All access attempts are logged.
        </p>
      </div>
    </div>
  );
}
