import { useEffect, useMemo, useState } from 'react';
import BackButton from '../../components/BackButton';
import DashboardLayout from '../../components/DashboardLayout';
import { ColorLegend, StatusBadge, ColorStatCard, BarMeter } from '../../components/Visuals';
import { supabase } from '../../lib/supabase';
import { formatGHS } from '../../lib/utils';
import type { Branch, Product, InventoryAllocation, Sale } from '@branchport/shared';
import { saleBaseUnits } from '@branchport/shared';

// ── Stock Balance ──────────────────────────────────────────────────────
// Shows quantity and cost of each item left across ALL branches combined,
// then can be narrowed down to each individual branch. Shows the total
// cost value of remaining stock.

interface ProductStock {
  product: Product;
  totalAllocated: number;
  totalSold: number;
  totalRemaining: number;
  totalCostValue: number;       // remaining × cost per unit
  totalRetailValue: number;     // remaining × retail price
  byBranch: BranchStock[];
}

interface BranchStock {
  branch: Branch;
  allocated: number;
  sold: number;
  remaining: number;
  costValue: number;
  retailValue: number;
}

function costPerUnit(p: Product): number {
  return p.units_per_bulk > 0 ? p.bulk_cost_price / p.units_per_bulk : 0;
}

function retailPerUnit(p: Product): number {
  return p.retail_sell_price;
}

