import { useEffect, useMemo, useState, type FormEvent } from 'react';
import BackButton from '../../components/BackButton';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Branch, Product, InventoryAllocation } from '@branchport/shared';
import { BarMeter, ColorStatCard, ProfitBreakdown } from '../../components/Visuals';
import { formatGHS } from '../../lib/utils';
import { AdinkraAllocate, IconBox } from '../../components/Icons';

interface ProfitBreakdown {
  bulkCostPrice: number;
  unitsPerBulk: number;
  perUnitCost: number;
  targetSellPrice: number;
  perUnitProfit: number;
  totalPotentialProfit: number;
}

export default function Allocation() {
  const { profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [recent, setRecent] = useState<InventoryAllocation[]>([]);
  const [productId, setProductId] = useState('');
  const [totalBulk, setTotalBulk] = useState('');
  const [perBranch, setPerBranch] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [distributor, setDistributor] = useState('');
  const [bulkCost, setBulkCost] = useState('');
  const [targetSell, setTargetSell] = useState('');

  async function refreshRecent() {
    const { data } = await supabase
      .from('inventory_allocations')
      .select('*')
      .order('allocated_at', { ascending: false })
      .limit(20);
    setRecent((data as InventoryAllocation[]) ?? []);
  }

  useEffect(() => {
    (async () => {
      const [p, b] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('branches').select('*'),
      ]);
      setProducts((p.data as Product[]) ?? []);
      setBranches((b.data as Branch[]) ?? []);
    })();
    refreshRecent();
  }, []);

  const selected = products.find((p) => p.id === productId) ?? null;

  // Calculated values shown visually
  const perBranchValues = useMemo(() => {
    const acc: Record<string, number> = {};
    branches.forEach((br) => {
      acc[br.id] = Number(perBranch[br.id] ?? 0);
    });
    return acc;
  }, [perBranch, branches]);

  const sumAllocated = useMemo(() => {
    let sum = 0;
    branches.forEach((br) => { sum += perBranchValues[br.id] || 0; });
    return sum;
  }, [perBranchValues, branches]);

  const total = Number(totalBulk || 0);
  const remaining = Math.max(total - sumAllocated, 0);
  const remainingText = remaining > 0 ? `${remaining} ${selected?.bulk_unit_name ?? 'bulk'} kept at store` : 'fully allocated';

  // Visual profit breakdown when product is selected
  const profitBreakdown: ProfitBreakdown | null = selected && total > 0 ? {
    bulkCostPrice: selected.bulk_cost_price,
    unitsPerBulk: selected.units_per_bulk,
    perUnitCost: selected.bulk_cost_price / selected.units_per_bulk,
    targetSellPrice: Number(targetSell || 0),
    perUnitProfit: (Number(targetSell || 0) || 0) - (selected.bulk_cost_price / selected.units_per_bulk),
    totalPotentialProfit: 0, // will compute below
  } : null;

  if (selected && total > 0 && profitBreakdown) {
    const totalPotential = Math.max(0, (Number(targetSell || 0) || 0) * Number(total) - selected.bulk_cost_price * Math.ceil(Number(total) / selected.units_per_bulk));
    profitBreakdown.totalPotentialProfit = totalPotential;
  }

  async function handleDistribute(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    setStatus(null);

    if (!selected) return setError('Pick a product first.');
    if (!(total > 0)) return setError('Total stock must be greater than 0.');
    if (sumAllocated <= 0) return setError('Allocate at least some stock to a branch.');

    const rows = branches
      .filter((br) => perBranchValues[br.id] > 0)
      .map((br) => ({
        product_id: selected.id,
        branch_id: br.id,
        bulk_quantity: perBranchValues[br.id],
        retail_quantity_equivalent: perBranchValues[br.id] * Number(selected.units_per_bulk),
        allocated_by: profile.id,
      }));

    const { error: err } = await supabase.from('inventory_allocations').insert(rows);
    if (err) {
      setError(err.message);
    } else {
      const profitInfo: Partial<ProfitBreakdown> = profitBreakdown ?? {};
      setStatus(
        rows.length === 1
          ? `Allocated ${rows[0].bulk_quantity} ${selected.bulk_unit_name}${
              sumAllocated < total ? ' — remaining kept at store' : ''
            }. Cost per unit: ${formatGHS(profitInfo.perUnitCost)} | Potential profit per unit: ${formatGHS(profitInfo.perUnitProfit)}`
          : `Allocated across ${rows.length} branches${
              sumAllocated < total ? ' — remaining kept at store' : ''
            }.`
      );
      setTotalBulk('');
      setPerBranch({});
      refreshRecent();
    }
  }

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '—';

  return (
    <DashboardLayout>
      <BackButton />
      <div className="flex items-center gap-2 mb-6">
        <AdinkraAllocate size={22} className="text-gray-600" />
        <h1 className="page-title mb-0">Stock allocation</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 max-w-5xl">
        <form onSubmit={handleDistribute} className="card p-6 space-y-4 h-fit">
          {/* Product selection */}
          <div>
            <label className="label">Product</label>
            <select
              required value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setTotalBulk('');
                setPerBranch({});
                setDistributor('');
                setBulkCost('');
                setTargetSell('');
              }}
              className="select w-full"
            >
              <option value="" disabled>Select product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Distributor & purchase price — visual stepper flow */}
          {selected && (
            <div className="space-y-4">
              {/* Distributor */}
              <div>
                <label className="label">Distributor</label>
                <select
                  className="select w-full"
                  value={distributor}
                  onChange={(e) => setDistributor(e.target.value)}
                >
                  <option value="">Select distributor</option>
                  <option value="kosher">Cosho Mills Ltd</option>
                  <option value="golden">Golden Exporters</option>
                  <option value="akro">Akro Trading</option>
                  <option value="other">Other...</option>
                </select>
              </div>

              {/* Bulk purchase price — stepper + visual calculation */}
              <div>
                <label className="label">Bulk purchase price</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setBulkCost(String(Math.max(0, Number(bulkCost) - 50)))}
                    className="h-10 w-12 rounded-xl bg-gray-200 text-gray-600 text-xl font-medium flex items-center justify-center"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={bulkCost}
                    onChange={(e) => setBulkCost(e.target.value)}
                    className="flex-1 text-right text-base font-semibold border border-gray-200 rounded-xl py-2 bg-white focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                    placeholder="GHS"
                  />
                  <button
                    onClick={() => setBulkCost(String(Number(bulkCost) + 50))}
                    className="h-10 w-12 rounded-xl bg-gray-200 text-gray-600 text-xl font-medium flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  GHS {Number(bulkCost || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>

              {/* Bulk size (items per box) */}
              <div>
                <label className="label">Bulk size</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setTotalBulk(String(Math.max(0, Number(totalBulk) - 1)))}
                    className="h-10 w-12 rounded-xl bg-gray-200 text-gray-600 text-xl font-medium flex items-center justify-center"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={totalBulk}
                    onChange={(e) => setTotalBulk(e.target.value)}
                    className="flex-1 text-right text-base font-semibold border border-gray-200 rounded-xl py-2 bg-white focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                    placeholder="Items per box"
                  />
                  <button
                    onClick={() => setTotalBulk(String(Number(totalBulk) + 1))}
                    className="h-10 w-12 rounded-xl bg-gray-200 text-gray-600 text-xl font-medium flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {totalBulk} {selected.bulk_unit_name}
                </p>
              </div>

              {/* Target selling price — stepper */}
              <div>
                <label className="label">Target selling price (per bulk)</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setTargetSell(String(Math.max(0, Number(targetSell) - 50)))}
                    className="h-10 w-12 rounded-xl bg-gray-200 text-gray-600 text-xl font-medium flex items-center justify-center"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={targetSell}
                    onChange={(e) => setTargetSell(e.target.value)}
                    className="flex-1 text-right text-base font-semibold border border-gray-200 rounded-xl py-2 bg-white focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                    placeholder="GHS"
                  />
                  <button
                    onClick={() => setTargetSell(String(Number(targetSell) + 50))}
                    className="h-10 w-12 rounded-xl bg-gray-200 text-gray-600 text-xl font-medium flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  GHS {Number(targetSell || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>

              {/* Visual profit breakdown */}
              {profitBreakdown && (
                <ProfitBreakdown
                  bulkCost={Number(bulkCost) || 0}
                  unitsPerBulk={selected.units_per_bulk}
                  perUnitCost={selected.bulk_cost_price / selected.units_per_bulk || 0}
                  targetSellPrice={Number(targetSell) || 0}
                  perUnitProfit={profitBreakdown.perUnitProfit || 0}
                  totalPotentialProfit={profitBreakdown.totalPotentialProfit || 0}
                />
              )}
            </div>
          )}

          {/* Per-branch allocation steppers */}
          {selected && branches.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="label">Per branch</legend>
              {branches.map((br) => {
                const q = perBranchValues[br.id] || 0;
                return (
                  <div key={br.id} className="flex items-center gap-3">
                    <span className="text-sm flex-1">{br.name}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPerBranch({ ...perBranch, [br.id]: Math.max(0, q - 1) })}
                        className="h-9 w-9 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium flex items-center justify-center"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-sm font-medium tabular-nums">{q}</span>
                      <button
                        onClick={() => setPerBranch({ ...perBranch, [br.id]: q + 1 })}
                        className="h-9 w-9 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </fieldset>
          )}

          <div className="text-sm flex justify-between border-t pt-3">
            <span>Allocated: {sumAllocated} {selected?.bulk_unit_name ?? ''}</span>
            <span>{total > 0 ? `Remaining: ${remainingText}` : ''}</span>
          </div>

          {error && <p className="text-sm text-red-800">{error}</p>}
          {status && <p className="text-sm text-gray-600">{status}</p>}

          <button
            type="submit"
            disabled={!selected || !products.length || !branches.length}
            className="btn btn-primary w-full"
          >
            Confirm allocation
          </button>
        </form>

        <div className="card overflow-hidden">
          <p className="card-header">Recent allocations</p>
          {recent.length === 0 ? (
            <p className="p-6 text-gray-500 text-sm">Nothing allocated yet.</p>
          ) : (
            <ul className="divide-y">
              {recent.map((r) => (
                <li key={r.id} className="px-4 py-3 text-sm">
                  <p className="font-medium">
                    {r.product_id} → {branchName(r.branch_id)}
                  </p>
                  <p className="text-gray-500">
                    {r.bulk_quantity} bulk · {r.retail_quantity_equivalent} retail units ·{' '}
                    {new Date(r.allocated_at).toLocaleDateString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}