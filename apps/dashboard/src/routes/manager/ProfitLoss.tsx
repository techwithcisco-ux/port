import { useEffect, useMemo, useState } from 'react';
import BackButton from '../../components/BackButton';
import DashboardLayout from '../../components/DashboardLayout';
import { ColorLegend, BarMeter, SalesFunnel, StatusBadge, ColorStatCard } from '../../components/Visuals';
import { supabase } from '../../lib/supabase';
import { formatGHS, startOfWeek, startOfMonth } from '../../lib/utils';
import { calculateBusinessAnalytics } from '@branchport/shared';
import type { Branch, Expense, ExpensePayment, InventoryAllocation, Product, Sale } from '@branchport/shared';
import { EXPENSE_CATEGORY_LABELS } from '@branchport/shared';

type ExpenseCategory = keyof typeof EXPENSE_CATEGORY_LABELS;

const PERIODS: Array<{ key: string; label: string; from: () => string }> = [
  { key: 'today', label: 'Today', from: () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); } },
  { key: 'week', label: 'This week', from: startOfWeek },
  { key: 'month', label: 'This month', from: startOfMonth },
  { key: '30d', label: 'Last 30 days', from: () => { const d = new Date(); d.setDate(d.getDate() - 30); d.setHours(0, 0, 0, 0); return d.toISOString(); } },
];

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  daily_tax: 'bg-red-400', susu: 'bg-amber-400', rent: 'bg-blue-400',
  utilities: 'bg-purple-400', transport: 'bg-teal-400', staff_wages: 'bg-orange-400',
  maintenance: 'bg-gray-400', packaging: 'bg-green-400', advertising: 'bg-pink-400', misc: 'bg-gray-300',
};

