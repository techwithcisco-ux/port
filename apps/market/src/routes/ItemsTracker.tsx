import { useEffect, useState } from 'react';
import { getItemsAnalytics, type ItemAnalytics } from '../lib/api';

const TREND_ICON = { rising: '▲', falling: '▼', stable: '—' };
const TREND_COLOR = { rising: 'text-green-700', falling: 'text-red-600', stable: 'text-gray-400' };
const TREND_BG = { rising: 'bg-green-50', falling: 'bg-red-50', stable: 'bg-gray-50' };

function ghs(n: number): string {
  return `GHS ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default function ItemsTracker() {
  const [items, setItems] = useState<ItemAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    getItemsAnalytics().then((data) => {
      setItems(data);
      setLoading(false);
    });
  }, []);

  const categories = ['all', ...new Set(items.map((i) => i.category))];

  const filtered = items.filter((i) => {
    const matchSearch = !search || i.product_name.toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === 'all' || i.category === categoryFilter;
    return matchSearch && matchCat;
  });

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">📦 Items Tracker</h1>
          <p className="page-sub">Every item listed on the market · {items.length} products tracked</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items…"
          className="input flex-1 max-w-sm"
        />
        <div className="seg flex-wrap">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={`pill text-xs ${categoryFilter === c ? 'pill-active' : ''}`}
            >
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-gray-500">Loading items…</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm min-w-[650px]">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500">Item</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500">Category</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Avg Price</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Range</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Sold (30d)</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Revenue</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Shops</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Trend</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const trend = item.price_trend;
                  return (
                    <tr key={item.product_id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-3 sm:px-6 py-2.5 sm:py-3">
                        <p className="font-medium">{item.product_name}</p>
                      </td>
                      <td className="px-6 py-3">
                        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600">
                          {item.category}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums font-semibold">{ghs(item.avg_price)}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-xs text-gray-500">
                        {ghs(item.min_price)} – {ghs(item.max_price)}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums">{item.total_sold.toLocaleString()}</td>
                      <td className="px-6 py-3 text-right tabular-nums font-medium">{ghs(item.total_revenue)}</td>
                      <td className="px-6 py-3 text-right">{item.shop_count}</td>
                      <td className="px-6 py-3 text-right">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${TREND_BG[trend]} ${TREND_COLOR[trend]}`}>
                          {TREND_ICON[trend]} {item.trend_pct > 0 ? '+' : ''}{item.trend_pct}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <p className="p-6 text-center text-gray-500 text-sm">No items match your search.</p>
          )}
        </div>
      )}
    </div>
  );
}
