import { useEffect, useMemo, useState } from 'react';
import BackButton from '../../components/BackButton';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { formatGHS, startOfMonth, startOfWeek } from '../../lib/utils';
import type { Branch, Product, InventoryAllocation, Sale, InventoryIntake } from '@branchport/shared';
import { saleBaseUnits } from '@branchport/shared';

// ── Trading Account ────────────────────────────────────────────────────
// Traditional accounting trading account:
// Opening Stock + Purchases - Closing Stock = Cost of Goods Sold
// Sales Revenue - COGS = Gross Profit

const PERIODS: Array<{ key: string; label: string; from: () => string }> = [
  { key: 'week', label: 'This week', from: startOfWeek },
  { key: 'month', label: 'This month', from: startOfMonth },
  { key: '30d', label: 'Last 30 days', from: () => { const d = new Date(); d.setDate(d.getDate() - 30); d.setHours(0, 0, 0, 0); return d.toISOString(); } },
  { key: 'all', label: 'All time', from: () => '2000-01-01T00:00:00.000Z' },
];

function costPerUnit(p: Product): number {
  return p.units_per_bulk > 0 ? p.bulk_cost_price / p.units_per_bulk : 0;
}

interface ProductTrading {
  product: Product;
  openingStock: number;     // units at start of period
  openingStockValue: number;
  purchases: number;        // units purchased during period
  purchasesValue: number;
  closingStock: number;     // units remaining at end
  closingStockValue: number;
  cogs: number;             // Opening + Purchases - Closing
  salesRevenue: number;
  grossProfit: number;
}

