import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import BackButton from '../../components/BackButton';
import DashboardLayout from '../../components/DashboardLayout';
import {
  getMarketStats,
  getCommodities,
  getPriceMovements,
  getShopProfiles,
  generateMarketReport,
  type MarketStats,
  type CommodityItem,
  type PriceMovement,
  type ShopProfile,
  type MarketReport,
} from '../../lib/intelligence';

function ghs(n: number): string {
  return `GHS ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const TREND_ICON = { rising: '▲', falling: '▼', stable: '—' };
const TREND_COLOR = { rising: 'text-green-700', falling: 'text-red-600', stable: 'text-gray-400' };
const VOL_COLOR = { low: 'bg-green-50 text-green-700', medium: 'bg-amber-50 text-amber-700', high: 'bg-red-50 text-red-700' };

export default function MarketIntelligence() {
  const [stats, setStats] = useState<MarketStats | null>(null);
  const [commodities, setCommodities] = useState<CommodityItem[]>([]);
  const [movements, setMovements] = useState<PriceMovement[]>([]);
  const [shops, setShops] = useState<ShopProfile[]>([]);
  const [report, setReport] = useState<MarketReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'commodities' | 'prices' | 'shops' | 'report'>('overview');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [s, c, p, sh, r] = await Promise.all([
        getMarketStats(),
        getCommodities(),
        getPriceMovements(),
        getShopProfiles(),
        generateMarketReport(),
      ]);
      setStats(s);
      setCommodities(c);
      setMovements(p);
      setShops(sh);
      setReport(r);
      setLoading(false);
    }
    void load();
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
      <BackButton />
      <div>
          <p className="text-gray-500">Loading market intelligence…</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="page-title">Market Intelligence</h1>
            <p className="page-sub">
              Cross-market analytics across all shops on BranchPort
            </p>
          </div>
          <Link
            to="/owner"
            className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200"
          >
            ← Dashboard
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
          {([
            ['overview', 'Overview'],
            ['commodities', 'Commodities'],
            ['prices', 'Price Tracker'],
            ['shops', 'Shop Directory'],
            ['report', 'Market Report'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ═══ OVERVIEW ═══════════════════════════════════════════════════════ */}
        {tab === 'overview' && stats && (
          <>
            {/* Market pulse */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
              <StatCard label="Total Shops" value={String(stats.total_shops)} sub="on the platform" />
              <StatCard label="Market Volume" value={String(stats.total_sales_30d)} sub="units sold (30d)" />
              <StatCard label="Market Revenue" value={ghs(stats.total_revenue_30d)} sub="total (30d)" accent />
              <StatCard label="Avg Price Change" value={`${stats.avg_price_change_7d > 0 ? '+' : ''}${stats.avg_price_change_7d}%`} sub="7-day average" />
              <StatCard label="Rising" value={String(stats.rising_count)} sub="commodities" color="text-green-700" />
              <StatCard label="Falling" value={String(stats.falling_count)} sub="commodities" color="text-red-600" />
              <StatCard label="Most Traded" value={stats.most_traded} sub="by volume" />
              <StatCard label="Top Category" value={stats.top_category} sub="by revenue" />
            </div>

            {/* Quick commodity list */}
            <div className="card overflow-hidden mb-6">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Top commodities</p>
                  <p className="text-xs text-gray-500">By revenue in the last 30 days</p>
                </div>
                <button onClick={() => setTab('commodities')} className="text-xs text-gray-500 hover:text-gray-700">
                  View all →
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500">Commodity</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Avg Price</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Sold</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Revenue</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Shops</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commodities.slice(0, 8).map((c) => (
                      <tr key={c.product_name} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-6 py-3 font-medium">{c.product_name}</td>
                        <td className="px-6 py-3 text-right tabular-nums">{ghs(c.avg_price)}</td>
                        <td className="px-6 py-3 text-right tabular-nums">{c.total_sold_30d.toLocaleString()}</td>
                        <td className="px-6 py-3 text-right tabular-nums font-medium">{ghs(c.total_revenue_30d)}</td>
                        <td className="px-6 py-3 text-right">{c.shop_count}</td>
                        <td className={`px-6 py-3 text-right font-medium ${TREND_COLOR[c.price_trend as 'rising' | 'falling' | 'stable']}`}>
                          {TREND_ICON[c.price_trend as 'rising' | 'falling' | 'stable']} {c.trend_pct > 0 ? '+' : ''}{c.trend_pct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Shop leaderboard */}
            <div className="card overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Shop leaderboard</p>
                  <p className="text-xs text-gray-500">Ranked by 30-day revenue</p>
                </div>
                <button onClick={() => setTab('shops')} className="text-xs text-gray-500 hover:text-gray-700">
                  View all →
                </button>
              </div>
              <div className="divide-y">
                {shops.sort((a, b) => b.total_revenue_30d - a.total_revenue_30d).slice(0, 5).map((s, i) => (
                  <div key={s.business_id} className="px-6 py-3 flex items-center gap-4">
                    <span className="text-lg font-bold text-gray-300 w-6 text-center">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{s.business_name}</p>
                      <p className="text-xs text-gray-500">{s.branch_count} branch{s.branch_count !== 1 ? 'es' : ''} · {s.product_count} products</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{ghs(s.total_revenue_30d)}</p>
                      <p className="text-xs text-gray-500">{s.total_sales_30d} sales</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ═══ COMMODITIES ═══════════════════════════════════════════════════ */}
        {tab === 'commodities' && (
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <p className="text-sm font-semibold text-gray-900">All commodities</p>
              <p className="text-xs text-gray-500">Tracked across {stats?.total_shops ?? 0} shops · 30-day window</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500">Commodity</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500">Category</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Avg Price</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Range</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Sold</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Revenue</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Shops</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {commodities.map((c) => (
                    <tr key={c.product_name} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium">{c.product_name}</td>
                      <td className="px-6 py-3 text-gray-500 text-xs">{c.category}</td>
                      <td className="px-6 py-3 text-right tabular-nums">{ghs(c.avg_price)}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-xs text-gray-500">
                        {ghs(c.min_price)} – {ghs(c.max_price)}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums">{c.total_sold_30d.toLocaleString()}</td>
                      <td className="px-6 py-3 text-right tabular-nums font-medium">{ghs(c.total_revenue_30d)}</td>
                      <td className="px-6 py-3 text-right">{c.shop_count}</td>
                      <td className={`px-6 py-3 text-right font-medium ${TREND_COLOR[c.price_trend as 'rising' | 'falling' | 'stable']}`}>
                        {TREND_ICON[c.price_trend as 'rising' | 'falling' | 'stable']} {c.trend_pct > 0 ? '+' : ''}{c.trend_pct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══ PRICE TRACKER ═════════════════════════════════════════════════ */}
        {tab === 'prices' && (
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <p className="text-sm font-semibold text-gray-900">Price movements</p>
              <p className="text-xs text-gray-500">7-day and 30-day price changes · volatility indicators</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500">Commodity</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Current</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">7d ago</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">30d ago</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">7d Δ</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">30d Δ</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Volatility</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.product_name} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium">{m.product_name}</td>
                      <td className="px-6 py-3 text-right tabular-nums font-semibold">{ghs(m.current_price)}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-gray-500">{ghs(m.prev_price_7d)}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-gray-500">{ghs(m.prev_price_30d)}</td>
                      <td className={`px-6 py-3 text-right tabular-nums font-medium ${m.change_7d_pct > 0 ? 'text-green-700' : m.change_7d_pct < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                        {m.change_7d_pct > 0 ? '+' : ''}{m.change_7d_pct}%
                      </td>
                      <td className={`px-6 py-3 text-right tabular-nums font-medium ${m.change_30d_pct > 0 ? 'text-green-700' : m.change_30d_pct < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                        {m.change_30d_pct > 0 ? '+' : ''}{m.change_30d_pct}%
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${VOL_COLOR[m.volatility as 'low' | 'medium' | 'high']}`}>
                          {m.volatility}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══ SHOP DIRECTORY ════════════════════════════════════════════════ */}
        {tab === 'shops' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {shops.sort((a, b) => b.total_revenue_30d - a.total_revenue_30d).map((s) => (
              <div key={s.business_id} className="card p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">{s.business_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{s.branch_count} branch{s.branch_count !== 1 ? 'es' : ''}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600">
                    {s.business_type}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <p className="text-xs text-gray-500">Revenue (30d)</p>
                    <p className="text-sm font-semibold tabular-nums">{ghs(s.total_revenue_30d)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Sales</p>
                    <p className="text-sm font-semibold tabular-nums">{s.total_sales_30d}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Products</p>
                    <p className="text-sm font-semibold">{s.product_count}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Top item</p>
                    <p className="text-sm font-medium truncate">{s.top_product}</p>
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-400">Joined {new Date(s.joined_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ MARKET REPORT ═════════════════════════════════════════════════ */}
        {tab === 'report' && report && (
          <div className="space-y-6">
            {/* Report header */}
            <div className="card p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-lg font-bold text-gray-900">{report.title}</p>
                  <p className="text-xs text-gray-500 mt-1">Generated {new Date(report.generated_at).toLocaleString()}</p>
                </div>
                <span className="px-3 py-1 rounded-full bg-gray-100 text-xs font-semibold text-gray-700 uppercase">
                  {report.period}
                </span>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">{report.summary}</p>
            </div>

            {/* Report stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Shops Tracked" value={String(report.shop_count)} />
              <StatCard label="Market Volume" value={report.total_market_volume.toLocaleString()} sub="units" />
              <StatCard label="Market Revenue" value={ghs(report.total_market_revenue)} accent />
              <StatCard label="Avg Shop Revenue" value={ghs(report.avg_basket_size)} sub="per shop" />
            </div>

            {/* Rising / Declining */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="card p-5">
                <p className="text-sm font-semibold text-green-800 mb-3">▲ Rising items</p>
                {report.rising_items.length === 0 ? (
                  <p className="text-xs text-gray-400">No items currently rising</p>
                ) : (
                  <ul className="space-y-2">
                    {report.rising_items.map((name: string) => (
                      <li key={name} className="flex items-center justify-between">
                        <span className="text-sm font-medium">{name}</span>
                        <span className="text-xs text-green-700 font-medium">▲ rising</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="card p-5">
                <p className="text-sm font-semibold text-red-700 mb-3">▼ Declining items</p>
                {report.declining_items.length === 0 ? (
                  <p className="text-xs text-gray-400">No items currently declining</p>
                ) : (
                  <ul className="space-y-2">
                    {report.declining_items.map((name: string) => (
                      <li key={name} className="flex items-center justify-between">
                        <span className="text-sm font-medium">{name}</span>
                        <span className="text-xs text-red-600 font-medium">▼ declining</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Top commodities */}
            <div className="card p-5">
              <p className="text-sm font-semibold text-gray-900 mb-3">Top commodities this period</p>
              <div className="flex flex-wrap gap-2">
                {report.top_commodities.map((name: string, i: number) => (
                  <span key={name} className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium">
                    #{i + 1} {name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

// ── Stat card component ────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  color?: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? 'bg-gray-900 text-white border-gray-800' : 'bg-white border-gray-200'}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${accent ? 'text-gray-400' : 'text-gray-500'}`}>
        {label}
      </p>
      <p className={`text-xl font-bold tabular-nums ${color ?? (accent ? 'text-white' : 'text-gray-900')}`}>
        {value}
      </p>
      {sub && <p className={`text-xs mt-1 ${accent ? 'text-gray-400' : 'text-gray-500'}`}>{sub}</p>}
    </div>
  );
}
