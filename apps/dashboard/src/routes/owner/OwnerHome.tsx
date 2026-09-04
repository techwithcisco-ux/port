import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import type { Branch, InventoryAllocation, Invoice, Product, Sale } from '@branchport/shared';
import { formatGHS, startOfWeek, startOfMonth } from '../../lib/utils';
import { PerformanceTube, IconCurrency } from '../../components/Icons';
import { Funtunfunefu, BlackStar, Nsoromma, GyeNyame, GhanaFlagStripe, Adinkrahene } from '../../components/AdinkraSymbols';

const OWNER_CACHE_KEY = 'branchport-owner-snapshot-v2';
type OwnerSnapshot = { sales: Sale[]; branches: Branch[]; products: Product[]; allocations: InventoryAllocation[]; savedAt: string };

// Helper: get date ranges
function todayStart(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
}
function yesterdayStart(): string {
  const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(0, 0, 0, 0); return d.toISOString();
}
function thisWeekStart(): string { return startOfWeek(); }
function thisMonthStart(): string { return startOfMonth(); }
function daysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n); d.setHours(0, 0, 0, 0); return d.toISOString();
}

// Simple comparison indicator
function Compare({ current, previous, label }: { current: number; previous: number; label?: string }) {
  if (previous === 0 && current === 0) return <span className="text-xs text-gray-400">No data</span>;
  if (previous === 0) return <span className="text-xs text-green-600 font-medium">New!</span>;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  return (
    <span className={`text-xs font-medium ${up ? 'text-green-600' : 'text-red-600'}`}>
      {up ? '↑' : '↓'} {Math.abs(pct).toFixed(0)}%{label ? ` ${label}` : ''}
    </span>
  );
}

