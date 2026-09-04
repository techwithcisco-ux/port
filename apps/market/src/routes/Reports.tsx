import { useEffect, useState } from 'react';
import { getPlatformStats, getUserDirectory, getItemsAnalytics, type PlatformStats, type UserAnalytics, type ItemAnalytics } from '../lib/api';

export default function Reports() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [users, setUsers] = useState<UserAnalytics[]>([]);
  const [items, setItems] = useState<ItemAnalytics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [s, u, i] = await Promise.all([
        getPlatformStats(),
        getUserDirectory(),
        getItemsAnalytics(),
      ]);
      setStats(s);
      setUsers(u);
      setItems(i);
      setLoading(false);
    }
    void load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-500">Generating reports…</p>
      </div>
    );
  }

  // Build CSV data
  function exportCSV(data: Record<string, unknown>[], filename: string) {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map((row) => headers.map((h) => JSON.stringify(row[h] ?? '')).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const reportDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">📄 Business Reports</h1>
          <p className="page-sub">Exportable analytics data for official business reports</p>
        </div>
      </div>

      {/* ── PLATFORM SUMMARY REPORT ── */}
      <div className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">Platform Summary Report</p>
            <p className="text-xs text-gray-500">Generated {reportDate}</p>
          </div>
          <button
            onClick={() => exportCSV([{
              date: reportDate,
              total_users: stats?.total_users ?? 0,
              total_businesses: stats?.total_businesses ?? 0,
              total_products: stats?.total_products ?? 0,
              total_branches: stats?.total_branches ?? 0,
              total_sales_30d: stats?.total_sales_30d ?? 0,
              total_revenue_30d: stats?.total_revenue_30d ?? 0,
              new_signups_7d: stats?.new_signups_7d ?? 0,
              active_users_7d: stats?.active_users_7d ?? 0,
            }], `branchport-summary-${Date.now()}.csv`)}
            className="btn btn-outline text-xs"
          >
            Export CSV
          </button>
        </div>
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <ReportStat label="Total Users" value={String(stats.total_users)} />
            <ReportStat label="Businesses" value={String(stats.total_businesses)} />
            <ReportStat label="Products Tracked" value={String(stats.total_products)} />
            <ReportStat label="Sales (30d)" value={String(stats.total_sales_30d)} />
            <ReportStat label="Revenue (30d)" value={`GHS ${stats.total_revenue_30d.toLocaleString()}`} />
          </div>
        )}
      </div>

      {/* ── USERS REPORT ── */}
      <div className="card overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">User Data Report</p>
            <p className="text-xs text-gray-500">Names, phones, roles, items sold — {users.length} users</p>
          </div>
          <button
            onClick={() => exportCSV(
              users.map((u) => ({
                name: u.name,
                phone: u.phone,
                role: u.role,
                business: u.business_name,
                branch: u.branch_name,
                sales_30d: u.total_sales,
                revenue_30d: u.total_revenue,
                items_sold: u.items_sold.join('; '),
                joined: new Date(u.created_at).toLocaleDateString(),
                last_active: new Date(u.last_active).toLocaleDateString(),
              })),
              `branchport-users-${Date.now()}.csv`
            )}
            className="btn btn-outline text-xs"
          >
            Export Users
          </button>
        </div>
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-gray-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Name</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Phone</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Role</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Business</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500">Sales</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500">Revenue</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Items</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-gray-50">
                  <td className="px-5 py-2.5 font-medium">{u.name}</td>
                  <td className="px-5 py-2.5 text-gray-500">{u.phone}</td>
                  <td className="px-5 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      u.role === 'owner' ? 'bg-purple-100 text-purple-700' :
                      u.role === 'manager' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{u.role}</span>
                  </td>
                  <td className="px-5 py-2.5 text-gray-500">{u.business_name}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{u.total_sales}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums font-medium">GHS {u.total_revenue.toLocaleString()}</td>
                  <td className="px-5 py-2.5 text-gray-500 text-xs">{u.items_sold.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── ITEMS REPORT ── */}
      <div className="card overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">Market Items Report</p>
            <p className="text-xs text-gray-500">Prices, trends, volume — {items.length} items</p>
          </div>
          <button
            onClick={() => exportCSV(
              items.map((i) => ({
                name: i.product_name,
                category: i.category,
                avg_price: i.avg_price,
                min_price: i.min_price,
                max_price: i.max_price,
                sold_30d: i.total_sold,
                revenue_30d: i.total_revenue,
                shop_count: i.shop_count,
                trend: i.price_trend,
                trend_pct: i.trend_pct,
              })),
              `branchport-items-${Date.now()}.csv`
            )}
            className="btn btn-outline text-xs"
          >
            Export Items
          </button>
        </div>
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-gray-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Item</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Category</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500">Avg Price</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500">Sold</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500">Revenue</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500">Shops</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500">Trend</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.product_id} className="border-b border-gray-50">
                  <td className="px-5 py-2.5 font-medium">{i.product_name}</td>
                  <td className="px-5 py-2.5 text-gray-500 text-xs">{i.category}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">GHS {i.avg_price.toFixed(2)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{i.total_sold.toLocaleString()}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums font-medium">GHS {i.total_revenue.toLocaleString()}</td>
                  <td className="px-5 py-2.5 text-right">{i.shop_count}</td>
                  <td className={`px-5 py-2.5 text-right font-medium ${
                    i.price_trend === 'rising' ? 'text-green-700' :
                    i.price_trend === 'falling' ? 'text-red-600' : 'text-gray-400'
                  }`}>
                    {i.price_trend === 'rising' ? '▲' : i.price_trend === 'falling' ? '▼' : '—'}{' '}
                    {i.trend_pct > 0 ? '+' : ''}{i.trend_pct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── OFFICIAL REPORT FOOTER ── */}
      <div className="card p-6 text-center">
        <p className="text-sm font-medium text-gray-700">Official Business Report</p>
        <p className="text-xs text-gray-400 mt-1">
          Generated on {reportDate} · BranchPort Market Stock Analytics Platform
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Data includes {users.length} users across {stats?.total_businesses ?? 0} businesses selling {items.length} products
        </p>
      </div>
    </div>
  );
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
