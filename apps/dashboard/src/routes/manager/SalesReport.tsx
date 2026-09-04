import { useEffect, useMemo, useState } from 'react';
import BackButton from '../../components/BackButton';
import DashboardLayout from '../../components/DashboardLayout';
import { RevenueByDay, RevenueByBranch } from '../../lib/charts';
import { supabase } from '../../lib/supabase';
import type { Branch, Product, Sale, AppUser } from '@branchport/shared';
import { downloadCsv, formatGHS, startOfToday, startOfWeek, startOfMonth } from '../../lib/utils';

interface Row {
  id: string;
  branch_id: string;
  branch_name: string;
  product_id: string;
  product_name: string;
  unit_type: 'bulk' | 'retail';
  quantity: number;
  unit_price: number;
  total_price: number;
  price_flagged: boolean;
  sold_at: string;
  sold_by_name: string;
}

const PERIODS: Array<{ key: string; label: string; from: () => string }> = [
  { key: 'today', label: 'Today', from: startOfToday },
  { key: 'week', label: 'This week', from: startOfWeek },
  { key: 'month', label: 'This month', from: startOfMonth },
  { key: '30d', label: 'Last 30 days', from: () => { const d = new Date(); d.setDate(d.getDate() - 30); d.setHours(0, 0, 0, 0); return d.toISOString(); } },
];

const UNIT_LABEL: Record<'bulk' | 'retail', string> = { bulk: 'Bulk', retail: 'Retail' };