export default function OwnerHome() {
  const [period, setPeriod] = useState('week');
  const [sales, setSales] = useState<Sale[]>([]);
  const [allSales, setAllSales] = useState<Sale[]>([]); // for comparisons
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [allocations, setAllocations] = useState<InventoryAllocation[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  // Load cached data
  useEffect(() => {
    const cached = localStorage.getItem(OWNER_CACHE_KEY);
    if (cached) {
      try {
        const snapshot = JSON.parse(cached) as OwnerSnapshot;
        setSales(snapshot.sales);
        setBranches(snapshot.branches);
        setProducts(snapshot.products);
        setAllocations(snapshot.allocations);
        setLoading(false);
      } catch { localStorage.removeItem(OWNER_CACHE_KEY); }
    }
  }, []);

  // Fetch all data
  useEffect(() => {
    async function refresh() {
      if (!navigator.onLine) return;
      const [b, p, a, inv, s] = await Promise.allSettled([
        supabase.from('branches').select('*'),
        supabase.from('products').select('*'),
        supabase.from('inventory_allocations').select('*'),
        supabase.from('invoices').select('*'),
        supabase.from('sales').select('*').gte('sold_at', daysAgo(365)),
      ]);
      const ok = (r: PromiseSettledResult<any>) => r.status === 'fulfilled' && !r.value.error;
      if (ok(b)) setBranches((b.status === 'fulfilled' ? b.value.data : null as any) ?? []);
      if (ok(p)) setProducts((p.status === 'fulfilled' ? p.value.data : null as any) ?? []);
      if (ok(a)) setAllocations((a.status === 'fulfilled' ? a.value.data : null as any) ?? []);
      if (ok(inv)) setInvoices((inv.status === 'fulfilled' ? inv.value.data : null as any) ?? []);
      if (ok(s)) {
        const allS = (s as PromiseFulfilledResult<any>).value.data as Sale[] ?? [];
        setAllSales(allS);
        const safeData = (r: PromiseSettledResult<any>) => r.status === 'fulfilled' ? r.value.data ?? [] : [];
        localStorage.setItem(OWNER_CACHE_KEY, JSON.stringify({ sales: allS, branches: safeData(b), products: safeData(p), allocations: safeData(a), savedAt: new Date().toISOString() }));
      }
      setLoading(false);
    }
    void refresh();
    window.addEventListener('online', refresh);
    return () => window.removeEventListener('online', refresh);
  }, []);

  // Filter sales by period
  useEffect(() => {
    const from = period === 'today' ? todayStart() : period === 'week' ? thisWeekStart() : thisMonthStart();
    setSales(allSales.filter((s) => s.sold_at >= from));
  }, [period, allSales]);

  // ── METRICS ──

  // Today's sales
  const todaySales = useMemo(() => allSales.filter((s) => s.sold_at >= todayStart()), [allSales]);
  const yesterdaySales = useMemo(() => allSales.filter((s) => s.sold_at >= yesterdayStart() && s.sold_at < todayStart()), [allSales]);
  const todayRevenue = todaySales.reduce((s, x) => s + Number(x.total_price), 0);
  const yesterdayRevenue = yesterdaySales.reduce((s, x) => s + Number(x.total_price), 0);
  const todayTransactions = todaySales.length;
  const yesterdayTransactions = yesterdaySales.length;
  const avgToday = todayTransactions > 0 ? todayRevenue / todayTransactions : 0;
  const avgYesterday = yesterdayTransactions > 0 ? yesterdayRevenue / yesterdayTransactions : 0;

  // Period sales
  const periodRevenue = sales.reduce((s, x) => s + Number(x.total_price), 0);
  const periodTransactions = sales.length;
  const periodUnits = sales.reduce((s, x) => s + Number(x.quantity), 0);

  // Profit (revenue - cost of goods)
  const costMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      map.set(p.id, p.units_per_bulk > 0 ? p.bulk_cost_price / p.units_per_bulk : 0);
    }
    return map;
  }, [products]);
  const todayProfit = todaySales.reduce((s, x) => s + (Number(x.total_price) - Number(x.quantity) * (costMap.get(x.product_id) ?? 0)), 0);
  const periodProfit = sales.reduce((s, x) => s + (Number(x.total_price) - Number(x.quantity) * (costMap.get(x.product_id) ?? 0)), 0);
  const profitMargin = periodRevenue > 0 ? (periodProfit / periodRevenue) * 100 : 0;

  // Stock value
  const stockAtCost = useMemo(() => {
    return allocations.reduce((total, a) => {
      const product = products.find((p) => p.id === a.product_id);
      if (!product) return total;
      const costPerUnit = product.units_per_bulk > 0 ? product.bulk_cost_price / product.units_per_bulk : 0;
      return total + Number(a.retail_quantity_equivalent) * costPerUnit;
    }, 0);
  }, [allocations, products]);

  const lowStockCount = useMemo(() => {
    let count = 0;
    for (const p of products) {
      const alloc = allocations.filter((a) => a.product_id === p.id).reduce((s, a) => s + Number(a.retail_quantity_equivalent), 0);
      const sold = allSales.filter((s) => s.product_id === p.id).reduce((s, x) => s + Number(x.quantity), 0);
      const remaining = Math.max(alloc - sold, 0);
      if (remaining === 0) count++;
      else if (remaining <= alloc * 0.2) count++;
    }
    return count;
  }, [products, allocations, allSales]);

  // Debtors (pending invoices)
  const pendingInvoices = useMemo(() => invoices.filter((i) => i.status === 'pending'), [invoices]);
  const totalOwedToYou = pendingInvoices.reduce((s, i) => s + Number(i.amount_owed), 0);

  // Revenue by branch
  const branchRevenue = useMemo(() => {
    return branches.map((b) => ({
      name: b.name,
      revenue: sales.filter((s) => s.branch_id === b.id).reduce((sum, x) => sum + Number(x.total_price), 0),
      transactions: sales.filter((s) => s.branch_id === b.id).length,
    })).sort((a, b) => b.revenue - a.revenue);
  }, [branches, sales]);

  // Top products
  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; units: number; cost: number }>();
    for (const s of sales) {
      const p = products.find((x) => x.id === s.product_id);
      if (!p) continue;
      const cur = map.get(s.product_id) ?? { name: p.name, revenue: 0, units: 0, cost: 0 };
      cur.revenue += Number(s.total_price);
      cur.units += Number(s.quantity);
      cur.cost += Number(s.quantity) * (costMap.get(s.product_id) ?? 0);
      map.set(s.product_id, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [sales, products, costMap]);

  return (
    <DashboardLayout>
      {/* Ghana Welcome Banner with Nkrumah branding */}
      <div className="mb-3 rounded-2xl p-4 text-white relative overflow-hidden" style={{background: 'linear-gradient(135deg, var(--ghana-red) 0%, var(--kente-maroon) 100%)'}}>
        <div className="absolute top-0 right-0 opacity-10">
          <GyeNyame size={120} color="white" />
        </div>
        <div className="flex items-center gap-3 mb-2 relative">
          <BlackStar size={40} color="var(--ghana-gold)" />
          <div>
            <h1 className="text-2xl font-bold">🇬🇭 Akwaaba! My Business</h1>
            <p className="text-sm text-red-200 mt-1">"Sankofa" — Look back to move forward. Everything in your business, right now.</p>
          </div>
        </div>
      </div>
      <GhanaFlagStripe height={6} showStar className="mb-3 rounded-full" />

      {/* Period selector — Ghana gold active */}
      <div className="flex gap-2 mb-3">
        {[
          { key: 'today', label: '📅 Today' },
          { key: 'week', label: '📊 This Week' },
          { key: 'month', label: '📈 This Month' },
        ].map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              period === p.key
                ? 'text-white'
                : 'text-gray-600 hover:bg-gray-200'
            }`}
            style={period === p.key ? {background: 'var(--ghana-green)'} : {background: '#f3f4f6'}}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TODAY'S SNAPSHOT — Big numbers, easy to read
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        {/* Today's Sales */}
        <div className="text-white rounded-2xl p-5" style={{background: 'var(--ghana-black)'}}>
          <p className="text-xs font-medium uppercase tracking-wide" style={{color: 'var(--ghana-gold)'}}>★ Sales Today</p>
          <p className="text-3xl font-bold tabular-nums mt-2">{formatGHS(todayRevenue)}</p>
          <div className="mt-2">
            <Compare current={todayRevenue} previous={yesterdayRevenue} label="vs yesterday" />
          </div>
        </div>

        {/* Profit Today */}
        <div className={`rounded-2xl p-4 ${todayProfit >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Profit Today</p>
          <p className={`text-3xl font-bold tabular-nums mt-2 ${todayProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {formatGHS(todayProfit)}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            {todayTransactions} sale{todayTransactions !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Average Sale */}
        <div className="bg-white rounded-2xl p-4 border border-gray-200">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Avg. Sale</p>
          <p className="text-3xl font-bold text-gray-900 tabular-nums mt-2">{formatGHS(avgToday)}</p>
          <div className="mt-2">
            <Compare current={avgToday} previous={avgYesterday} />
          </div>
        </div>

        {/* Money Owed to You */}
        <div className={`rounded-2xl p-4 ${totalOwedToYou > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-white border border-gray-200'}`}>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Owed to You</p>
          <p className={`text-3xl font-bold tabular-nums mt-2 ${totalOwedToYou > 0 ? 'text-amber-700' : 'text-gray-900'}`}>
            {formatGHS(totalOwedToYou)}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            {pendingInvoices.length} pending
          </p>
        </div>

        {/* Stock Value */}
        <div className="bg-white rounded-2xl p-4 border border-gray-200">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Stock Value</p>
          <p className="text-3xl font-bold text-gray-900 tabular-nums mt-2">{formatGHS(stockAtCost)}</p>
          <p className="text-xs text-gray-500 mt-2">
            {lowStockCount > 0 ? (
              <span className="text-amber-600 font-medium">⚠ {lowStockCount} low/out</span>
            ) : (
              <span className="text-green-600">All stocked</span>
            )}
          </p>
        </div>


      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          PERIOD SUMMARY — Bigger section with more detail
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
        {/* Period overview */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            {period === 'today' ? "Today's" : period === 'week' ? "This Week's" : "This Month's"} Summary
          </h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">💰 Total Sales</span>
              <span className="text-lg font-bold tabular-nums text-gray-900">{formatGHS(periodRevenue)}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">📈 Profit</span>
              <span className={`text-lg font-bold tabular-nums ${periodProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatGHS(periodProfit)}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">📊 Profit Margin</span>
              <span className={`text-lg font-bold tabular-nums ${profitMargin >= 20 ? 'text-green-700' : profitMargin >= 5 ? 'text-amber-700' : 'text-red-700'}`}>
                {profitMargin.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">🧾 Number of Sales</span>
              <span className="text-lg font-bold tabular-nums text-gray-900">{periodTransactions}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-gray-600">📦 Units Sold</span>
              <span className="text-lg font-bold tabular-nums text-gray-900">{periodUnits}</span>
            </div>
          </div>
        </div>

        {/* Branch performance — tube visual */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-4">
            <Funtunfunefu size={18} className="text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900">Store Performance</h2>
          </div>
          {branchRevenue.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">No sales data yet.</p>
          ) : (
            <div className="flex items-end justify-around gap-3 overflow-x-auto py-4">
              {branchRevenue.map((b, i) => {
                const maxRev = branchRevenue[0]?.revenue || 1;
                const fillPct = (b.revenue / maxRev) * 100;
                const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7'];
                return (
                  <PerformanceTube
                    key={b.name}
                    fillPct={fillPct}
                    label={b.name}
                    value={formatGHS(b.revenue)}
                    color={colors[i % colors.length]}
                    height={100}
                    width={40}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TOP PRODUCTS — Simple list
          ═══════════════════════════════════════════════════════════════════ */}
      {topProducts.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Top Selling Products</h2>
          <p className="text-xs text-gray-400 mb-4">What's making you money</p>
          <div className="space-y-2">
            {topProducts.map((p, i) => {
              const margin = p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0;
              const profit = p.revenue - p.cost;
              return (
                <div key={p.name} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                  <span className="text-lg w-8 text-center font-bold text-gray-400">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{p.units} units sold</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums text-gray-900">{formatGHS(p.revenue)}</p>
                    <p className={`text-xs font-medium tabular-nums ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {profit >= 0 ? '+' : ''}{formatGHS(profit)} ({margin.toFixed(0)}%)
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          QUICK LINKS — Simple navigation
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        {[
          { to: '/owner/stores', icon: <Nsoromma size={28} color="white" />, label: '🏪 Stores', bg: 'var(--ghana-green)' },
          { to: '/owner/money', icon: <IconCurrency size={28} />, label: '💰 Sika (Money)', bg: 'var(--ghana-gold)' },
          { to: '/owner/team', icon: <Adinkrahene size={28} color="white" />, label: '👥 Adwo (Team)', bg: 'var(--kente-indigo)' },
          { to: '/owner/features', icon: <GyeNyame size={28} color="white" />, label: '⚙️ Nhyehyee (Settings)', bg: 'var(--kente-teal)' },
        ].map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="rounded-2xl p-4 text-center transition-all hover:-translate-y-0.5"
            style={{background: link.bg, color: link.bg === 'var(--ghana-gold)' ? 'var(--ghana-black)' : 'white'}}
          >
            <span className="flex justify-center mb-2">{link.icon}</span>
            <span className="text-sm font-bold">{link.label}</span>
          </Link>
        ))}
      </div>
    </DashboardLayout>
  );
}
