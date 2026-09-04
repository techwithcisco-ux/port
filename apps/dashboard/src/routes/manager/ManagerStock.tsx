import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import type { Product, InventoryAllocation, Branch } from '@branchport/shared';
import { formatGHS } from '../../lib/utils';

type StockTab = 'overview' | 'allocation' | 'balance';

export default function ManagerStock() {
  const [tab, setTab] = useState<StockTab>('overview');
  const [products, setProducts] = useState<Product[]>([]);
  const [allocations, setAllocations] = useState<InventoryAllocation[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [p, a, b] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('inventory_allocations').select('*'),
        supabase.from('branches').select('*'),
      ]);
      if (!p.error) setProducts((p.data as Product[]) ?? []);
      if (!a.error) setAllocations((a.data as InventoryAllocation[]) ?? []);
      if (!b.error) setBranches((b.data as Branch[]) ?? []);
      setLoading(false);
    }
    void load();
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
        <p className="text-gray-500 py-8">Loading stock…</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Stock</h1>
        <p className="text-sm text-gray-500 mt-1">Manage inventory, allocations, and stock levels.</p>
      </div>

      {/* Tab selector */}
      <div className="flex gap-2 mb-6">
        {([
          { key: 'overview', label: 'Overview' },
          { key: 'allocation', label: 'Allocate' },
          { key: 'balance', label: 'Balance' },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-2xl p-5 border border-gray-200">
              <p className="text-xs text-gray-500 uppercase">Products</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{products.length}</p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-200">
              <p className="text-xs text-gray-500 uppercase">Branches</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{branches.length}</p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-200">
              <p className="text-xs text-gray-500 uppercase">Total Allocated</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {allocations.reduce((s, a) => s + Number(a.retail_quantity_equivalent), 0)}
              </p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-200">
              <p className="text-xs text-gray-500 uppercase">Stock Value</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {formatGHS(products.reduce((total, p) => {
                  const alloc = allocations.filter((a) => a.product_id === p.id).reduce((s, a) => s + Number(a.retail_quantity_equivalent), 0);
                  const cost = p.units_per_bulk > 0 ? p.bulk_cost_price / p.units_per_bulk : 0;
                  return total + alloc * cost;
                }, 0))}
              </p>
            </div>
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Link
              to="/manager/inventory"
              className="bg-white border-2 rounded-2xl p-4 text-center transition-all hover:-translate-y-0.5"
              style={{borderColor: 'var(--ghana-gold)', background: 'rgba(252,209,22,0.05)'}}
            >
              <span className="text-2xl block mb-2">🇬🇭</span>
              <span className="text-sm font-bold" style={{color: 'var(--ghana-black)'}}>Buy Stock (Intake)</span>
              <span className="text-[10px] block text-gray-400 mt-0.5">Distributor → Product → Price</span>
            </Link>
            <Link
              to="/manager/allocation"
              className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all"
            >
              <span className="text-2xl block mb-2">📦</span>
              <span className="text-sm font-medium text-gray-900">Allocate Stock</span>
            </Link>
            <Link
              to="/manager/stock-balance"
              className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all"
            >
              <span className="text-2xl block mb-2">📋</span>
              <span className="text-sm font-medium text-gray-900">Stock Balance</span>
            </Link>
          </div>
        </>
      )}

      {tab === 'allocation' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Stock Allocation</h2>
          <p className="text-sm text-gray-500 mb-4">Move stock from your store to branches.</p>
          <Link
            to="/manager/allocation"
            className="inline-block px-6 py-3 rounded-xl bg-gray-900 text-white font-medium"
          >
            Go to Allocation →
          </Link>
        </div>
      )}

      {tab === 'balance' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Stock Balance</h2>
          <p className="text-sm text-gray-500 mb-4">See detailed stock levels per product and branch.</p>
          <Link
            to="/manager/stock-balance"
            className="inline-block px-6 py-3 rounded-xl bg-gray-900 text-white font-medium"
          >
            View Full Balance →
          </Link>
        </div>
      )}
    </DashboardLayout>
  );
}
