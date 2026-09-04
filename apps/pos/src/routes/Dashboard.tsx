import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import {
  getInventoryStats,
  getAllProductInventoryStatus,
  type InventoryStats,
} from '../lib/inventory';

function formatGHS(n: number): string {
  return `GHS ${n.toFixed(2)}`;
}

function getTodayStart(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function StaffDashboard() {
  const { profile } = useAuth();
  const products = useLiveQuery(() => db.products.toArray(), []) ?? [];
  const allocations = useLiveQuery(() => db.allocations.toArray(), []) ?? [];
  const sales = useLiveQuery(() => db.sales.toArray(), []) ?? [];

  const inventory = useMemo(() => {
    if (!profile?.branch_id) return null;
    const todayStart = getTodayStart();
    const stats = getInventoryStats(products, allocations, sales, profile.branch_id, todayStart);
    const allInventory = getAllProductInventoryStatus(products, allocations, sales, profile.branch_id, todayStart);
    return { stats, allInventory };
  }, [profile?.branch_id, products, allocations, sales]);

  if (!profile?.branch_id || !inventory) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 pb-16">
        <p className="text-gray-500">Loading inventory…</p>
      </div>
    );
  }

  const { stats, allInventory } = inventory;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 pb-16">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Stock</h1>
          <p className="text-sm text-gray-500 mt-1">{profile.name} — Today</p>
        </div>
      </header>

      {/* Content — simplified: big stat cards + simple table */}
      <div className="flex-1 px-4 py-6 max-w-4xl mx-auto w-full">
        {/* Key Stats — big, easy to read */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-900 text-white rounded-2xl p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-2">
              Revenue Today
            </p>
            <p className="text-4xl font-bold tabular-nums">{formatGHS(stats.totalRevenueToday)}</p>
            <p className="text-sm text-gray-400 mt-3">
              {stats.totalUnitsSoldToday} items sold
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
              Stock Left
            </p>
            <p className="text-4xl font-bold text-gray-900 tabular-nums">
              {allInventory.reduce((sum, inv) => sum + inv.remainingQuantity, 0)}
            </p>
            <p className="text-sm text-gray-500 mt-3">
              {formatGHS(stats.totalInventoryValue)} value
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
              Number of Sales
            </p>
            <p className="text-4xl font-bold text-gray-900 tabular-nums">
              {sales.filter(s => s.sold_at >= getTodayStart()).length}
            </p>
            <p className="text-sm text-gray-500 mt-3">
              transactions today
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
              Avg. Sale
            </p>
            <p className="text-4xl font-bold text-gray-900 tabular-nums">
              {(() => {
                const todaySales = sales.filter(s => s.sold_at >= getTodayStart());
                const count = todaySales.length;
                return count > 0 ? formatGHS(todaySales.reduce((s, x) => s + Number(x.total_price), 0) / count) : formatGHS(0);
              })()}
            </p>
            <p className="text-sm text-gray-500 mt-3">
              per customer
            </p>
          </div>
        </div>

        {/* Simple product list — cards, not tables */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-900">Your products</h2>
            <p className="text-sm text-gray-500 mt-1">Stock and sales today</p>
          </div>
          <div className="divide-y">
            {allInventory.map((inv) => (
              <div key={inv.product.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">{inv.product.name}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {inv.soldQuantity} sold · {inv.remainingQuantity} left
                  </p>
                </div>
                <div className="text-right ml-4">
                  <p className="text-lg font-bold tabular-nums text-gray-900">{formatGHS(inv.revenueToday)}</p>
                  <span
                    className={`inline-block mt-1 px-3 py-1 rounded-full text-xs font-medium ${
                      inv.status === 'sold-out'
                        ? 'bg-red-50 text-red-700'
                        : inv.status === 'stock-low'
                          ? 'bg-yellow-50 text-yellow-700'
                          : 'bg-green-50 text-green-700'
                    }`}
                  >
                    {inv.status === 'sold-out'
                      ? 'Out of stock'
                      : inv.status === 'stock-low'
                        ? 'Low stock'
                        : 'OK'}
                  </span>
                </div>
              </div>
            ))}
            {allInventory.length === 0 && (
              <div className="px-6 py-8 text-center text-gray-400">
                <p className="text-base">No products in your shop yet</p>
                <p className="text-sm mt-1">Ask your manager to allocate stock</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
