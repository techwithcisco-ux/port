import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { createBranch, updateBranch, deleteBranch } from '@branchport/shared';
import type { Branch, InventoryAllocation, Product, Sale } from '@branchport/shared';
import { formatGHS } from '../../lib/utils';

export default function OwnerStores() {
  const { profile } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [allocations, setAllocations] = useState<InventoryAllocation[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

  // Add/Edit state
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadBranches() {
    const result = await supabase.from('branches').select('*');
    if (!result.error) setBranches((result.data as Branch[]) ?? []);
  }

  async function load() {
    const [b, p, a, s] = await Promise.all([
      supabase.from('branches').select('*'),
      supabase.from('products').select('*'),
      supabase.from('inventory_allocations').select('*'),
      supabase.from('sales').select('*'),
    ]);
    if (!b.error) setBranches((b.data as Branch[]) ?? []);
    if (!p.error) setProducts((p.data as Product[]) ?? []);
    if (!a.error) setAllocations((a.data as InventoryAllocation[]) ?? []);
    if (!s.error) setSales((s.data as Sale[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // ── Add branch ──
  async function handleAdd() {
    if (!newName.trim() || !profile?.business_id) return;
    setAddBusy(true);
    setAddError(null);
    const result = createBranch(profile.business_id, newName.trim());
    setAddBusy(false);
    if (result.error) { setAddError(result.error); return; }
    setNewName('');
    setShowAdd(false);
    loadBranches();
  }

  // ── Edit branch ──
  function startEdit(b: Branch) {
    setEditingId(b.id);
    setEditName(b.name);
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return;
    setEditBusy(true);
    updateBranch(editingId, editName.trim());
    setEditBusy(false);
    setEditingId(null);
    loadBranches();
  }

  // ── Delete branch ──
  async function handleDelete() {
    if (!deletingId) return;
    deleteBranch(deletingId);
    setDeletingId(null);
    if (selectedBranch === deletingId) setSelectedBranch(null);
    loadBranches();
  }

  // Branch metrics
  const branchMetrics = useMemo(() => {
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    const monthStr = thisMonth.toISOString();

    return branches.map((b) => {
      const branchSales = sales.filter((s) => s.branch_id === b.id);
      const monthSales = branchSales.filter((s) => s.sold_at >= monthStr);
      const branchAlloc = allocations.filter((a) => a.branch_id === b.id);

      const revenue = branchSales.reduce((s, x) => s + Number(x.total_price), 0);
      const monthRevenue = monthSales.reduce((s, x) => s + Number(x.total_price), 0);
      const transactions = branchSales.length;

      const stockValue = branchAlloc.reduce((total, a) => {
        const product = products.find((p) => p.id === a.product_id);
        if (!product) return total;
        const cost = product.units_per_bulk > 0 ? product.bulk_cost_price / product.units_per_bulk : 0;
        return total + Number(a.retail_quantity_equivalent) * cost;
      }, 0);

      const totalAllocated = branchAlloc.reduce((s, a) => s + Number(a.retail_quantity_equivalent), 0);
      const totalSold = branchSales.reduce((s, x) => s + Number(x.quantity), 0);
      const remaining = Math.max(totalAllocated - totalSold, 0);

      const lowStock = products.filter((p) => {
        const alloc = branchAlloc.filter((a) => a.product_id === p.id).reduce((s, a) => s + Number(a.retail_quantity_equivalent), 0);
        const sold = branchSales.filter((s) => s.product_id === p.id).reduce((s, x) => s + Number(x.quantity), 0);
        const rem = Math.max(alloc - sold, 0);
        return rem <= alloc * 0.2;
      }).length;

      return {
        branch: b,
        revenue, monthRevenue, transactions, stockValue,
        totalAllocated, totalSold, remaining, lowStock,
        productCount: new Set(branchAlloc.map((a) => a.product_id)).size,
      };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [branches, sales, allocations, products]);

  const selectedMetrics = selectedBranch ? branchMetrics.find((b) => b.branch.id === selectedBranch) : null;
  const selectedAllocations = selectedBranch
    ? allocations.filter((a) => a.branch_id === selectedBranch)
    : [];

  if (loading) {
    return (
      <DashboardLayout>
        <p className="text-gray-500 py-8">Loading stores…</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mb-3">
        <h1 className="page-title">Stores</h1>
        <p className="page-sub mt-1">All your branches — tap to view, edit, or add a new one.</p>
      </div>



      {/* ── Branch cards + Add Store card ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        {branchMetrics.map((bm, i) => {
          const isEditing = editingId === bm.branch.id;
          const isDeleting = deletingId === bm.branch.id;

          return (
            <div
              key={bm.branch.id}
              className={`rounded-2xl border-2 p-4 transition-all ${
                selectedBranch === bm.branch.id
                  ? 'border-gray-900 bg-gray-50 shadow-sm'
                  : 'border-gray-200 bg-white'
              }`}
            >
              {isEditing ? (
                /* ── Edit mode ── */
                <div className="space-y-2">
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="input w-full"
                    onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                  />
                  <div className="flex gap-2">
                    <button onClick={saveEdit} disabled={editBusy} className="btn btn-primary btn-sm flex-1">
                      {editBusy ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => setEditingId(null)} className="btn btn-outline btn-sm">Cancel</button>
                  </div>
                </div>
              ) : isDeleting ? (
                /* ── Delete confirmation ── */
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-sm font-medium text-red-800 mb-1">Delete "{bm.branch.name}"?</p>
                  <p className="text-xs text-red-600 mb-3">This cannot be undone.</p>
                  <div className="flex gap-2">
                    <button onClick={handleDelete} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-xs font-medium">
                      Yes, delete
                    </button>
                    <button onClick={() => setDeletingId(null)} className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Normal card ── */
                <>
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={() => setSelectedBranch(selectedBranch === bm.branch.id ? null : bm.branch.id)}
                      className="flex items-center gap-3 text-left"
                    >
                      <span className="text-2xl">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏪'}
                      </span>
                      <div>
                        <p className="font-semibold text-gray-900">{bm.branch.name}</p>
                        <p className="text-xs text-gray-500">{bm.transactions} sales</p>
                      </div>
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEdit(bm.branch)}
                        className="text-[11px] px-2 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => setDeletingId(bm.branch.id)}
                        className="text-[11px] px-2 py-1 rounded-md bg-red-50 text-red-600 hover:bg-red-100 font-medium"
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-gray-500">Revenue</p>
                      <p className="text-lg font-bold tabular-nums text-gray-900">{formatGHS(bm.revenue)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">This Month</p>
                      <p className="text-lg font-bold tabular-nums text-blue-700">{formatGHS(bm.monthRevenue)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Stock Value</p>
                      <p className="text-lg font-bold tabular-nums text-gray-900">{formatGHS(bm.stockValue)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Stock Left</p>
                      <p className="text-lg font-bold tabular-nums text-gray-900">{bm.remaining}</p>
                      {bm.lowStock > 0 && (
                        <p className="text-xs text-amber-600 font-medium">⚠ {bm.lowStock} low</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}

        {/* ── Add Store card ── */}
        {showAdd ? (
          <div className="rounded-2xl border-2 border-dashed border-gray-900 bg-gray-50 p-5">
            <p className="text-sm font-medium text-gray-700 mb-3">New store</p>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Store name, e.g. Tema Branch"
              className="input w-full mb-3"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            {addError && <p className="text-xs text-red-600 mb-2">{addError}</p>}
            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={addBusy || !newName.trim()} className="btn btn-primary btn-sm flex-1">
                {addBusy ? 'Adding…' : 'Add Store'}
              </button>
              <button onClick={() => { setShowAdd(false); setNewName(''); setAddError(null); }} className="btn btn-outline btn-sm">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-2xl border-2 border-dashed border-gray-300 bg-white p-4 flex flex-col items-center justify-center text-gray-400 hover:border-gray-900 hover:text-gray-700 transition-all min-h-[160px]"
          >
            <span className="text-3xl mb-2">+</span>
            <span className="text-sm font-medium">Add Store</span>
          </button>
        )}
      </div>

      {/* ── Selected branch detail ── */}
      {selectedMetrics && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{selectedMetrics.branch.name} — Details</h2>
            <button onClick={() => setSelectedBranch(null)} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-500">Total Revenue</p>
              <p className="text-xl font-bold tabular-nums text-gray-900">{formatGHS(selectedMetrics.revenue)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-500">Products</p>
              <p className="text-xl font-bold text-gray-900">{selectedMetrics.productCount}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-500">Allocated</p>
              <p className="text-xl font-bold text-gray-900">{selectedMetrics.totalAllocated}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-500">Sold</p>
              <p className="text-xl font-bold text-gray-900">{selectedMetrics.totalSold}</p>
            </div>
          </div>

          <h3 className="text-sm font-semibold text-gray-700 mb-3">Stock by Product</h3>
          {selectedAllocations.length === 0 ? (
            <p className="text-sm text-gray-400">No stock allocated to this store yet.</p>
          ) : (
            <div className="space-y-2">
              {products
                .filter((p) => selectedAllocations.some((a) => a.product_id === p.id))
                .map((p) => {
                  const alloc = selectedAllocations
                    .filter((a) => a.product_id === p.id)
                    .reduce((s, a) => s + Number(a.retail_quantity_equivalent), 0);
                  const sold = sales
                    .filter((s) => s.branch_id === selectedBranch && s.product_id === p.id)
                    .reduce((s, x) => s + Number(x.quantity), 0);
                  const remaining = Math.max(alloc - sold, 0);
                  const pct = alloc > 0 ? (remaining / alloc) * 100 : 0;
                  return (
                    <div key={p.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{p.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${pct === 0 ? 'bg-red-500' : pct <= 20 ? 'bg-amber-500' : 'bg-green-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 tabular-nums w-16 text-right">
                            {remaining}/{alloc}
                          </span>
                        </div>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        pct === 0 ? 'bg-red-50 text-red-700' : pct <= 20 ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
                      }`}>
                        {pct === 0 ? 'Out' : pct <= 20 ? 'Low' : 'OK'}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <Link to="/owner/stock-allocation" className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium">
              Allocate Stock →
            </Link>
            <Link to="/manager/stock-balance" className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200">
              Full Stock Balance →
            </Link>
          </div>
        </div>
      )}

      {/* ── Quick actions ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link to="/manager/products" className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all">
          <span className="text-2xl block mb-2">🏷️</span>
          <span className="text-sm font-medium text-gray-900">Product Setup</span>
        </Link>
        <Link to="/owner/stock-allocation" className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all">
          <span className="text-2xl block mb-2">📦</span>
          <span className="text-sm font-medium text-gray-900">Allocate Stock</span>
        </Link>
        <Link to="/manager/stock-balance" className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all">
          <span className="text-2xl block mb-2">📋</span>
          <span className="text-sm font-medium text-gray-900">Stock Balance</span>
        </Link>
        <Link to="/manager/inventory" className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all">
          <span className="text-2xl block mb-2">📥</span>
          <span className="text-sm font-medium text-gray-900">Add Stock</span>
        </Link>
      </div>
    </DashboardLayout>
  );
}