export default function TradingAccount() {
  const [period, setPeriod] = useState('30d');
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allocations, setAllocations] = useState<InventoryAllocation[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [intakes, setIntakes] = useState<InventoryIntake[]>([]);
  const [allSales, setAllSales] = useState<Sale[]>([]); // all-time for opening stock calc
  const [allIntakes, setAllIntakes] = useState<InventoryIntake[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [p, b, a] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('branches').select('*'),
        supabase.from('inventory_allocations').select('*'),
      ]);
      setProducts((p.data as Product[]) ?? []);
      setBranches((b.data as Branch[]) ?? []);
      setAllocations((a.data as InventoryAllocation[]) ?? []);

      // All-time data for opening stock calculation
      const [allS, allI] = await Promise.all([
        supabase.from('sales').select('*'),
        supabase.from('inventory_intake').select('*'),
      ]);
      setAllSales((allS.data as Sale[]) ?? []);
      setAllIntakes((allI.data as InventoryIntake[]) ?? []);
    })();
  }, []);

  useEffect(() => {
    const found = PERIODS.find((x) => x.key === period);
    const from = found ? found.from() : '';
    setLoading(true);

    (async () => {
      let salesQ = supabase.from('sales').select('*');
      if (from && period !== 'all') salesQ = salesQ.gte('sold_at', from);
      const [s, i] = await Promise.all([
        salesQ,
        supabase.from('inventory_intake').select('*'),
      ]);
      setSales((s.data as Sale[]) ?? []);
      setIntakes((i.data as InventoryIntake[]) ?? []);
      setLoading(false);
    })();
  }, [period]);

  const tradingData = useMemo(() => {
    const found = PERIODS.find((x) => x.key === period);
    const periodFrom = found ? found.from() : '';

    return products.map((product): ProductTrading => {
      const cp = costPerUnit(product);

      // ── Total allocated (all-time) ──
      const totalAllocated = allocations
        .filter((a) => a.product_id === product.id)
        .reduce((sum, a) => sum + Number(a.retail_quantity_equivalent), 0);

      // ── All-time sold ──
      const allTimeSold = allSales
        .filter((s) => s.product_id === product.id)
        .reduce((sum, s) => sum + Number(s.quantity) * saleBaseUnits(product, s), 0);

      // ── All-time intake (purchases from suppliers) ──
      const allTimePurchasesBulk = allIntakes
        .filter((i) => i.product_id === product.id)
        .reduce((sum, i) => sum + Number(i.bulk_quantity), 0);
      const allTimePurchasesUnits = allTimePurchasesBulk * Number(product.units_per_bulk);

      // ── Current closing stock ──
      const closingStock = Math.max(totalAllocated - allTimeSold, 0);

      // ── Period sales revenue ──
      const periodSales = sales.filter((s) => s.product_id === product.id);
      const salesRevenue = periodSales.reduce((sum, s) => sum + Number(s.total_price), 0);
      const periodSoldUnits = periodSales.reduce(
        (sum, s) => sum + Number(s.quantity) * saleBaseUnits(product, s), 0
      );

      // ── Opening stock = closing + period sold - period purchases ──
      // (what we had at the start of the period)
      const periodPurchasesBulk = intakes
        .filter((i) => i.product_id === product.id && (!periodFrom || i.created_at >= periodFrom))
        .reduce((sum, i) => sum + Number(i.bulk_quantity), 0);
      const periodPurchasesUnits = periodPurchasesBulk * Number(product.units_per_bulk);

      const openingStock = Math.max(closingStock + periodSoldUnits - periodPurchasesUnits, 0);

      // ── Trading Account calc ──
      const openingStockValue = openingStock * cp;
      const purchases = periodPurchasesUnits;
      const purchasesValue = purchases * cp;
      const closingStockValue = closingStock * cp;
      const cogs = openingStockValue + purchasesValue - closingStockValue;
      const grossProfit = salesRevenue - cogs;

      return {
        product,
        openingStock,
        openingStockValue,
        purchases,
        purchasesValue,
        closingStock,
        closingStockValue,
        cogs,
        salesRevenue,
        grossProfit,
      };
    }).filter((t) => t.salesRevenue > 0 || t.openingStock > 0 || t.closingStock > 0)
      .sort((a, b) => b.salesRevenue - a.salesRevenue);
  }, [products, allocations, sales, intakes, allSales, allIntakes, period]);

  const totals = useMemo(() => ({
    openingStockValue: tradingData.reduce((s, t) => s + t.openingStockValue, 0),
    purchasesValue: tradingData.reduce((s, t) => s + t.purchasesValue, 0),
    closingStockValue: tradingData.reduce((s, t) => s + t.closingStockValue, 0),
    cogs: tradingData.reduce((s, t) => s + t.cogs, 0),
    salesRevenue: tradingData.reduce((s, t) => s + t.salesRevenue, 0),
    grossProfit: tradingData.reduce((s, t) => s + t.grossProfit, 0),
  }), [tradingData]);

  const grossMargin = totals.salesRevenue > 0
    ? ((totals.grossProfit / totals.salesRevenue) * 100).toFixed(1)
    : '0.0';

  return (
    <DashboardLayout>
      <BackButton />
      <div>
        <div>
          <h1 className="page-title">Trading Account</h1>
          <p className="page-sub">Opening stock, purchases, closing stock, and gross profit for the period.</p>
        </div>
        <div className="seg max-w-full overflow-x-auto">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`pill ${period === p.key ? 'pill-active' : ''}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-3 mb-3 max-w-4xl lg:grid-cols-3">
        <div className="card p-5">
          <p className="stat-label">Sales Revenue</p>
          <p className="stat-value text-blue-700">{loading ? '…' : formatGHS(totals.salesRevenue)}</p>
        </div>
        <div className="card p-5">
          <p className="stat-label">Cost of Goods Sold</p>
          <p className="stat-value text-orange-700">{loading ? '…' : formatGHS(totals.cogs)}</p>
        </div>
        <div className="card p-5">
          <p className="stat-label">Gross Profit</p>
          <p className={`stat-value ${totals.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {loading ? '…' : formatGHS(totals.grossProfit)}
          </p>
          <p className="text-xs text-gray-400 mt-1">{grossMargin}% margin</p>
        </div>
      </div>

      {/* Trading Account Statement */}
      <div className="card overflow-hidden max-w-4xl mb-3">
        <p className="card-header">Trading Account Statement</p>
        <div className="px-5 py-2 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Opening Stock (at cost)</span>
            <span className="font-medium tabular-nums">{formatGHS(totals.openingStockValue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Add: Purchases (at cost)</span>
            <span className="font-medium tabular-nums text-blue-600">+ {formatGHS(totals.purchasesValue)}</span>
          </div>
          <div className="flex justify-between border-t border-gray-200 pt-2">
            <span className="text-gray-600">Less: Closing Stock (at cost)</span>
            <span className="font-medium tabular-nums text-green-600">({formatGHS(totals.closingStockValue)})</span>
          </div>
          <div className="flex justify-between border-t border-gray-200 pt-2">
            <span className="font-semibold text-gray-900">= Cost of Goods Sold</span>
            <span className="font-semibold tabular-nums text-orange-700">{formatGHS(totals.cogs)}</span>
          </div>

          <div className="border-t border-gray-200 pt-2 mt-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Sales Revenue</span>
              <span className="font-medium tabular-nums text-blue-700">{formatGHS(totals.salesRevenue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Less: Cost of Goods Sold</span>
              <span className="font-medium tabular-nums text-orange-700">({formatGHS(totals.cogs)})</span>
            </div>
          </div>

          <div className="flex justify-between border-t-2 border-gray-900 pt-3">
            <span className="text-lg font-bold text-gray-900">= Gross Profit</span>
            <span className={`text-lg font-bold tabular-nums ${totals.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {formatGHS(totals.grossProfit)}
            </span>
          </div>
          <p className="text-xs text-gray-400 text-right">Gross margin: {grossMargin}%</p>
        </div>
      </div>

      {/* Per-product detail */}
      <div className="card overflow-hidden max-w-5xl">
        <p className="card-header">Product-wise trading details</p>
        {loading ? (
          <p className="p-4 text-gray-500 text-sm">Loading…</p>
        ) : tradingData.length === 0 ? (
          <p className="p-4 text-gray-500 text-sm">No trading activity in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-head">Product</th>
                  <th className="table-head text-right">Opening Stock</th>
                  <th className="table-head text-right">Purchases</th>
                  <th className="table-head text-right">Closing Stock</th>
                  <th className="table-head text-right">COGS</th>
                  <th className="table-head text-right">Revenue</th>
                  <th className="table-head text-right">Gross Profit</th>
                </tr>
              </thead>
              <tbody>
                {tradingData.map((t) => (
                  <tr key={t.product.id} className="border-t">
                    <td className="px-4 py-3 font-medium">{t.product.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                      {t.openingStock} {t.product.retail_unit_name}s
                      <br /><span className="text-xs">{formatGHS(t.openingStockValue)}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-blue-600">
                      {t.purchases} {t.product.retail_unit_name}s
                      <br /><span className="text-xs">{formatGHS(t.purchasesValue)}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-600">
                      {t.closingStock} {t.product.retail_unit_name}s
                      <br /><span className="text-xs">{formatGHS(t.closingStockValue)}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-orange-600 font-medium">
                      {formatGHS(t.cogs)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-blue-700 font-medium">
                      {formatGHS(t.salesRevenue)}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums font-bold ${t.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatGHS(t.grossProfit)}
                    </td>
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
