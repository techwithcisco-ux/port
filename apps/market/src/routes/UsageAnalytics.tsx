import { useEffect, useState } from 'react';
import { getUsageAnalytics, getPlatformStats, type UsageDataPoint, type PlatformStats } from '../lib/api';

export default function UsageAnalytics() {
  const [data, setData] = useState<UsageDataPoint[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [d, s] = await Promise.all([getUsageAnalytics(), getPlatformStats()]);
      setData(d);
      setStats(s);
      setLoading(false);
    }
    void load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-500">Loading analytics…</p>
      </div>
    );
  }

  const totalSignups = data.reduce((s, d) => s + d.signups, 0);
  const totalSales = data.reduce((s, d) => s + d.sales_count, 0);
  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
  const avgActiveUsers = data.length > 0 ? Math.round(data.reduce((s, d) => s + d.active_users, 0) / data.length) : 0;
  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const maxUsers = Math.max(...data.map((d) => d.active_users), 1);
  const maxSignups = Math.max(...data.map((d) => d.signups), 1);

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="page-title">⏱ Usage Analytics</h1>
        <p className="page-sub">Platform usage data for business reports and analytics</p>
      </div>

      {/* ── SUMMARY STATS ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Total Signups (30d)</p>
          <p className="text-2xl font-bold tabular-nums">{totalSignups}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Avg Daily Active</p>
          <p className="text-2xl font-bold tabular-nums">{avgActiveUsers}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Total Sales (30d)</p>
          <p className="text-2xl font-bold tabular-nums">{totalSales.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border bg-gray-900 p-4 text-white">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Total Revenue (30d)</p>
          <p className="text-2xl font-bold tabular-nums">GHS {totalRevenue.toLocaleString()}</p>
        </div>
      </div>

      {/* ── DAILY ACTIVITY CHART ── */}
      <div className="card overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-gray-200">
          <p className="text-sm font-semibold text-gray-900">Daily Active Users</p>
          <p className="text-xs text-gray-500">Number of unique users active each day</p>
        </div>
        <div className="p-6">
          <div className="space-y-1.5">
            {data.map((d) => (
              <div key={d.date} className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 w-12 text-right shrink-0">{d.date}</span>
                <div className="flex-1 h-5 rounded bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded bg-blue-500 transition-all duration-700"
                    style={{ width: `${(d.active_users / maxUsers) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] tabular-nums text-gray-500 w-8 text-right">{d.active_users}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── SIGNUPS CHART ── */}
      <div className="card overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-gray-200">
          <p className="text-sm font-semibold text-gray-900">Daily New Signups</p>
          <p className="text-xs text-gray-500">New user registrations each day</p>
        </div>
        <div className="p-6">
          <div className="space-y-1.5">
            {data.map((d) => (
              <div key={d.date} className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 w-12 text-right shrink-0">{d.date}</span>
                <div className="flex-1 h-5 rounded bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded bg-green-500 transition-all duration-700"
                    style={{ width: `${(d.signups / maxSignups) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] tabular-nums text-gray-500 w-8 text-right">{d.signups}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── REVENUE CHART ── */}
      <div className="card overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-gray-200">
          <p className="text-sm font-semibold text-gray-900">Daily Revenue</p>
          <p className="text-xs text-gray-500">Revenue collected each day across all shops</p>
        </div>
        <div className="p-6">
          <div className="space-y-1.5">
            {data.map((d) => (
              <div key={d.date} className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 w-12 text-right shrink-0">{d.date}</span>
                <div className="flex-1 h-5 rounded bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded bg-purple-500 transition-all duration-700"
                    style={{ width: `${(d.revenue / maxRevenue) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] tabular-nums text-gray-500 w-16 text-right">GHS {d.revenue.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── DATE & TIME TRACKING ── */}
      <div className="card p-6">
        <p className="text-sm font-semibold text-gray-900 mb-3">Platform Usage Summary</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500">Platform Started</p>
            <p className="text-sm font-medium">Aug 2026</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Users</p>
            <p className="text-sm font-medium">{stats?.total_users ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Businesses Registered</p>
            <p className="text-sm font-medium">{stats?.total_businesses ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Active in Last 7 Days</p>
            <p className="text-sm font-medium">{stats?.active_users_7d ?? 0}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
