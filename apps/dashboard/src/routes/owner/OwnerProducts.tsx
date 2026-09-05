import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import type { Product, InventoryIntake, Supplier } from '@branchport/shared';
import { formatGHS } from '../../lib/utils';

export default function OwnerProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [intakes, setIntakes] = useState<InventoryIntake[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [p, i, s] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('inventory_intake').select('*').order('created_at', { ascending: false }).limit(10),
        supabase.from('suppliers').select('*'),
      ]);
      if (!p.error) setProducts((p.data as Product[]) ?? []);
      if (!i.error) setIntakes((i.data as InventoryIntake[]) ?? []);
      if (!s.error) setSuppliers((s.data as Supplier[]) ?? []);
      setLoading(false);
    }
    void load();
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
        <p className="text-gray-500 py-8">Loading products…</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-gray-900">Products</h1>
        <p className="text-sm text-gray-500 mt-1">All products, recent stock intake, and suppliers.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded-2xl p-4 border border-gray-200">
          <p className="text-xs text-gray-500 uppercase">Products</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{products.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-200">
          <p className="text-xs text-gray-500 uppercase">Suppliers</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{suppliers.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-200">
          <p className="text-xs text-gray-500 uppercase">Recent Intakes</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{intakes.length}</p>
        </div>
      </div>

      {/* Product list */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-4">
        <div className="px-6 py-2 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">All Products</h2>
            <p className="text-xs text-gray-400 mt-1">{products.length} products in your catalog</p>
          </div>
          <Link
            to="/manager/products"
            className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium"
          >
            + Add Product
          </Link>
        </div>
        <div className="divide-y">
          {products.map((p) => (
            <div key={p.id} className="px-6 py-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {p.image ? (
                  <img src={`data:image/jpeg;base64,${p.image}`} alt="" className="w-12 h-12 rounded-xl object-cover border border-gray-200 flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-xl text-gray-400 flex-shrink-0">📦</div>
                )}
                <div>
                <p className="font-semibold text-gray-900">{p.name}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {p.retail_unit_name} · {formatGHS(p.retail_sell_price)}/{p.retail_unit_name}
                </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium tabular-nums text-gray-900">
                  Cost: {formatGHS(p.bulk_cost_price)}/{p.bulk_unit_name}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {p.units_per_bulk} {p.retail_unit_name} per {p.bulk_unit_name}
                </p>
              </div>
            </div>
          ))}
          {products.length === 0 && (
            <div className="px-6 py-8 text-center text-gray-400">
              <p>No products yet.</p>
              <Link to="/manager/products" className="text-sm text-gray-900 font-medium mt-2 inline-block">
                Add your first product →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Recent intake */}
      {intakes.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-4">
          <div className="px-6 py-2 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-900">Recent Stock Intake</h2>
            <p className="text-xs text-gray-400 mt-1">Last 10 stock purchases</p>
          </div>
          <div className="divide-y">
            {intakes.map((i) => {
              const product = products.find((p) => p.id === i.product_id);
              const supplier = suppliers.find((s) => s.id === i.supplier_id);
              return (
                <div key={i.id} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{product?.name ?? 'Unknown'}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {i.bulk_quantity} {product?.bulk_unit_name ?? 'units'} from {supplier?.name ?? 'Unknown'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium tabular-nums text-gray-900">{formatGHS(i.cost_price_total)}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(i.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Link
          to="/manager/products"
          className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all"
        >
          <span className="text-2xl block mb-2">➕</span>
          <span className="text-sm font-medium text-gray-900">Add Product</span>
        </Link>
        <Link
          to="/manager/inventory"
          className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all"
        >
          <span className="text-2xl block mb-2">📥</span>
          <span className="text-sm font-medium text-gray-900">Add Stock</span>
        </Link>
        <Link
          to="/manager/suppliers"
          className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all"
        >
          <span className="text-2xl block mb-2">🚚</span>
          <span className="text-sm font-medium text-gray-900">Suppliers</span>
        </Link>
      </div>
    </DashboardLayout>
  );
}
