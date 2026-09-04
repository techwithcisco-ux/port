import { useEffect, useMemo, useState } from 'react';
import BackButton from '../../components/BackButton';
import DashboardLayout from '../../components/DashboardLayout';
import { ColorLegend, StatusBadge, ColorStatCard, BarMeter } from '../../components/Visuals';
import { supabase } from '../../lib/supabase';
import { formatGHS } from '../../lib/utils';
import type {
  Branch, Product, InventoryAllocation, Sale,
  Debtor, Creditor, ExpensePayment,
} from '@branchport/shared';
import { saleBaseUnits } from '@branchport/shared';

function costPerUnit(p: Product): number {
  return p.units_per_bulk > 0 ? p.bulk_cost_price / p.units_per_bulk : 0;
}

export default function BalanceSheet() {
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allocations, setAllocations] = useState<InventoryAllocation[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [creditors, setCreditors] = useState<Creditor[]>([]);
  const [expensePayments, setExpensePayments] = useState<ExpensePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    (async () => {
      const [p, b, a, s, d, c, ep] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('branches').select('*'),
        supabase.from('inventory_allocations').select('*'),
        supabase.from('sales').select('*'),
        supabase.from('debtors').select('*'),
        supabase.from('creditors').select('*'),
        supabase.from('expense_payments').select('*'),
      ]);
      setProducts((p.data as Product[]) ?? []);
      setBranches((b.data as Branch[]) ?? []);
      setAllocations((a.data as InventoryAllocation[]) ?? []);
      setSales((s.data as Sale[]) ?? []);
      setDebtors((d.data as Debtor[]) ?? []);
      setCreditors((c.data as Creditor[]) ?? []);
      setExpensePayments((ep.data as ExpensePayment[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const bs = useMemo(() => {
    const asOf = asOfDate + 'T23:59:59.999Z';
    const inventoryByProduct = products.map((product) => {
      const alloc = allocations.filter((a) => a.product_id === product.id).reduce((sum, a) => sum + Number(a.retail_quantity_equivalent), 0);
      const sold = sales.filter((s) => s.product_id === product.id && s.sold_at <= asOf).reduce((sum, s) => sum + Number(s.quantity) * saleBaseUnits(product, s), 0);
      const remaining = Math.max(alloc - sold, 0);
      return { product, remaining, value: remaining * costPerUnit(product) };
    });
    const inventoryValue = inventoryByProduct.reduce((s, i) => s + i.value, 0);
    const accountsReceivable = debtors.filter((d) => d.amount_owed > 0 && d.created_at <= asOf).reduce((s, d) => s + d.amount_owed, 0);
    const totalCurrentAssets = inventoryValue + accountsReceivable;
    const accountsPayable = creditors.filter((c) => c.amount_owed > 0 && c.created_at <= asOf).reduce((s, c) => s + c.amount_owed, 0);
    const totalExpensesPaid = expensePayments.filter((ep) => ep.paid_at <= asOf).reduce((s, ep) => s + ep.amount, 0);
    const totalRevenue = sales.filter((s) => s.sold_at <= asOf).reduce((sum, s) => sum + Number(s.total_price), 0);
    const totalCOGS = sales.filter((s) => s.sold_at <= asOf).reduce((sum, s) => {
      const product = products.find((p) => p.id === s.product_id);
      if (!product) return sum;
      return sum + Number(s.quantity) * costPerUnit(product) * saleBaseUnits(product, s);
    }, 0);
    const grossProfit = totalRevenue - totalCOGS;
    const netProfit = grossProfit - totalExpensesPaid;
    return {
      asOf, inventoryByProduct: inventoryByProduct.filter((i) => i.remaining > 0), inventoryValue, accountsReceivable,
      totalCurrentAssets, accountsPayable, totalLiabilities: accountsPayable, totalEquity: netProfit,
      totalRevenue, totalCOGS, grossProfit, totalExpensesPaid, netProfit,
    };
  }, [products, branches, allocations, sales, debtors, creditors, expensePayments, asOfDate]);

  const equationBalanced = Math.abs(bs.totalCurrentAssets - (bs.totalLiabilities + bs.totalEquity)) < 0.01;

  return (
    <DashboardLayout>
      <BackButton />
      <div>
        <div>
          <h1 className="page-title">📊 Balance Sheet</h1>
          <p className="page-sub">Professional statement of financial position — colors tell the story.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="label mb-0">As of</label>
          <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="select" />
        </div>
      </div>

      <ColorLegend items={[
        { color: 'bg-blue-500', label: 'Assets (what you own)' },
        { color: 'bg-red-500', label: 'Liabilities (what you owe)' },
        { color: 'bg-green-500', label: 'Equity (your net worth)' },
        { color: 'bg-amber-500', label: 'Warning / Pending' },
      ]} className="mb-6" />

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <div className="max-w-5xl space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ColorStatCard label="Total Assets" value={formatGHS(bs.totalCurrentAssets)} color="blue" icon="🏦" sublabel="What the business owns" />
            <ColorStatCard label="Total Liabilities" value={formatGHS(bs.totalLiabilities)} color="red" icon="📋" sublabel="What the business owes" />
            <ColorStatCard label="Owner's Equity" value={formatGHS(bs.totalEquity)} color={bs.totalEquity >= 0 ? 'green' : 'red'} icon={bs.totalEquity >= 0 ? '👑' : '⚠️'} sublabel="Net worth" />
          </div>

          {/* ── ASSETS ── */}
          <div className="card overflow-hidden border-l-4 border-l-blue-500">
            <div className="px-5 py-3.5 border-b border-blue-100 flex items-center justify-between bg-blue-50/30">
              <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wide">🏦 Assets</h3>
              <span className="text-lg font-bold tabular-nums text-blue-700">{formatGHS(bs.totalCurrentAssets)}</span>
            </div>
            <div className="px-5 py-2 bg-blue-50/20">
              <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide">Current Assets</p>
            </div>
            <div className="px-5 py-2.5 flex justify-between items-center">
              <span className="text-sm text-gray-600">📦 Inventory (stock at cost)</span>
              <span className="text-sm tabular-nums font-medium text-orange-700">{formatGHS(bs.inventoryValue)}</span>
            </div>
            {bs.inventoryByProduct.slice(0, 5).map((item) => (
              <div key={item.product.id} className="px-5 py-1.5 flex justify-between items-center pl-12">
                <span className="text-xs text-gray-500">{item.product.name} — {item.remaining} {item.product.retail_unit_name}s</span>
                <span className="text-xs tabular-nums text-gray-600">{formatGHS(item.value)}</span>
              </div>
            ))}
            <div className="px-5 py-2.5 flex justify-between items-center">
              <span className="text-sm text-gray-600">👤 Accounts Receivable (customers owe)</span>
              <span className="text-sm tabular-nums font-medium text-amber-700">{formatGHS(bs.accountsReceivable)}</span>
            </div>
            <div className="px-5 py-3 bg-blue-100/50 flex justify-between border-t border-blue-200">
              <span className="text-sm font-bold text-blue-900">Total Assets</span>
              <span className="text-sm font-bold tabular-nums text-blue-800">{formatGHS(bs.totalCurrentAssets)}</span>
            </div>
          </div>

          {/* ── LIABILITIES ── */}
          <div className="card overflow-hidden border-l-4 border-l-red-500">
            <div className="px-5 py-3.5 border-b border-red-100 flex items-center justify-between bg-red-50/30">
              <h3 className="text-sm font-bold text-red-900 uppercase tracking-wide">📋 Liabilities</h3>
              <span className="text-lg font-bold tabular-nums text-red-700">{formatGHS(bs.totalLiabilities)}</span>
            </div>
            <div className="px-5 py-2.5 flex justify-between items-center">
              <span className="text-sm text-gray-600">🏭 Accounts Payable (suppliers owed)</span>
              <span className="text-sm tabular-nums font-medium text-red-700">{formatGHS(bs.accountsPayable)}</span>
            </div>
            <div className="px-5 py-3 bg-red-100/50 flex justify-between border-t border-red-200">
              <span className="text-sm font-bold text-red-900">Total Liabilities</span>
              <span className="text-sm font-bold tabular-nums text-red-800">{formatGHS(bs.totalLiabilities)}</span>
            </div>
          </div>

          {/* ── EQUITY ── */}
          <div className={`card overflow-hidden border-l-4 ${bs.totalEquity >= 0 ? 'border-l-green-500' : 'border-l-red-500'}`}>
            <div className={`px-5 py-3.5 border-b flex items-center justify-between ${bs.totalEquity >= 0 ? 'border-b-green-100 bg-green-50/30' : 'border-b-red-100 bg-red-50/30'}`}>
              <h3 className={`text-sm font-bold uppercase tracking-wide ${bs.totalEquity >= 0 ? 'text-green-900' : 'text-red-900'}`}>👑 Owner's Equity</h3>
              <span className={`text-lg font-bold tabular-nums ${bs.totalEquity >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatGHS(bs.totalEquity)}</span>
            </div>
            <div className="px-5 py-2.5 flex justify-between items-center"><span className="text-sm text-gray-600">Revenue</span><span className="text-sm tabular-nums text-blue-700 font-medium">{formatGHS(bs.totalRevenue)}</span></div>
            <div className="px-5 py-2.5 flex justify-between items-center"><span className="text-sm text-gray-600">Cost of Goods Sold</span><span className="text-sm tabular-nums text-orange-700 font-medium">({formatGHS(bs.totalCOGS)})</span></div>
            <div className="px-5 py-2.5 flex justify-between items-center border-t border-gray-100"><span className="text-sm font-medium text-gray-700">Gross Profit</span><span className={`text-sm tabular-nums font-bold ${bs.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatGHS(bs.grossProfit)}</span></div>
            <div className="px-5 py-2.5 flex justify-between items-center"><span className="text-sm text-gray-600">Operating Expenses</span><span className="text-sm tabular-nums text-red-600 font-medium">({formatGHS(bs.totalExpensesPaid)})</span></div>
            <div className={`px-5 py-3 flex justify-between border-t-2 ${bs.totalEquity >= 0 ? 'bg-green-100/50 border-green-200' : 'bg-red-100/50 border-red-200'}`}>
              <span className={`text-sm font-bold ${bs.totalEquity >= 0 ? 'text-green-900' : 'text-red-900'}`}>Net Profit</span>
              <span className={`text-sm font-bold tabular-nums ${bs.totalEquity >= 0 ? 'text-green-800' : 'text-red-800'}`}>{formatGHS(bs.netProfit)}</span>
            </div>
          </div>

          {/* ── ACCOUNTING EQUATION ── */}
          <div className={`card p-6 border-l-4 ${equationBalanced ? 'border-l-green-500 bg-green-50/30' : 'border-l-amber-500 bg-amber-50/30'}`}>
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Accounting Equation</p>
                <p className="text-sm text-gray-600 mt-1">Assets = Liabilities + Equity</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold tabular-nums">{formatGHS(bs.totalCurrentAssets)}</p>
                <p className="text-sm text-gray-500">= {formatGHS(bs.totalLiabilities)} + {formatGHS(bs.totalEquity)}</p>
              </div>
            </div>
            <div className="mt-2">
              <StatusBadge color={equationBalanced ? 'green' : 'amber'}>{equationBalanced ? '✓ Balanced' : '⚠ Difference detected'}</StatusBadge>
            </div>
          </div>

          {/* ── INVENTORY BY BRANCH ── */}
          <div className="card overflow-hidden">
            <p className="card-header">Inventory by branch</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-head">Branch</th>
                    <th className="table-head text-right">Products</th>
                    <th className="table-head text-right">Units</th>
                    <th className="table-head text-right">Cost Value</th>
                    <th className="table-head w-32">Stock Level</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.map((branch) => {
                    const branchAlloc = allocations.filter((a) => a.branch_id === branch.id);
                    const branchSales = sales.filter((s) => s.branch_id === branch.id);
                    let totalUnits = 0, totalValue = 0;
                    const productCount = new Set(branchAlloc.map((a) => a.product_id)).size;
                    for (const product of products) {
                      const alloc = branchAlloc.filter((a) => a.product_id === product.id).reduce((sum, a) => sum + Number(a.retail_quantity_equivalent), 0);
                      const sold = branchSales.filter((s) => s.product_id === product.id).reduce((sum, s) => sum + Number(s.quantity) * saleBaseUnits(product, s), 0);
                      const remaining = Math.max(alloc - sold, 0);
                      totalUnits += remaining;
                      totalValue += remaining * costPerUnit(product);
                    }
                    const maxBranchValue = Math.max(...branches.map((b) => {
                      const ba = allocations.filter((a) => a.branch_id === b.id);
                      const bs2 = sales.filter((s) => s.branch_id === b.id);
                      return products.reduce((sum, product) => {
                        const alloc = ba.filter((a) => a.product_id === product.id).reduce((s, a) => s + Number(a.retail_quantity_equivalent), 0);
                        const sold = bs2.filter((s) => s.product_id === product.id).reduce((s, s2) => s + Number(s2.quantity) * saleBaseUnits(product, s2), 0);
                        return sum + Math.max(alloc - sold, 0) * costPerUnit(product);
                      }, 0);
                    }), 1);
                    const stockColor = totalValue > maxBranchValue * 0.5 ? 'green' : totalValue > maxBranchValue * 0.2 ? 'amber' : 'red';
                    return (
                      <tr key={branch.id} className="border-t">
                        <td className="px-5 py-3 font-medium">{branch.name}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{productCount}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{totalUnits.toLocaleString()}</td>
                        <td className="px-5 py-3 text-right tabular-nums font-medium text-orange-700">{formatGHS(totalValue)}</td>
                        <td className="px-5 py-3"><BarMeter value={totalValue} max={maxBranchValue} color={stockColor} height={6} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