export default function StockBalance() {
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allocations, setAllocations] = useState<InventoryAllocation[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      const [p, b, a, s] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('branches').select('*'),
        supabase.from('inventory_allocations').select('*'),
        supabase.from('sales').select('*'),
      ]);
      setProducts((p.data as Product[]) ?? []);
      setBranches((b.data as Branch[]) ?? []);
      setAllocations((a.data as InventoryAllocation[]) ?? []);
      setSales((s.data as Sale[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const stockByProduct = useMemo(() => {
    const result: ProductStock[] = [];

    for (const product of products) {
      const productAllocs = allocations.filter((a) => a.product_id === product.id);
      const productSales = sales.filter((s) => s.product_id === product.id);
      const cp = costPerUnit(product);
      const rp = retailPerUnit(product);

      const byBranch: BranchStock[] = [];
      for (const branch of branches) {
        const bAlloc = productAllocs
          .filter((a) => a.branch_id === branch.id)
          .reduce((sum, a) => sum + Number(a.retail_quantity_equivalent), 0);
        const bSold = productSales
          .filter((s) => s.branch_id === branch.id)
          .reduce((sum, s) => sum + Number(s.quantity) * saleBaseUnits(product, s), 0);
        const remaining = Math.max(bAlloc - bSold, 0);
        byBranch.push({
          branch,
          allocated: bAlloc,
          sold: bSold,
          remaining,
          costValue: remaining * cp,
          retailValue: remaining * rp,
        });
      }

      const totalAllocated = byBranch.reduce((s, b) => s + b.allocated, 0);
      const totalSold = byBranch.reduce((s, b) => s + b.sold, 0);
      const totalRemaining = Math.max(totalAllocated - totalSold, 0);

      result.push({
        product,
        totalAllocated,
        totalSold,
        totalRemaining,
        totalCostValue: totalRemaining * cp,
        totalRetailValue: totalRemaining * rp,
        byBranch,
      });
    }

    return result.sort((a, b) => b.totalCostValue - a.totalCostValue);
  }, [products, branches, allocations, sales]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return stockByProduct;
    return stockByProduct.filter((s) => s.product.name.toLowerCase().includes(term));
  }, [stockByProduct, search]);

  // Summary totals
  const totals = useMemo(() => {
    const relevant = selectedBranch === 'all'
      ? filtered
      : filtered.map((s) => {
          const bs = s.byBranch.find((b) => b.branch.id === selectedBranch);
          return {
            ...s,
            totalRemaining: bs?.remaining ?? 0,
            totalCostValue: bs?.costValue ?? 0,
            totalRetailValue: bs?.retailValue ?? 0,
          };
        });
    return {
      items: relevant.filter((s) => s.totalRemaining > 0).length,
      totalUnits: relevant.reduce((s, r) => s + r.totalRemaining, 0),
      totalCost: relevant.reduce((s, r) => s + r.totalCostValue, 0),
      totalRetail: relevant.reduce((s, r) => s + r.totalRetailValue, 0),
      potentialProfit: relevant.reduce((s, r) => s + (r.totalRetailValue - r.totalCostValue), 0),
    };
  }, [filtered, selectedBranch]);

  const selectedBranchObj = branches.find((b) => b.id === selectedBranch);

  return (
    <DashboardLayout>
      <BackButton />
      <div>
        <div>
          <h1 className="page-title">Stock Balance</h1>
          <p className="page-sub">
            {selectedBranch === 'all'
              ? 'Quantity and cost of goods across all branches combined.'
              : `Stock balance at ${selectedBranchObj?.name ?? 'branch'}.`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-3 flex flex-wrap gap-3 items-end max-w-4xl">
        <div className="flex-1 min-w-[200px]">
          <label className="label">Branch</label>
          <select
            value={selectedBranch}
            onChange={(e) => { setSelectedBranch(e.target.value); setExpandedProduct(null); }}
            className="select w-full"
          >
            <option value="all">All branches (combined)</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="label">Search items</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by product name…"
            className="input w-full"
          />
        </div>
      </div>

      <ColorLegend items={[{ color: 'bg-green-500', label: 'Healthy stock' }, { color: 'bg-amber-500', label: 'Low stock' }, { color: 'bg-red-500', label: 'Out of stock' }, { color: 'bg-blue-500', label: 'Revenue' }, { color: 'bg-orange-500', label: 'Cost value' }]} className="mb-3" />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-3 mb-3 max-w-5xl lg:grid-cols-5">
        <ColorStatCard label="Items in stock" value={loading ? '…' : String(totals.items)} color="blue" icon="📦" sublabel="Products with stock" />
        <ColorStatCard label="Total units" value={loading ? '…' : totals.totalUnits.toLocaleString()} color="purple" icon="📊" sublabel="Across all branches" />
        <ColorStatCard label="Cost value" value={loading ? '…' : formatGHS(totals.totalCost)} color="orange" icon="💵" sublabel="What stock cost you" />
        <ColorStatCard label="Retail value" value={loading ? '…' : formatGHS(totals.totalRetail)} color="blue" icon="💰" sublabel="What stock can sell for" />
        <ColorStatCard label="Potential profit" value={loading ? '…' : formatGHS(totals.potentialProfit)} color={totals.potentialProfit >= 0 ? 'green' : 'red'} icon={totals.potentialProfit >= 0 ? '📈' : '📉'} sublabel="If all stock sells" />
      </div>

      {/* Stock table */}
      <div className="card overflow-hidden max-w-5xl mb-3">
        <p className="card-header">
          {selectedBranch === 'all'
            ? 'Stock balance — all branches'
            : `Stock balance — ${selectedBranchObj?.name}`}
        </p>
        {loading ? (
          <p className="p-4 text-gray-500 text-sm">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-gray-500 text-sm">No products found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-head">Product</th>
                  <th className="table-head text-right">Allocated</th>
                  <th className="table-head text-right">Sold</th>
                  <th className="table-head text-right">Remaining</th>
                  <th className="table-head text-center">Health</th>
                  <th className="table-head text-right">Cost/unit</th>
                  <th className="table-head text-right">Cost value</th>
                  <th className="table-head text-right">Retail value</th>
                  {selectedBranch === 'all' && <th className="table-head text-center">Branches</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const cp = costPerUnit(s.product);
                  const isExpanded = expandedProduct === s.product.id;
                  const visibleRemaining = selectedBranch === 'all'
                    ? s.totalRemaining
                    : (s.byBranch.find((b) => b.branch.id === selectedBranch)?.remaining ?? 0);
                  const visibleCostValue = selectedBranch === 'all'
                    ? s.totalCostValue
                    : (s.byBranch.find((b) => b.branch.id === selectedBranch)?.costValue ?? 0);
                  const visibleRetailValue = selectedBranch === 'all'
                    ? s.totalRetailValue
                    : (s.byBranch.find((b) => b.branch.id === selectedBranch)?.retailValue ?? 0);

                  return (
                    <>
                      <tr
                        key={s.product.id}
                        className="border-t cursor-pointer hover:bg-gray-50"
                        onClick={() => setExpandedProduct(isExpanded ? null : s.product.id)}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-gray-400 text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>›</span>
                            <div>
                              <p className="font-medium">{s.product.name}</p>
                              <p className="text-xs text-gray-400">
                                {s.product.retail_unit_name} · {formatGHS(s.product.retail_sell_price)}/unit
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">
                          {selectedBranch === 'all' ? s.totalAllocated : (s.byBranch.find((b) => b.branch.id === selectedBranch)?.allocated ?? 0)}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-gray-500">
                          {selectedBranch === 'all' ? s.totalSold : (s.byBranch.find((b) => b.branch.id === selectedBranch)?.sold ?? 0)}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums font-medium">
                          <span className={visibleRemaining === 0 ? 'text-red-600' : ''}>
                            {visibleRemaining.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-5 py-3 w-24">
                          <BarMeter
                            value={visibleRemaining}
                            max={selectedBranch === 'all' ? s.totalAllocated : (s.byBranch.find((b) => b.branch.id === selectedBranch)?.allocated ?? 1)}
                            color={visibleRemaining === 0 ? 'red' : visibleRemaining < (selectedBranch === 'all' ? s.totalAllocated : (s.byBranch.find((b) => b.branch.id === selectedBranch)?.allocated ?? 1)) * 0.2 ? 'amber' : 'green'}
                            height={6}
                          />
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-gray-500">
                          {formatGHS(cp)}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums font-medium text-orange-700">
                          {formatGHS(visibleCostValue)}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums font-medium text-blue-700">
                          {formatGHS(visibleRetailValue)}
                        </td>
                        {selectedBranch === 'all' && (
                          <td className="px-5 py-3 text-center">
                            <span className="tag">{s.byBranch.filter((b) => b.remaining > 0).length}</span>
                          </td>
                        )}
                      </tr>
                      {/* Expanded per-branch breakdown */}
                      {isExpanded && selectedBranch === 'all' && (
                        <tr key={`${s.product.id}-detail`} className="bg-gray-50/50">
                          <td colSpan={8} className="px-5 py-3">
                            <div className="ml-6 space-y-1.5">
                              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                                Per-branch breakdown
                              </p>
                              {s.byBranch.filter((b) => b.allocated > 0 || b.remaining > 0).map((bs) => (
                                <div key={bs.branch.id} className="flex items-center justify-between text-xs py-1">
                                  <span className="text-gray-600">{bs.branch.name}</span>
                                  <div className="flex items-center gap-4">
                                    <span className="text-gray-500">
                                      {bs.allocated} alloc · {bs.sold} sold
                                    </span>
                                    <span className={`font-medium tabular-nums ${bs.remaining === 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                      {bs.remaining} left
                                    </span>
                                    <span className="tabular-nums text-orange-600 w-24 text-right">
                                      {formatGHS(bs.costValue)}
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedBranch(bs.branch.id);
                                        setExpandedProduct(null);
                                      }}
                                      className="text-gray-400 hover:text-gray-900 underline"
                                    >
                                      View branch
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
              {/* Totals row */}
              <tfoot>
                <tr className="border-t-2 border-gray-900 bg-gray-50">
                  <td className="px-5 py-3 font-bold">Total</td>
                  <td className="px-5 py-3 text-right tabular-nums font-bold">
                    {selectedBranch === 'all'
                      ? filtered.reduce((s, r) => s + r.totalAllocated, 0)
                      : filtered.reduce((s, r) => s + (r.byBranch.find((b) => b.branch.id === selectedBranch)?.allocated ?? 0), 0)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-bold text-gray-500">
                    {selectedBranch === 'all'
                      ? filtered.reduce((s, r) => s + r.totalSold, 0)
                      : filtered.reduce((s, r) => s + (r.byBranch.find((b) => b.branch.id === selectedBranch)?.sold ?? 0), 0)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-bold">
                    {totals.totalUnits.toLocaleString()}
                  </td>
                  <td className="px-5 py-3"></td>
                  <td className="px-5 py-3 text-right tabular-nums font-bold text-orange-700">
                    {formatGHS(totals.totalCost)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-bold text-blue-700">
                    {formatGHS(totals.totalRetail)}
                  </td>
                  {selectedBranch === 'all' && <td className="px-5 py-3"></td>}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