export default function ProfitLoss() {
  const [period, setPeriod] = useState('30d');
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allocations, setAllocations] = useState<InventoryAllocation[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensePayments, setExpensePayments] = useState<ExpensePayment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [p, b, a] = await Promise.allSettled([
        supabase.from('products').select('*'),
        supabase.from('branches').select('*'),
        supabase.from('inventory_allocations').select('*'),
      ]);
      setProducts((p.status === 'fulfilled' ? p.value.data : null as any) ?? []);
      setBranches((b.status === 'fulfilled' ? b.value.data : null as any) ?? []);
      setAllocations((a.status === 'fulfilled' ? a.value.data : null as any) ?? []);
    })();
  }, []);

  useEffect(() => {
    const found = PERIODS.find((x) => x.key === period);
    const from = found ? found.from() : '';
    setLoading(true);
    (async () => {
      const [s, e, ep] = await Promise.allSettled([
        from ? supabase.from('sales').select('*').gte('sold_at', from) : supabase.from('sales').select('*'),
        supabase.from('expenses').select('*'),
        supabase.from('expense_payments').select('*'),
      ]);
      setSales((s.status === 'fulfilled' ? s.value.data : null as any) ?? []);
      setExpenses((e.status === 'fulfilled' ? e.value.data : null as any) ?? []);
      setExpensePayments((ep.status === 'fulfilled' ? ep.value.data : null as any) ?? []);
      setLoading(false);
    })();
  }, [period]);

  const analytics = useMemo(() => calculateBusinessAnalytics(products, branches, allocations, sales), [products, branches, allocations, sales]);
  const periodExpenses = useMemo(() => {
    const found = PERIODS.find((x) => x.key === period);
    const from = found ? found.from() : '';
    if (!from) return expensePayments;
    return expensePayments.filter((ep) => ep.paid_at >= from);
  }, [expensePayments, period]);

  const totalExpenseAmount = useMemo(() => periodExpenses.reduce((s, ep) => s + ep.amount, 0), [periodExpenses]);
  const expenseByCategory = useMemo(() => {
    const map = new Map<ExpenseCategory, number>();
    for (const ep of periodExpenses) {
      const exp = expenses.find((e) => e.id === ep.expense_id);
      if (exp) map.set(exp.category, (map.get(exp.category) ?? 0) + ep.amount);
    }
    return Array.from(map.entries())
      .map(([cat, amount]) => ({ category: cat, label: EXPENSE_CATEGORY_LABELS[cat], amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [periodExpenses, expenses]);

  const revenue = analytics.revenue;
  const cost = analytics.cost;
  const grossProfit = revenue - cost;
  const netProfit = grossProfit - totalExpenseAmount;
  const grossMargin = revenue > 0 ? ((grossProfit / revenue) * 100).toFixed(1) : '0.0';
  const netMargin = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : '0.0';
  const maxExpense = Math.max(...expenseByCategory.map((e) => e.amount), 1);

  return (
    <DashboardLayout>
      <BackButton />
      <div>
        <div>
          <h1 className="page-title">💰 Profit & Loss</h1>
          <p className="page-sub">Sales, cost, expenses, and your bottom line — every color tells the story.</p>
        </div>
        <div className="seg max-w-full overflow-x-auto">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)} className={`pill ${period === p.key ? 'pill-active' : ''}`}>{p.label}</button>
          ))}
        </div>
      </div>

      <ColorLegend items={[
        { color: 'bg-blue-500', label: 'Revenue' },
        { color: 'bg-orange-500', label: 'Cost (COGS)' },
        { color: 'bg-green-500', label: 'Profit' },
        { color: 'bg-red-500', label: 'Expenses / Loss' },
      ]} className="mb-6" />

      {/* ── KEY METRICS ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6 max-w-5xl lg:grid-cols-4">
        <ColorStatCard label="Revenue (Sales)" value={loading ? '…' : formatGHS(revenue)} color="blue" icon="💰" />
        <ColorStatCard label="Cost of Goods Sold" value={loading ? '…' : formatGHS(cost)} color="orange" icon="📦" />
        <ColorStatCard label="Gross Profit" value={loading ? '…' : formatGHS(grossProfit)} color={grossProfit >= 0 ? 'green' : 'red'} icon={grossProfit >= 0 ? '📈' : '📉'} sublabel={`${grossMargin}% margin`} />
        <ColorStatCard label="Net Profit" value={loading ? '…' : formatGHS(netProfit)} color={netProfit >= 0 ? 'green' : 'red'} icon={netProfit >= 0 ? '✅' : '🚨'} sublabel={`${netMargin}% margin`} />
      </div>

      {/* ── PROFIT FUNNEL ── */}
      <div className="card p-6 mb-6 max-w-5xl">
        <p className="text-sm font-semibold text-gray-700 mb-1">Profit Funnel</p>
        <p className="text-xs text-gray-400 mb-4">Revenue → after COGS → after expenses = your real profit</p>
        <SalesFunnel
          steps={[
            { label: 'Revenue', value: Math.round(revenue), color: 'bg-blue-500' },
            { label: 'Gross Profit', value: Math.round(grossProfit), color: grossProfit >= 0 ? 'bg-green-500' : 'bg-red-400' },
            { label: 'After Expenses', value: Math.round(netProfit), color: netProfit >= 0 ? 'bg-green-600' : 'bg-red-500' },
          ]}
          title="Revenue → Profit"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-6 max-w-5xl">
        {/* ── Revenue by product ── */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Revenue by product</p>
            <ColorLegend items={[{ color: 'bg-blue-500', label: 'Revenue' }, { color: 'bg-orange-500', label: 'Cost' }, { color: 'bg-green-500', label: 'Profit' }]} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-head">Product</th>
                  <th className="table-head text-right">Cost</th>
                  <th className="table-head text-right">Revenue</th>
                  <th className="table-head text-right">Profit</th>
                  <th className="table-head w-24">Margin</th>
                </tr>
              </thead>
              <tbody>
                {analytics.products.map((p) => {
                  const margin = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
                  return (
                    <tr key={p.productId} className="border-t">
                      <td className="px-4 py-2.5 font-medium">{p.productName}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-orange-600">{formatGHS(p.cost)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-blue-600">{formatGHS(p.revenue)}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${p.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatGHS(p.profit)}
                      </td>
                      <td className="px-4 py-2.5">
                        <BarMeter value={Math.max(margin, 0)} max={50} color={margin > 20 ? 'green' : margin > 5 ? 'amber' : 'red'} height={6} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Expenses by category ── */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Expenses by category</p>
            <StatusBadge color="red">{formatGHS(totalExpenseAmount)} total</StatusBadge>
          </div>
          {expenseByCategory.length === 0 ? (
            <p className="p-6 text-gray-500 text-sm">No expenses in this period.</p>
          ) : (
            <div className="p-5 space-y-3">
              {expenseByCategory.map((e) => (
                <div key={e.category}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-medium text-gray-700">{e.label}</span>
                    <span className="text-xs tabular-nums font-medium text-red-600">{formatGHS(e.amount)}</span>
                  </div>
                  <BarMeter value={e.amount} max={maxExpense} color="red" height={8} />
                </div>
              ))}
            </div>
          )}
          <div className="px-5 py-3 bg-red-50 border-t border-red-100 flex justify-between text-sm">
            <span className="font-bold text-red-800">Total Expenses</span>
            <span className="font-bold tabular-nums text-red-700">{formatGHS(totalExpenseAmount)}</span>
          </div>
        </div>
      </div>

      {/* ── P&L SUMMARY ── */}
      <div className="card overflow-hidden max-w-5xl mb-6">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">P&L Summary</p>
          <StatusBadge color={netProfit >= 0 ? 'green' : 'red'} pulse={netProfit < 0}>
            {netProfit >= 0 ? 'Profitable' : 'Making a loss'}
          </StatusBadge>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Total sales revenue</span>
            <span className="font-medium tabular-nums text-blue-700">{formatGHS(revenue)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Cost of goods sold (COGS)</span>
            <span className="font-medium tabular-nums text-orange-700">({formatGHS(cost)})</span>
          </div>
          <div className="flex justify-between items-center border-t border-gray-200 pt-2">
            <span className="font-semibold text-gray-900">Gross profit</span>
            <span className={`font-semibold tabular-nums ${grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatGHS(grossProfit)}</span>
          </div>
          <div className="border-t border-gray-200 pt-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Operating expenses</p>
            {expenseByCategory.map((e) => (
              <div key={e.category} className="flex justify-between py-0.5">
                <span className="text-gray-500">{e.label}</span>
                <span className="tabular-nums text-red-600">({formatGHS(e.amount)})</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-gray-100 pt-1 mt-1">
              <span className="font-medium text-gray-700">Total expenses</span>
              <span className="font-medium tabular-nums text-red-600">({formatGHS(totalExpenseAmount)})</span>
            </div>
          </div>
          <div className="flex justify-between border-t-2 border-gray-900 pt-3">
            <span className="text-lg font-bold text-gray-900">Net profit</span>
            <span className={`text-lg font-bold tabular-nums ${netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatGHS(netProfit)}</span>
          </div>
          <p className="text-xs text-gray-400 text-right">Net margin: {netMargin}% | Gross margin: {grossMargin}%</p>
        </div>
      </div>

      {/* ── BY BRANCH ── */}
      {!loading && analytics.branches.length > 0 && (
        <div className="card p-6 max-w-5xl">
          <p className="text-sm font-semibold text-gray-700 mb-4">Performance by branch</p>
          <div className="space-y-3">
            {analytics.branches.map((b) => (
              <div key={b.branchId} className="flex items-center gap-4">
                <span className="text-sm font-medium w-24 shrink-0">{b.branchName}</span>
                <div className="flex-1">
                  <BarMeter value={b.revenue} max={analytics.branches[0]?.revenue || 1} color={b.profit >= 0 ? 'blue' : 'red'} height={10} />
                </div>
                <span className={`text-xs font-bold tabular-nums w-24 text-right ${b.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatGHS(b.profit)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
