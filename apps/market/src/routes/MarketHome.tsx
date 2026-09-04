import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPlatformStats, getMarketTicker, type PlatformStats, type MarketTicker } from '../lib/api';

function ghs(n: number): string {
  return `GHS ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const TREND_ICON = { rising: '▲', falling: '▼', stable: '—' };
const TREND_COLOR = { rising: 'text-green-400', falling: 'text-red-400', stable: 'text-gray-500' };

export default function MarketHome() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [ticker, setTicker] = useState<MarketTicker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [s, t] = await Promise.all([getPlatformStats(), getMarketTicker()]);
      setStats(s);
      setTicker(t);
      setLoading(false);
    }
    void load();
    // Refresh every 30 seconds for live data
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-pulse text-4xl mb-4">📈</div>
          <p className="text-gray-500">Loading market data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">📈 Market Stock Analytics</h1>
          <p className="page-sub">Real-time intelligence across all shops on BranchPort</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-gray-500">Live</span>
        </div>
      </div>

      {/* ── PLATFORM STATS ── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          <StatCard label="Total Users" value={String(stats.total_users)} icon="👥" />
          <StatCard label="Businesses" value={String(stats.total_businesses)} icon="🏪" />
          <StatCard label="Products" value={String(stats.total_products)} icon="📦" />
          <StatCard label="Sales (30d)" value={String(stats.total_sales_30d)} icon="💳" />
          <StatCard label="Revenue (30d)" value={ghs(stats.total_revenue_30d)} icon="💰" accent />
          <StatCard label="New Signups (7d)" value={String(stats.new_signups_7d)} icon="🆕" />
          <StatCard label="Active Users (7d)" value={String(stats.active_users_7d)} icon="⚡" />
          <StatCard label="Branches" value={String(stats.total_branches)} icon="🏬" />
          <StatCard label="Avg Session" value={`${stats.avg_session_duration}m`} icon="⏱" />
          <StatCard label="Market Health" value="Active" icon="🟢" color="text-green-600" />
        </div>
      )}

      {/* ── LIVE MARKET TICKER ── */}        <div className="card overflow-hidden mb-6 sm:mb-8">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">Live Market Ticker</p>
            <p className="text-xs text-gray-500">Real-time prices · updated every 30s</p>
          </div>
          <Link to="/live" className="text-xs text-gray-500 hover:text-gray-700">Full chart →</Link>
        </div>
        <div className="overflow-x-auto">              <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm min-w-[500px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500">Item</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Price</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">24h Δ</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">7d Δ</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Volume</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">24h Range</th>
              </tr>
            </thead>
            <tbody>
              {ticker.map((t) => (
                <tr key={t.product_name} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-3 sm:px-6 py-2.5 sm:py-3">
                    <p className="font-medium text-xs sm:text-sm">{t.product_name}</p>
                  </td>
                  <td className="px-3 sm:px-6 py-2.5 sm:py-3 text-right tabular-nums font-semibold text-xs sm:text-sm">{ghs(t.current_price)}</td>
                  <td className={`px-3 sm:px-6 py-2.5 sm:py-3 text-right tabular-nums font-medium text-xs sm:text-sm ${TREND_COLOR[t.change_24h > 0 ? 'rising' : t.change_24h < 0 ? 'falling' : 'stable']}`}>
                    {TREND_ICON[t.change_24h > 0 ? 'rising' : t.change_24h < 0 ? 'falling' : 'stable']}{' '}
                    {t.change_24h > 0 ? '+' : ''}{t.change_24h}%
                  </td>
                  <td className={`px-6 py-3 text-right tabular-nums font-medium ${TREND_COLOR[t.change_7d > 0 ? 'rising' : t.change_7d < 0 ? 'falling' : 'stable']}`}>
                    {t.change_7d > 0 ? '+' : ''}{t.change_7d}%
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums text-gray-500">{t.volume_24h}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-xs text-gray-500">
                    {ghs(t.low_24h)} – {ghs(t.high_24h)}
                  </td>
                </tr>
              ))}
            </tbody>              </table>
              </div>
        </div>
      </div>

      {/* ── QUICK LINKS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { to: '/users', label: '👥 User Directory', desc: 'All registered users, their data, items sold', color: 'border-l-blue-500' },
          { to: '/items', label: '📦 Items Tracker', desc: 'Every item on the market, prices, trends', color: 'border-l-green-500' },
          { to: '/live', label: '📈 Live Market Graph', desc: 'Binance-style moving stock prices', color: 'border-l-purple-500' },
          { to: '/analytics', label: '⏱ Usage Analytics', desc: 'Signups, active users, session data', color: 'border-l-amber-500' },
          { to: '/reports', label: '📄 Business Reports', desc: 'Exportable analytics and insights', color: 'border-l-teal-500' },
        ].map((link) => (
          <Link key={link.to} to={link.to} className={`card-hover p-5 border-l-4 ${link.color} group`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">{link.label}</p>
              <span className="h-6 w-6 rounded-full border border-gray-200 grid place-items-center text-gray-400 group-hover:border-gray-400 group-hover:text-gray-700 transition-colors">→</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">{link.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, accent, color }: {
  label: string; value: string; icon: string; accent?: boolean; color?: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? 'bg-gray-900 text-white border-gray-800' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <p className={`text-xs font-semibold uppercase tracking-wide ${accent ? 'text-gray-400' : 'text-gray-500'}`}>
          {label}
        </p>
      </div>
      <p className={`text-xl font-bold tabular-nums ${color ?? (accent ? 'text-white' : 'text-gray-900')}`}>
        {value}
      </p>
    </div>
  );
}
