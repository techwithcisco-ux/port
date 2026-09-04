import { useEffect, useState, type FormEvent } from 'react';
import BackButton from '../../components/BackButton';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Branch, Product, InventoryAllocation } from '@branchport/shared';
import { BarMeter, ColorStatCard } from '../../components/Visuals';
import { formatGHS } from '../../lib/utils';

/**
 * Owner stock allocation — lets the owner allocate stock to themselves
 * (as manager) or to any branch. Full control over inventory distribution
 * with a clean audit trail. Uses selects and steppers to minimize typing.
 */
export default function OwnerStockAllocation() {
  const { profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [recent, setRecent] = useState<InventoryAllocation[]>([]);
  const [productId, setProductId] = useState('');
  const [allocTarget, setAllocTarget] = useState<'self' | 'branch'>('self');
  const [targetBranch, setTargetBranch] = useState('');
  const [quantity, setQuantity] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [distributor, setDistributor] = useState('');
  const [bulkCost, setBulkCost] = useState('');

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
  const parsedQty = Number(quantity || 0);

  // Visual profit breakdown when product + cost entered
  const profitBreakdown = selected && parsedQty > 0 && bulkCost
    ? {
        bulkCost,
        perUnitCost: selected.bulk_cost_price / selected.units_per_bulk,
        targetPerUnit: Number(bulkCost) / selected.units_per_bulk,
        potentialPerUnit: (Number(bulkCost) / selected.units_per_bulk) - (selected.bulk_cost_price / selected.units_per_bulk),
      }
    : null;

  async function handleAllocate(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    setStatus(null);

    if (!selected) return setError('Pick a product first.');
    if (!(parsedQty > 0)) return setError('Quantity must be greater than 0.');

    if (allocTarget === 'self') {
      const selfBranch = branches[0];
      if (!selfBranch) return setError('No branches found. Create a branch first.');

      const rows = [{
        product_id: selected.id,
        branch_id: selfBranch.id,
        bulk_quantity: parsedQty,
        retail_quantity_equivalent: parsedQty * Number(selected.units_per_bulk),
        allocated_by: profile.id,
      }];

      const { error: err } = await supabase.from('inventory_allocations').insert(rows);
      if (err) {
        setError(err.message);
      } else {
        setStatus(`Allocated ${parsedQty} ${selected.bulk_unit_name} to yourself (${selfBranch.name}).`);
        setQuantity('');
        setBulkCost('');
        refreshRecent();
      }
    } else {
      if (!targetBranch) return setError('Select a branch.');
      const rows = [{
        product_id: selected.id,
        branch_id: targetBranch,
        bulk_quantity: parsedQty,
        retail_quantity_equivalent: parsedQty * Number(selected.units_per_bulk),
        allocated_by: profile.id,
      }];

      const { error: err } = await supabase.from('inventory_allocations').insert(rows);
      if (err) {
        setError(err.message);
      } else {
        const brName = branches.find((b) => b.id === targetBranch)?.name ?? 'branch';
        setStatus(`Allocated ${parsedQty} ${selected.bulk_unit_name} to ${brName}.`);
        setQuantity('');
        setBulkCost('');
        refreshRecent();
      }
    }
  }

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '—';
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? '—';

  return (
    <DashboardLayout>
      <BackButton />
      <h1 className="page-title mb-1">Stock allocation</h1>
      <p className="page-sub mb-3">
        Allocate stock to yourself or to branches. As owner you have full control over inventory distribution.
      </p>

      <div className="grid gap-3 lg:grid-cols-2 max-w-5xl">
        <form onSubmit={handleAllocate} className="card p-4 space-y-2 h-fit">
          {/* Product selection */}
          <div>
            <label className="label">Product</label>
            <select
              required value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setQuantity('');
                setTargetBranch('');
              }}
              className="select w-full"
            >
              <option value="" disabled>Select product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {selected && (
            <div className="text-sm text-gray-500">
              {selected.units_per_bulk} {selected.retail_unit_name} per {selected.bulk_unit_name}
            </div>
          )}

          {/* Distributor & cost — stepper based */}
          {selected && (
            <div className="space-y-2">
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

              {/* Bulk purchase price — stepper */}
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
                {profitBreakdown && (
                  <div className="mt-2 p-3 rounded-xl bg-green-50 border border-green-200">
                    <p className="text-xs text-green-600 font-medium">Per-unit cost:</p>
                    <p className="text-lg font-bold text-green-600">{formatGHS(profitBreakdown.perUnitCost)}</p>
                    <p className="text-[10px] text-green-400">vs your cost of {formatGHS(profitBreakdown.targetPerUnit)}</p>
                  </div>
                )}
              </div>

              {/* Quantity */}
              <div>
                <label className="label">
                  Quantity ({selected.bulk_unit_name ?? 'bulk units'})
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQuantity(String(Math.max(0, parsedQty - 1)))}
                    className="h-10 w-12 rounded-xl bg-gray-200 text-gray-600 text-sm font-medium flex items-center justify-center"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="flex-1 text-right text-sm font-semibold border border-gray-200 rounded-xl py-2 bg-white focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                    placeholder="0"
                  />
                  <button
                    onClick={() => setQuantity(String(Number(parsedQty) + 1))}
                    className="h-10 w-12 rounded-xl bg-gray-200 text-gray-600 text-sm font-medium flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  = {parsedQty} {selected.bulk_unit_name ?? 'bulk units'} ·
                  {parsedQty * Number(selected.units_per_bulk)} {selected.retail_unit_name} retail equivalent
                </p>
              </div>
            </div>
          )}

          {/* Allocation target */}
          <div>
            <label className="label">Allocate to</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAllocTarget('self')}
                className={`px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                  allocTarget === 'self'
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                }`}
              >
                🙋 Myself (as manager)
              </button>
              <button
                type="button"
                onClick={() => setAllocTarget('branch')}
                className={`px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                  allocTarget === 'branch'
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                }`}
              >
                🏪 A branch
              </button>
            </div>
          </div>

          {allocTarget === 'branch' && (
            <div>
              <label className="label">Target branch</label>
              <select
                required value={targetBranch}
                onChange={(e) => setTargetBranch(e.target.value)}
                className="select w-full"
              >
                <option value="" disabled>Select branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="text-sm text-red-800">{error}</p>}
          {status && <p className="text-sm text-green-800 bg-green-50 p-3 rounded-lg">{status}</p>}

          <button
            type="submit"
            disabled={!selected || !products.length}
            className="btn btn-primary w-full"
          >
            {allocTarget === 'self' ? 'Allocate to myself' : 'Allocate to branch'}
          </button>
        </form>

        <div className="card overflow-hidden">
          <p className="card-header">Recent allocations</p>
          {recent.length === 0 ? (
            <p className="p-4 text-gray-500 text-sm">Nothing allocated yet.</p>
          ) : (
            <ul className="divide-y">
              {recent.map((r) => (
                <li key={r.id} className="px-4 py-3 text-sm">
                  <p className="font-medium">
                    {productName(r.product_id)} → {branchName(r.branch_id)}
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