import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { ColorLegend, StatusBadge, ColorStatCard, GaugeMeter, BarMeter, SalesFunnel } from '../../components/Visuals';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Sale, InventoryIntake, Product, InventoryAllocation } from '@branchport/shared';
import { formatGHS, startOfToday, startOfWeek, startOfMonth } from '../../lib/utils';
import { calculateBusinessAnalytics } from '@branchport/shared';
import { AdinkraStock, IconCurrency, IconBox, AdinkraAlert, IconChart } from '../../components/Icons';

const PERIODS: Array<{ key: string; label: string; from: () => string }> = [
  { key: 'today', label: 'Today', from: startOfToday },
  { key: 'week', label: 'This week', from: startOfWeek },
  { key: 'month', label: 'This month', from: startOfMonth },
];

export default function ManagerHome() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [allocations, setAllocations] = useState<InventoryAllocation[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [owedTotal, setOwedTotal] = useState(0);
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('today');

  useEffect(() => {
    const from = PERIODS.find((p) => p.key === period)?.from() ?? startOfToday();
    Promise.allSettled([
      supabase.from('sales').select('*').gte('sold_at', from),
      supabase.from('inventory_intake').select('amount_owed'),
      supabase.from('supplier_payments').select('amount'),
      supabase.from('products').select('*'),
      supabase.from('inventory_allocations').select('*'),
      supabase.from('branches').select('*'),
    ]).then((results) => {
      const unwrap = (r: PromiseSettledResult<any>) => r.status === 'fulfilled' ? r.value.data ?? [] : [];
      const [s, i, p, pr, a, b] = results;
      setSales((unwrap(s) as Sale[]) ?? []);
      setProducts((unwrap(pr) as Product[]) ?? []);
      setAllocations((unwrap(a) as InventoryAllocation[]) ?? []);
      setBranches((unwrap(b) as any[]) ?? []);
      const gross = (unwrap(i) as InventoryIntake[]).reduce((sum: number, r: any) => sum + Number(r.amount_owed ?? 0), 0);
      const paid = (unwrap(p) as Array<{ amount: number }>).reduce((sum: number, r: any) => sum + Number(r.amount ?? 0), 0);
      setOwedTotal(Math.max(gross - paid, 0));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [period]);

  // Filter sales by branch scoping: owner sees all branches, manager sees only their branch
  const userBranchId = profile?.branch_id;
  const filteredSales = userBranchId
    ? sales.filter((s: any) => s.branch_id === userBranchId)
    : sales;

  const analytics = useMemo(() => calculateBusinessAnalytics(products, [], allocations, sales), [products, allocations, sales]);
  const total = filteredSales.reduce((sum, s) => sum + Number(s.total_price), 0);
  const flaggedCount = filteredSales.filter((s) => s.price_flagged).length;
  const cost = analytics.cost;
  const profit = analytics.profit;
  const grossMargin = total > 0 ? ((profit / total) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
        <AdinkraStock size={20} className="text-emerald-600" />
        <h1 className="page-title mb-0">Yield</h1>
      </div>
          <p className="page-sub">Live figures for the selected window — colors tell the story.</p>
        </div>
        <div className="seg max-w-full overflow-x-auto">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)} className={`pill ${period === p.key ? 'pill-active' : ''}`}>{p.label}</button>
          ))}
        </div>
      </div>

      <ColorLegend items={[
        { color: 'bg-green-500', label: 'Good / Profit' },
        { color: 'bg-red-500', label: 'Loss / Danger' },
        { color: 'bg-amber-500', label: 'Warning' },
        { color: 'bg-blue-500', label: 'Revenue' },
      ]} className="mb-6" />

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <>
          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6 max-w-5xl lg:grid-cols-4">
            <ColorStatCard label="Sales Revenue" value={formatGHS(total)} color="blue" icon={<IconCurrency size={16} />} sublabel={`${filteredSales.length} transactions`} />
            <ColorStatCard label="Cost of Goods" value={formatGHS(cost)} color="orange" icon={<IconBox size={16} />} sublabel="What you paid for stock" />
            <ColorStatCard label="Net Profit" value={formatGHS(profit)} color={profit >= 0 ? 'green' : 'red'} icon={<IconChart size={16} />} sublabel={`${grossMargin.toFixed(1)}% margin`} />
            <ColorStatCard label="Owed to Suppliers" value={owedTotal > 0 ? formatGHS(owedTotal) : 'GHS 0.00'} color={owedTotal > 0 ? 'amber' : 'green'} icon={<AdinkraAlert size={16} />} sublabel={owedTotal > 0 ? 'Outstanding balance' : 'All settled'} />
          </div>

          {/* Gauges */}
          <div className="card p-6 mb-6 max-w-5xl">
            <p className="text-sm font-semibold text-gray-700 mb-4">Quick Gauges</p>
            <div className="flex flex-wrap justify-around gap-6">
              <GaugeMeter
                value={total}
                max={total + owedTotal || 1}
                label="Revenue Collection"
                sublabel="sales made"
                color={total > 0 ? 'green' : 'amber'}
                size={100}
              />
              <GaugeMeter
                value={Math.max(profit, 0)}
                max={total || 1}
                label="Profit Margin"
                sublabel={`${grossMargin.toFixed(0)}% of revenue`}
                color={profit >= 0 ? 'green' : 'red'}
                size={100}
              />
              <GaugeMeter
                value={owedTotal}
                max={owedTotal + total || 1}
                label="Supplier Debt"
                sublabel={owedTotal > 0 ? 'amount outstanding' : 'all paid'}
                color={owedTotal === 0 ? 'green' : owedTotal < total * 0.3 ? 'amber' : 'red'}
                size={100}
              />
              <GaugeMeter
                value={products.length}
                max={20}
                label="Product Catalog"
                sublabel={`${products.length} items`}
                color="blue"
                size={100}
              />
            </div>
          </div>

          {/* Funnel */}
          <div className="card p-6 mb-6 max-w-5xl">
            <SalesFunnel
              steps={[
                { label: 'Total Revenue', value: Math.round(total), color: 'bg-blue-500' },
                { label: 'Cost of Goods', value: Math.round(cost), color: 'bg-orange-500' },
                { label: 'Net Profit', value: Math.round(profit), color: profit >= 0 ? 'bg-green-500' : 'bg-red-500' },
              ]}
              title="Revenue → Cost → Profit"
            />
          </div>

          {/* Branch performance */}
          {analytics.branches.length > 0 && (
            <div className="card p-6 max-w-5xl">
              <p className="text-sm font-semibold text-gray-700 mb-4">Branch Performance</p>
              <div className="space-y-3">
                {analytics.branches.map((b, i) => (
                  <div key={b.branchId} className="flex items-center gap-4">
                    <span className="text-sm font-medium w-24 shrink-0">{b.branchName}</span>
                    <div className="flex-1">
                      <BarMeter value={b.revenue} max={analytics.branches[0]?.revenue || 1} color={b.profit >= 0 ? 'green' : 'red'} height={10} />
                    </div>
                    <span className="text-xs tabular-nums text-gray-500 w-20 text-right">{formatGHS(b.revenue)}</span>
                    <span className={`text-xs font-bold tabular-nums w-20 text-right ${b.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatGHS(b.profit)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </DashboardLayout>
  );
}
