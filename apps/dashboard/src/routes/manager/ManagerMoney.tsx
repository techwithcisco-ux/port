import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Product, Sale, Expense } from '@branchport/shared';
import { formatGHS, startOfMonth } from '../../lib/utils';

type MoneyTab = 'overview' | 'sales' | 'expenses' | 'debts';

export default function ManagerMoney() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<MoneyTab>('overview');
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const monthStart = startOfMonth();
      const [s, p, e] = await Promise.allSettled([
        supabase.from('sales').select('*').gte('sold_at', monthStart),
        supabase.from('products').select('*'),
        supabase.from('expenses').select('*'),
      ]);
      if (s.status === 'fulfilled' && !s.value.error) setSales((s.value.data as Sale[]) ?? []);
      if (p.status === 'fulfilled' && !p.value.error) setProducts((p.value.data as Product[]) ?? []);
      if (e.status === 'fulfilled' && !e.value.error) setExpenses((e.value.data as Expense[]) ?? []);
      setLoading(false);
    }
    void load();
  }, []);

  const costMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      map.set(p.id, p.units_per_bulk > 0 ? p.bulk_cost_price / p.units_per_bulk : 0);
    }
    return map;
  }, [products]);

  const totalRevenue = sales.reduce((s, x) => s + Number(x.total_price), 0);
  const totalCost = sales.reduce((s, x) => s + Number(x.quantity) * (costMap.get(x.product_id) ?? 0), 0);
  const grossProfit = totalRevenue - totalCost;
  const totalExpenses = expenses.reduce((s, x) => s + Number(x.amount), 0);
  const netProfit = grossProfit - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  if (loading) {
    return <DashboardLayout><p className="text-gray-500 py-8">Loading financial data…</p></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="mb-3">
        <h1 className="page-title">Money</h1>
        <p className="page-sub">This month's financial overview.</p>
      </div>

      {/* Tab selector */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {([
          { key: 'overview', label: 'Overview' },
          { key: 'sales', label: 'Sales Report' },
          { key: 'expenses', label: 'Expenses' },
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="bg-gray-900 text-white rounded-2xl p-4">
              <p className="text-xs font-medium text-gray-400 uppercase">Revenue</p>
              <p className="text-2xl font-bold tabular-nums mt-1">{formatGHS(totalRevenue)}</p>
              <p className="text-xs text-gray-400 mt-1">{sales.length} sales</p>
            </div>
            <div className={`rounded-2xl p-4 ${grossProfit >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <p className="text-xs font-medium text-gray-500 uppercase">Gross Profit</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatGHS(grossProfit)}
              </p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-gray-200">
              <p className="text-xs font-medium text-gray-500 uppercase">Expenses</p>
              <p className="text-2xl font-bold text-red-700 tabular-nums mt-1">{formatGHS(totalExpenses)}</p>
            </div>
            <div className={`rounded-2xl p-4 ${netProfit >= 0 ? 'bg-blue-50 border border-blue-200' : 'bg-red-50 border border-red-200'}`}>
              <p className="text-xs font-medium text-gray-500 uppercase">Net Profit</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${netProfit >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                {formatGHS(netProfit)}
              </p>
              <p className="text-xs text-gray-500 mt-1">{profitMargin.toFixed(1)}% margin</p>
            </div>
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Link to="/manager/sales-report" className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all">
              <span className="text-2xl block mb-2">📊</span>
              <span className="text-sm font-medium text-gray-900">Sales Report</span>
            </Link>
            <Link to="/manager/profit-loss" className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all">
              <span className="text-2xl block mb-2">💰</span>
              <span className="text-sm font-medium text-gray-900">Profit & Loss</span>
            </Link>
            <Link to="/manager/expenses" className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all">
              <span className="text-2xl block mb-2">💸</span>
              <span className="text-sm font-medium text-gray-900">Expenses</span>
            </Link>
            <Link to="/manager/ledger" className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all">
              <span className="text-2xl block mb-2">📝</span>
              <span className="text-sm font-medium text-gray-900">Debtors & Creditors</span>
            </Link>
            <Link to="/manager/documents" className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all">
              <span className="text-2xl block mb-2">📄</span>
              <span className="text-sm font-medium text-gray-900">Documents</span>
            </Link>
            <Link to="/manager/suppliers" className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all">
              <span className="text-2xl block mb-2">🏭</span>
              <span className="text-sm font-medium text-gray-900">Suppliers</span>
            </Link>
          </div>
        </>
      )}

      {tab === 'sales' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Sales Report — This Month</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">Total Sales</span>
              <span className="text-lg font-bold tabular-nums text-gray-900">{formatGHS(totalRevenue)}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">Number of Transactions</span>
              <span className="text-lg font-bold tabular-nums text-gray-900">{sales.length}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">Cost of Goods Sold</span>
              <span className="text-lg font-bold tabular-nums text-red-700">-{formatGHS(totalCost)}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm font-semibold text-gray-900">Gross Profit</span>
              <span className={`text-lg font-bold tabular-nums ${grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatGHS(grossProfit)}
              </span>
            </div>
          </div>
        </div>
      )}

      {tab === 'expenses' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Expenses — This Month</h2>
          {expenses.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No expenses recorded this month.</p>
          ) : (
            <div className="space-y-2">
              {expenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{e.category}</p>
                    <p className="text-xs text-gray-500">{e.description}</p>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-red-700">-{formatGHS(e.amount)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between py-2 pt-3 border-t border-gray-200">
                <span className="text-sm font-semibold text-gray-900">Total Expenses</span>
                <span className="text-lg font-bold tabular-nums text-red-700">{formatGHS(totalExpenses)}</span>
              </div>
            </div>
          )}
          <div className="mt-4">
            <Link to="/manager/expenses" className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200">
              Manage Expenses →
            </Link>
          </div>
        </div>
      )}

      {tab === 'debts' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Debts & Creditors</h2>
          <p className="text-sm text-gray-500 mb-4">Who owes you and who you owe.</p>
          <Link to="/manager/ledger" className="inline-block px-6 py-3 rounded-xl bg-gray-900 text-white font-medium">
            View Full Ledger →
          </Link>
        </div>
      )}
    </DashboardLayout>
  );
}
