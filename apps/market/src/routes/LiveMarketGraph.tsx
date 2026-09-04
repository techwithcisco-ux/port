import { useEffect, useState } from 'react';
import { getMarketTicker, type MarketTicker } from '../lib/api';

function ghs(n: number): string {
  return `GHS ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const TREND_COLOR = { rising: 'text-green-400', falling: 'text-red-400', stable: 'text-gray-400' };

// Simple sparkline SVG
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 80;
  const h = 24;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function LiveMarketGraph() {
  const [ticker, setTicker] = useState<MarketTicker[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    async function load() {
      const data = await getMarketTicker();
      setTicker(data);
      setLastUpdate(new Date());
      setLoading(false);
    }
    void load();
    const interval = setInterval(load, 15000); // Refresh every 15 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-pulse text-4xl mb-4">📈</div>
          <p className="text-gray-500">Loading live market data…</p>
        </div>
      </div>
    );
  }

  const sorted = [...ticker].sort((a, b) => Math.abs(b.change_24h) - Math.abs(a.change_24h));
  const gainers = sorted.filter((t) => t.change_24h > 0);
  const losers = sorted.filter((t) => t.change_24h < 0);

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">📈 Live Market</h1>
          <p className="page-sub">Real-time item prices · Binance-style ticker board</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-gray-500">
            Last update: {lastUpdate.toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* ── TOP MOVERS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        {/* Gainers */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-green-50/50">
            <p className="text-sm font-semibold text-green-800">▲ Top Gainers</p>
          </div>
          <div className="divide-y">
            {gainers.slice(0, 5).map((t) => (
              <div key={t.product_name} className="px-5 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{t.product_name}</p>
                  <p className="text-xs text-gray-500">{t.volume_24h} trades today</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{ghs(t.current_price)}</p>
                  <p className={`text-xs font-bold ${TREND_COLOR.rising}`}>+{t.change_24h}%</p>
                </div>
                <Sparkline data={t.sparkline} color="#22c55e" />
              </div>
            ))}
            {gainers.length === 0 && (
              <p className="p-5 text-sm text-gray-400">No gainers today</p>
            )}
          </div>
        </div>

        {/* Losers */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-red-50/50">
            <p className="text-sm font-semibold text-red-700">▼ Top Losers</p>
          </div>
          <div className="divide-y">
            {losers.slice(0, 5).map((t) => (
              <div key={t.product_name} className="px-5 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{t.product_name}</p>
                  <p className="text-xs text-gray-500">{t.volume_24h} trades today</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{ghs(t.current_price)}</p>
                  <p className={`text-xs font-bold ${TREND_COLOR.falling}`}>{t.change_24h}%</p>
                </div>
                <Sparkline data={t.sparkline} color="#ef4444" />
              </div>
            ))}
            {losers.length === 0 && (
              <p className="p-5 text-sm text-gray-400">No losers today</p>
            )}
          </div>
        </div>
      </div>

      {/* ── FULL TICKER BOARD ── */}        <div className="card overflow-hidden">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
          <p className="text-sm font-semibold text-gray-900">Full Market Board</p>
          <p className="text-xs text-gray-500">All tracked items · real-time pricing</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500">#</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500">Item</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Price</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">24h Change</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">7d Change</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Volume (24h)</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">24h High</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">24h Low</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Chart</th>
              </tr>
            </thead>
            <tbody>
              {ticker.map((t, i) => {
                const trend = t.change_24h > 0 ? 'rising' : t.change_24h < 0 ? 'falling' : 'stable';
                return (
                  <tr key={t.product_name} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 text-gray-400 tabular-nums">{i + 1}</td>
                    <td className="px-6 py-3">
                      <p className="font-medium">{t.product_name}</p>
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums font-bold text-base">{ghs(t.current_price)}</td>
                    <td className={`px-6 py-3 text-right tabular-nums font-semibold ${TREND_COLOR[trend]}`}>
                      {trend === 'rising' ? '+' : ''}{t.change_24h}%
                    </td>
                    <td className={`px-6 py-3 text-right tabular-nums font-medium ${t.change_7d > 0 ? 'text-green-600' : t.change_7d < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                      {t.change_7d > 0 ? '+' : ''}{t.change_7d}%
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-gray-500">{t.volume_24h}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-gray-500">{ghs(t.high_24h)}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-gray-500">{ghs(t.low_24h)}</td>
                    <td className="px-6 py-3 text-right">
                      <Sparkline data={t.sparkline} color={trend === 'rising' ? '#22c55e' : trend === 'falling' ? '#ef4444' : '#9ca3af'} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
