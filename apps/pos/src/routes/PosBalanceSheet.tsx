import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import type { Product, InventoryAllocation, QueuedSale } from '@branchport/shared';
import { saleBaseUnits } from '@branchport/shared';

function formatGHS(n: number): string {
  return `GHS ${n.toFixed(2)}`;
}

function costPerUnit(p: Product): number {
  return p.units_per_bulk > 0 ? p.bulk_cost_price / p.units_per_bulk : 0;
}

export default function PosBalanceSheet() {
  const { profile } = useAuth();
  const products = useLiveQuery(() => db.products.toArray(), []) ?? [];
  const allocations = useLiveQuery(() => db.allocations.toArray(), []) ?? [];
  const sales = useLiveQuery(() => db.sales.toArray(), []) ?? [];
  const invoices = useLiveQuery(() => db.invoices.toArray(), []) ?? [];
  const debtors = useLiveQuery(() => db.debtors.toArray(), []) ?? [];
  const creditors = useLiveQuery(() => db.creditors.toArray(), []) ?? [];

  const branchId = profile?.branch_id;

  const balanceSheet = useMemo(() => {
    if (!branchId) return null;

    const branchAllocations = allocations.filter((a) => a.branch_id === branchId);
    const branchSales = sales.filter((s) => s.branch_id === branchId);
    const branchInvoices = invoices.filter((i) => i.branch_id === branchId);
    const branchDebtors = debtors.filter((d) => d.branch_id === branchId);
    const branchCreditors = creditors; // creditors are business-wide

    // ── ASSETS ──

    // 1. Inventory at cost
    const inventoryItems = products.map((product) => {
      const alloc = branchAllocations
        .filter((a) => a.product_id === product.id)
        .reduce((sum, a) => sum + Number(a.retail_quantity_equivalent), 0);
      const sold = branchSales
        .filter((s) => s.product_id === product.id)
        .reduce((sum, s) => sum + Number(s.quantity) * saleBaseUnits(product, s), 0);
      const remaining = Math.max(alloc - sold, 0);
      return {
        product,
        remaining,
        costValue: remaining * costPerUnit(product),
        retailValue: remaining * product.retail_sell_price,
      };
    }).filter((i) => i.remaining > 0);

    const inventoryValue = inventoryItems.reduce((s, i) => s + i.costValue, 0);
    const inventoryRetailValue = inventoryItems.reduce((s, i) => s + i.retailValue, 0);

    // 2. Accounts Receivable (customers owe from partial/credit sales)
    const accountsReceivable = branchDebtors
      .filter((d) => d.amount_owed > 0)
      .reduce((s, d) => s + d.amount_owed, 0);

    const totalAssets = inventoryValue + accountsReceivable;

    // ── LIABILITIES ──
    const accountsPayable = branchCreditors
      .filter((c) => c.amount_owed > 0)
      .reduce((s, c) => s + c.amount_owed, 0);

    // ── REVENUE & COSTS ──
    const totalRevenue = branchSales.reduce((s, sale) => s + Number(sale.total_price), 0);
    const totalCOGS = branchSales.reduce((s, sale) => {
      const product = products.find((p) => p.id === sale.product_id);
      if (!product) return s;
      return s + Number(sale.quantity) * costPerUnit(product) * saleBaseUnits(product, sale);
    }, 0);
    const grossProfit = totalRevenue - totalCOGS;

    // Pending invoices total
    const pendingInvoices = branchInvoices.filter((i) => i.status === 'pending');
    const pendingValue = pendingInvoices.reduce((s, i) => s + i.grand_total, 0);

    // ── EQUITY ──
    const totalEquity = grossProfit;

    return {
      branchName: profile?.name ?? 'Branch',
      inventoryItems,
      inventoryValue,
      inventoryRetailValue,
      accountsReceivable,
      totalAssets,
      accountsPayable,
      totalLiabilities: accountsPayable,
      totalRevenue,
      totalCOGS,
      grossProfit,
      totalEquity,
      pendingInvoices: pendingInvoices.length,
      pendingValue,
      totalSales: branchSales.length,
    };
  }, [branchId, products, allocations, sales, invoices, debtors, creditors, profile]);

  if (!balanceSheet) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-gray-500">No branch assigned.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Balance Sheet</h1>
            <p className="text-sm text-gray-500 mt-1">{balanceSheet.branchName} — financial position</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">{profile?.name}</p>
            <p className="text-xs text-gray-500">Staff • Balance sheet</p>
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <Link
            to="/"
            className="flex-shrink-0 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-center text-[10px] sm:text-sm font-medium hover:bg-gray-200 min-h-[36px] flex items-center"
          >
            POS
          </Link>
          <Link
            to="/invoices"
            className="flex-shrink-0 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-center text-[10px] sm:text-sm font-medium hover:bg-gray-200 min-h-[36px] flex items-center"
          >
            Invoices
          </Link>
          <Link
            to="/balance-sheet"
            className="flex-shrink-0 px-3 py-2 rounded-lg bg-gray-900 text-white text-center text-[10px] sm:text-sm font-medium min-h-[36px] flex items-center"
          >
            Balance Sheet
          </Link>
          <Link
            to="/dashboard"
            className="flex-shrink-0 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-center text-[10px] sm:text-sm font-medium hover:bg-gray-200 min-h-[36px] flex items-center"
          >
            Inventory
          </Link>
        </div>
      </header>

      <div className="flex-1 px-4 py-6 max-w-4xl mx-auto w-full space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <div className="bg-gray-900 text-white rounded-2xl p-4 shadow-sm">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Total Assets</p>
            <p className="text-xl font-bold tabular-nums mt-1">{formatGHS(balanceSheet.totalAssets)}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Total Revenue</p>
            <p className="text-xl font-bold text-gray-900 tabular-nums mt-1">{formatGHS(balanceSheet.totalRevenue)}</p>
            <p className="text-[10px] text-gray-400 mt-1">{balanceSheet.totalSales} sales</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Gross Profit</p>
            <p className={`text-xl font-bold tabular-nums mt-1 ${balanceSheet.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {formatGHS(balanceSheet.grossProfit)}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Pending</p>
            <p className="text-xl font-bold text-amber-700 tabular-nums mt-1">{formatGHS(balanceSheet.pendingValue)}</p>
            <p className="text-[10px] text-gray-400 mt-1">{balanceSheet.pendingInvoices} invoices</p>
          </div>
        </div>

        {/* ASSETS */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Assets</h2>
              <p className="text-xs text-gray-500 mt-1">What this branch owns</p>
            </div>
            <span className="text-lg font-bold tabular-nums">{formatGHS(balanceSheet.totalAssets)}</span>
          </div>

          <div className="px-6 py-3">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Current Assets</p>
          </div>

          <div className="px-6 py-2 flex justify-between text-sm">
            <span className="text-gray-600">Inventory (at cost)</span>
            <span className="font-medium tabular-nums text-orange-700">{formatGHS(balanceSheet.inventoryValue)}</span>
          </div>
          <div className="px-6 py-2 flex justify-between text-sm">
            <span className="text-gray-600">Inventory (at retail)</span>
            <span className="font-medium tabular-nums text-blue-600">{formatGHS(balanceSheet.inventoryRetailValue)}</span>
          </div>
          <div className="px-6 py-2 flex justify-between text-sm">
            <span className="text-gray-600">Accounts Receivable</span>
            <span className="font-medium tabular-nums">{formatGHS(balanceSheet.accountsReceivable)}</span>
          </div>

          <div className="px-6 py-3 bg-gray-50 flex justify-between text-sm border-t border-gray-200">
            <span className="font-bold text-gray-900">Total Assets</span>
            <span className="font-bold tabular-nums">{formatGHS(balanceSheet.totalAssets)}</span>
          </div>
        </div>

        {/* LIABILITIES */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Liabilities</h2>
              <p className="text-xs text-gray-500 mt-1">What this branch owes</p>
            </div>
            <span className="text-lg font-bold tabular-nums">{formatGHS(balanceSheet.totalLiabilities)}</span>
          </div>

          <div className="px-6 py-2 flex justify-between text-sm">
            <span className="text-gray-600">Accounts Payable (suppliers)</span>
            <span className="font-medium tabular-nums text-red-600">{formatGHS(balanceSheet.accountsPayable)}</span>
          </div>

          <div className="px-6 py-3 bg-gray-50 flex justify-between text-sm border-t border-gray-200">
            <span className="font-bold text-gray-900">Total Liabilities</span>
            <span className="font-bold tabular-nums">{formatGHS(balanceSheet.totalLiabilities)}</span>
          </div>
        </div>

        {/* EQUITY */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Owner's Equity</h2>
              <p className="text-xs text-gray-500 mt-1">Net worth from this branch</p>
            </div>
            <span className={`text-lg font-bold tabular-nums ${balanceSheet.totalEquity >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {formatGHS(balanceSheet.totalEquity)}
            </span>
          </div>

          <div className="px-6 py-2 flex justify-between text-sm">
            <span className="text-gray-600">Sales Revenue</span>
            <span className="font-medium tabular-nums text-blue-700">{formatGHS(balanceSheet.totalRevenue)}</span>
          </div>
          <div className="px-6 py-2 flex justify-between text-sm">
            <span className="text-gray-600">Cost of Goods Sold</span>
            <span className="font-medium tabular-nums text-orange-700">({formatGHS(balanceSheet.totalCOGS)})</span>
          </div>
          <div className="px-6 py-3 bg-gray-50 flex justify-between text-sm border-t border-gray-200">
            <span className="font-bold text-gray-900">Gross Profit</span>
            <span className={`font-bold tabular-nums ${balanceSheet.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {formatGHS(balanceSheet.grossProfit)}
            </span>
          </div>
        </div>

        {/* Accounting equation */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Accounting Equation</p>
              <p className="text-sm text-gray-500 mt-1">Assets = Liabilities + Equity</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold tabular-nums">{formatGHS(balanceSheet.totalAssets)}</p>
              <p className="text-sm text-gray-500">
                = {formatGHS(balanceSheet.totalLiabilities)} + {formatGHS(balanceSheet.totalEquity)}
              </p>
            </div>
          </div>
        </div>

        {/* Inventory detail */}
        {balanceSheet.inventoryItems.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">Inventory detail</h2>
              <p className="text-xs text-gray-500 mt-1">Stock at this branch with cost and retail values</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Item</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Remaining</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Cost Value</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Retail Value</th>
                  </tr>
                </thead>
                <tbody>
                  {balanceSheet.inventoryItems.map((item) => (
                    <tr key={item.product.id} className="border-b border-gray-100">
                      <td className="px-6 py-3">
                        <p className="font-medium text-gray-900">{item.product.name}</p>
                        <p className="text-xs text-gray-500">{item.product.retail_unit_name}s</p>
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums font-medium">{item.remaining}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-orange-700">{formatGHS(item.costValue)}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-blue-700">{formatGHS(item.retailValue)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-900 bg-gray-50">
                    <td className="px-6 py-3 font-bold">Total</td>
                    <td className="px-6 py-3 text-right font-bold tabular-nums">
                      {balanceSheet.inventoryItems.reduce((s, i) => s + i.remaining, 0)}
                    </td>
                    <td className="px-6 py-3 text-right font-bold tabular-nums text-orange-700">
                      {formatGHS(balanceSheet.inventoryValue)}
                    </td>
                    <td className="px-6 py-3 text-right font-bold tabular-nums text-blue-700">
                      {formatGHS(balanceSheet.inventoryRetailValue)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