export default function SalesReport() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [sales, setSales] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30d');
  const [branchId, setBranchId] = useState('all');
  const [productId, setProductId] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    (async () => {
      const [b, p, u] = await Promise.all([
        supabase.from('branches').select('*'),
        supabase.from('products').select('*'),
        supabase.from('users').select('id, name'),
      ]);
      setBranches((b.data as Branch[]) ?? []);
      setProducts((p.data as Product[]) ?? []);
      setUsers((u.data as AppUser[]) ?? []);
    })();
  }, []);

  useEffect(() => {
    let fromIso = from;
    if (period !== 'custom') {
      const found = PERIODS.find((x) => x.key === period);
      fromIso = found ? found.from() : '';
    }
    const toIso = to ? new Date(new Date(to).setHours(23, 59, 59, 999)).toISOString() : '';

    setLoading(true);
    let q = supabase
      .from('sales')
      .select('*')
      .order('sold_at', { ascending: false });
    if (fromIso) q = q.gte('sold_at', fromIso);
    if (toIso) q = q.lte('sold_at', toIso);
    if (branchId !== 'all') q = q.eq('branch_id', branchId);
    if (productId !== 'all') q = q.eq('product_id', productId);

    q.then(({ data, error }) => {
      if (error) console.error(error.message);
      const rows = ((data as Sale[]) ?? []).map((s) => ({
        id: s.id,
        branch_id: s.branch_id,
        branch_name: branches.find((b) => b.id === s.branch_id)?.name ?? '—',
        product_id: s.product_id,
        product_name: products.find((p) => p.id === s.product_id)?.name ?? '—',
        unit_type: s.unit_type,
        quantity: Number(s.quantity),
        unit_price: Number(s.unit_price),
        total_price: Number(s.total_price),
        price_flagged: s.price_flagged,
        sold_at: s.sold_at,
        sold_by_name: users.find((u) => u.id === s.sold_by)?.name ?? '—',
      }));
      setSales(rows);
      setLoading(false);
    });
  }, [period, branchId, productId, from, to, branches, products, users]);

  const totals = useMemo(() => {
    return {
      revenue: sales.reduce((sum, s) => sum + s.total_price, 0),
      transactions: sales.length,
      units: sales.reduce((sum, s) => sum + s.quantity, 0),
      flagged: sales.filter((s) => s.price_flagged).length,
    };
  }, [sales]);

  const daily = useMemo(() => {
    const map = new Map<string, { label: string; revenue: number; transactions: number }>();
    for (const s of sales) {
      const d = new Date(s.sold_at);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const cur = map.get(key) ?? { label, revenue: 0, transactions: 0 };
      cur.revenue += s.total_price;
      cur.transactions += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => (a.label < b.label ? -1 : 1));
  }, [sales]);

  const byBranch = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sales) map.set(s.branch_name, (map.get(s.branch_name) ?? 0) + s.total_price);
    return Array.from(map.entries())
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [sales]);

  const byProduct = useMemo(() => {
    const map = new Map<string, { revenue: number; units: number; flagged: number }>();
    for (const s of sales) {
      const cur = map.get(s.product_name) ?? { revenue: 0, units: 0, flagged: 0 };
      cur.revenue += s.total_price;
      cur.units += s.quantity;
      if (s.price_flagged) cur.flagged += 1;
      map.set(s.product_name, cur);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);
  }, [sales]);

  function exportCsv() {
    downloadCsv(
      `sales-report-${period}.csv`,
      [
        ['Date', 'Branch', 'Product', 'Unit type', 'Quantity', 'Unit price', 'Total', 'Flagged', 'Sold by'],
        ...sales.map((s) => [
          new Date(s.sold_at).toLocaleString(),
          s.branch_name,
          s.product_name,
          UNIT_LABEL[s.unit_type],
          String(s.quantity),
          formatGHS(s.unit_price),
          formatGHS(s.total_price),
          s.price_flagged ? 'yes' : '',
          s.sold_by_name,
        ]),
      ]
    );
  }

  return (
    <DashboardLayout>
      <BackButton />
      <div>
        <div>
          <h1 className="page-title">Sales report</h1>
          <p className="page-sub">Filter, compare and export transactions.</p>
        </div>
        <button
          onClick={exportCsv}
          disabled={sales.length === 0}
          className="btn btn-primary"
        >
          Export CSV
        </button>
      </div>

      <div className="card p-4 mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="label">Period</label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="select"
          >
            {PERIODS.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
            <option value="custom">Custom…</option>
          </select>
        </div>
        {period === 'custom' && (
          <>
            <div>
              <label className="label">From</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="select" />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="select" />
            </div>
          </>
        )}
        <div>
          <label className="label">Branch</label>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="select">
            <option value="all">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Product</label>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="select">
            <option value="all">All products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6 lg:grid-cols-4">
        <div className="card p-6">
          <p className="stat-label">Revenue</p>
          <p className="stat-value">{formatGHS(totals.revenue)}</p>
        </div>
        <div className="card p-6">
          <p className="stat-label">Transactions</p>
          <p className="stat-value">{totals.transactions}</p>
        </div>
        <div className="card p-6">
          <p className="stat-label">Units sold</p>
          <p className="stat-value">{totals.units}</p>
        </div>
        <div className="card p-6">
          <p className="stat-label">Pricing flags</p>
          <p className="stat-value">{totals.flagged}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        <div className="card p-6">
          <p className="text-sm font-medium text-gray-700 mb-4">Revenue by day</p>
          {daily.length === 0 ? (
            <p className="text-sm text-gray-400">No sales in this range.</p>
          ) : (
            <RevenueByDay data={daily.map((d) => ({ label: d.label, value: d.revenue }))} />
          )}
        </div>

        <div className="card p-6">
          <p className="text-sm font-medium text-gray-700 mb-4">Revenue by branch</p>
          {byBranch.length === 0 ? (
            <p className="text-sm text-gray-400">No sales in this range.</p>
          ) : (
            <RevenueByBranch data={byBranch.map((b) => ({ label: b.name, value: b.revenue }))} />
          )}
        </div>
      </div>

      <div className="card overflow-hidden mb-6">
        <p className="card-header">Top products in this range</p>
        {byProduct.length === 0 ? (
          <p className="p-6 text-gray-500 text-sm">No sales in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-head">Product</th>
                  <th className="table-head text-right">Units</th>
                  <th className="table-head text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {byProduct.map((p) => (
                  <tr key={p.name} className="border-t">
                    <td className="px-5 py-3">
                      <span className="font-medium">{p.name}</span>
                      {p.flagged > 0 && <span className="ml-2 tag tag-warn">{p.flagged} flagged</span>}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{p.units}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium">{formatGHS(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <p className="card-header">Transactions</p>
        {loading ? (
          <p className="p-6 text-gray-500 text-sm">Loading…</p>
        ) : sales.length === 0 ? (
          <p className="p-6 text-gray-500 text-sm">No transactions in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left">
                <tr>
                  <th className="table-head">Date</th>
                  <th className="table-head">Branch</th>
                  <th className="table-head">Product</th>
                  <th className="table-head">Type</th>
                  <th className="table-head text-right">Qty</th>
                  <th className="table-head text-right">Unit</th>
                  <th className="table-head text-right">Total</th>
                  <th className="table-head">By</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-4 py-2">{new Date(s.sold_at).toLocaleString()}</td>
                    <td className="px-4 py-2">{s.branch_name}</td>
                    <td className="px-4 py-2">
                      {s.product_name}
                      {s.price_flagged && <span className="ml-2 tag tag-warn">flagged</span>}
                    </td>
                    <td className="px-4 py-2">{UNIT_LABEL[s.unit_type]}</td>
                    <td className="px-4 py-2 text-right">{s.quantity}</td>
                    <td className="px-4 py-2 text-right">{formatGHS(s.unit_price)}</td>
                    <td className="px-4 py-2 text-right">{formatGHS(s.total_price)}</td>
                    <td className="px-4 py-2">{s.sold_by_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}