import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import type { Product, Sale, InventoryAllocation } from '@branchport/shared';
import { formatGHS, startOfMonth } from '../../lib/utils';

type MoneyTab = 'overview' | 'pnl' | 'debts';

export default function OwnerMoney() {
  const [tab, setTab] = useState<MoneyTab>('overview');
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [allocations, setAllocations] = useState<InventoryAllocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const monthStart = startOfMonth();
      const [s, p, a] = await Promise.all([
        supabase.from('sales').select('*').gte('sold_at', monthStart),
        supabase.from('products').select('*'),
        supabase.from('inventory_allocations').select('*'),
      ]);
      if (!s.error) setSales((s.data as Sale[]) ?? []);
      if (!p.error) setProducts((p.data as Product[]) ?? []);
      if (!a.error) setAllocations((a.data as InventoryAllocation[]) ?? []);
      setLoading(false);
    }
    void load();
  }, []);

  // Cost map
  const costMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      map.set(p.id, p.units_per_bulk > 0 ? p.bulk_cost_price / p.units_per_bulk : 0);
    }
    return map;
  }, [products]);

  // This month's metrics
  const monthSales = sales;
  const totalRevenue = monthSales.reduce((s, x) => s + Number(x.total_price), 0);
  const totalCost = monthSales.reduce((s, x) => s + Number(x.quantity) * (costMap.get(x.product_id) ?? 0), 0);
  const grossProfit = totalRevenue - totalCost;
  const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  const transactions = monthSales.length;

  // Stock value (inventory at cost)
  const stockValue = useMemo(() => {
    return allocations.reduce((total, a) => {
      const product = products.find((p) => p.id === a.product_id);
      if (!product) return total;
      const cost = product.units_per_bulk > 0 ? product.bulk_cost_price / product.units_per_bulk : 0;
      return total + Number(a.retail_quantity_equivalent) * cost;
    }, 0);
  }, [allocations, products]);

  // Top products by revenue
  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; units: number; cost: number }>();
    for (const s of monthSales) {
      const p = products.find((x) => x.id === s.product_id);
      if (!p) continue;
      const cur = map.get(s.product_id) ?? { name: p.name, revenue: 0, units: 0, cost: 0 };
      cur.revenue += Number(s.total_price);
      cur.units += Number(s.quantity);
      cur.cost += Number(s.quantity) * (costMap.get(s.product_id) ?? 0);
      map.set(s.product_id, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [monthSales, products, costMap]);

  if (loading) {
    return (
      <DashboardLayout>
        <p className="text-gray-500 py-8">Loading financial data…</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Money</h1>
        <p className="text-sm text-gray-500 mt-1">This month's financial overview.</p>
      </div>

      {/* Tab selector */}
      <div className="flex gap-2 mb-6">
        {([
          { key: 'overview', label: 'Overview' },
          { key: 'pnl', label: 'Profit & Loss' },
          { key: 'debts', label: 'Debts' },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {/* Big numbers */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-900 text-white rounded-2xl p-5">
              <p className="text-xs font-medium text-gray-400 uppercase">Revenue</p>
              <p className="text-3xl font-bold tabular-nums mt-2">{formatGHS(totalRevenue)}</p>
              <p className="text-xs text-gray-400 mt-2">{transactions} sales</p>
            </div>
            <div className={`rounded-2xl p-5 ${grossProfit >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <p className="text-xs font-medium text-gray-500 uppercase">Gross Profit</p>
              <p className={`text-3xl font-bold tabular-nums mt-2 ${grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatGHS(grossProfit)}
              </p>
              <p className="text-xs text-gray-500 mt-2">{profitMargin.toFixed(1)}% margin</p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-200">
              <p className="text-xs font-medium text-gray-500 uppercase">Cost of Goods</p>
              <p className="text-3xl font-bold text-gray-900 tabular-nums mt-2">{formatGHS(totalCost)}</p>
              <p className="text-xs text-gray-500 mt-2">what you paid for stock</p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-200">
              <p className="text-xs font-medium text-gray-500 uppercase">Stock Value</p>
              <p className="text-3xl font-bold text-gray-900 tabular-nums mt-2">{formatGHS(stockValue)}</p>
              <p className="text-xs text-gray-500 mt-2">inventory at cost</p>
            </div>
          </div>

          {/* Product breakdown */}
          {topProducts.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8">
              <h2 className="text-base font-semibold text-gray-900 mb-1">Revenue by Product</h2>
              <p className="text-xs text-gray-400 mb-4">What's making you money this month</p>
              <div className="space-y-3">
                {topProducts.map((p, i) => {
                  const profit = p.revenue - p.cost;
                  const margin = p.revenue > 0 ? (profit / p.revenue) * 100 : 0;
                  const maxRev = topProducts[0]?.revenue || 1;
                  return (
                    <div key={p.name} className="flex items-center gap-3">
                      <span className="text-sm w-6 text-center font-bold text-gray-400">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-900">{p.name}</span>
                          <span className="text-sm font-bold tabular-nums text-gray-900 ml-2">{formatGHS(p.revenue)}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gray-900 rounded-full"
                            style={{ width: `${(p.revenue / maxRev) * 100}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-gray-500">{p.units} units</span>
                          <span className={`text-xs font-medium ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {profit >= 0 ? '+' : ''}{formatGHS(profit)} ({margin.toFixed(0)}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'pnl' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Profit & Loss — This Month</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <span className="text-sm text-gray-600">💰 Sales Revenue</span>
              <span className="text-lg font-bold tabular-nums text-gray-900">{formatGHS(totalRevenue)}</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <span className="text-sm text-gray-600">📦 Cost of Goods Sold</span>
              <span className="text-lg font-bold tabular-nums text-red-700">-{formatGHS(totalCost)}</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-200">
              <span className="text-sm font-semibold text-gray-900">📈 Gross Profit</span>
              <span className={`text-xl font-bold tabular-nums ${grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatGHS(grossProfit)}
              </span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-gray-600">📊 Profit Margin</span>
              <span className={`text-lg font-bold tabular-nums ${profitMargin >= 20 ? 'text-green-700' : profitMargin >= 5 ? 'text-amber-700' : 'text-red-700'}`}>
                {profitMargin.toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-400 mb-3">Detailed reports</p>
            <div className="flex flex-wrap gap-3">
              <Link to="/manager/profit-loss" className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200">
                Full P&L Statement →
              </Link>
              <Link to="/manager/sales-report" className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200">
                Sales Report →
              </Link>
              <Link to="/manager/expenses" className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200">
                Expenses →
              </Link>
            </div>
          </div>
        </div>
      )}

      {tab === 'overview' && (
        <>
          {/* Quick links to new pages */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
            <Link
              to="/manager/documents"
              className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all"
            >
              <span className="text-2xl block mb-2">📄</span>
              <span className="text-sm font-medium text-gray-900">Documents</span>
              <p className="text-xs text-gray-500 mt-1">Receipts & invoices</p>
            </Link>
            <Link
              to="/manager/reconciliation"
              className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all"
            >
              <span className="text-2xl block mb-2">🔄</span>
              <span className="text-sm font-medium text-gray-900">Reconciliation</span>
              <p className="text-xs text-gray-500 mt-1">Match payments</p>
            </Link>
            <Link
              to="/manager/suppliers"
              className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all"
            >
              <span className="text-2xl block mb-2">🏭</span>
              <span className="text-sm font-medium text-gray-900">Suppliers</span>
              <p className="text-xs text-gray-500 mt-1">Credit & payments</p>
            </Link>
          </div>
        </>
      )}

      {tab === 'debts' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Debts & Creditors</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <p className="text-sm font-medium text-amber-700">Money Owed to You</p>
              <p className="text-2xl font-bold tabular-nums text-amber-800 mt-2">GHS 0.00</p>
              <p className="text-xs text-amber-600 mt-1">0 pending invoices</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
              <p className="text-sm font-medium text-gray-700">Money You Owe</p>
              <p className="text-2xl font-bold tabular-nums text-gray-900 mt-2">GHS 0.00</p>
              <p className="text-xs text-gray-500 mt-1">0 outstanding</p>
            </div>
          </div>

          <div className="mt-4">
            <Link to="/manager/ledger" className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200">
              View Full Ledger →
            </Link>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
