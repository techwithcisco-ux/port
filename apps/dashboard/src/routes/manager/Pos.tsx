import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Branch, Product, ProductVariant } from '@branchport/shared';
import {
  getProductVariants,
  variantUnitType,
  saleBaseUnits,
  isSyntheticVariant,
} from '@branchport/shared';
import { formatGHS } from '../../lib/utils';

interface CartLine {
  key: number;
  product: Product;
  variant: ProductVariant;
  qty: number;
}

let nextLineKey = 1;

export default function Pos() {
  const { profile } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [allocations, setAllocations] = useState<Array<{ product_id: string; branch_id: string; retail_quantity_equivalent: number }>>([]);
  const [sales, setSales] = useState<Array<{ product_id: string; variant_id: string | null; unit_type: 'bulk' | 'retail'; quantity: number }>>([]);
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [qty, setQty] = useState('1');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [taxPct, setTaxPct] = useState('0');
  const [saving, setSaving] = useState(false);
  const [allocationProductId, setAllocationProductId] = useState('');
  const [allocationQty, setAllocationQty] = useState('');
  const [allocating, setAllocating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function refreshBranchData(branchId: string) {
    const [{ data: allocs }, { data: salesData }] = await Promise.all([
      supabase.from('inventory_allocations').select('*').eq('branch_id', branchId),
      supabase.from('sales').select('*').eq('branch_id', branchId),
    ]);

    setAllocations((allocs as Array<{ product_id: string; branch_id: string; retail_quantity_equivalent: number }> | null) ?? []);
    setSales((salesData as Array<{ product_id: string; variant_id: string | null; unit_type: 'bulk' | 'retail'; quantity: number }> | null) ?? []);
  }

  useEffect(() => {
    async function loadInitialData() {
      const [{ data: branchRows }, { data: productRows }, { data: variantRows }] = await Promise.all([
        supabase.from('branches').select('*').order('name', { ascending: true }),
        supabase.from('products').select('*').order('created_at', { ascending: true }),
        supabase.from('product_variants').select('*'),
      ]);

      const branchesList = (branchRows as Branch[] | null) ?? [];
      const variantsByProduct = new Map<string, ProductVariant[]>();
      for (const v of (variantRows as ProductVariant[] | null) ?? []) {
        const list = variantsByProduct.get(v.product_id) ?? [];
        list.push(v);
        variantsByProduct.set(v.product_id, list);
      }
      const productList = ((productRows as Product[] | null) ?? []).map((p) => ({
        ...p,
        variants: (variantsByProduct.get(p.id) ?? []).sort((a, b) => a.sort_order - b.sort_order),
      }));

      setBranches(branchesList);
      setProducts(productList);

      const defaultBranch = profile?.branch_id ?? branchesList[0]?.id ?? '';
      setSelectedBranchId(defaultBranch);

      if (defaultBranch) {
        void refreshBranchData(defaultBranch);
      }
    }

    void loadInitialData();
  }, [profile]);

  useEffect(() => {
    if (!selectedBranchId) return;
    void refreshBranchData(selectedBranchId);
  }, [selectedBranchId]);

  function stockFor(product: Product) {
    const allocated = allocations
      .filter((a) => a.product_id === product.id)
      .reduce((sum, a) => sum + Number(a.retail_quantity_equivalent), 0);

    const sold = sales
      .filter((s) => s.product_id === product.id)
      .reduce((sum, s) => sum + Number(s.quantity) * saleBaseUnits(product, s), 0);

    return Math.max(allocated - sold, 0);
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(term) ||
        getProductVariants(product).some((v) => v.name.toLowerCase().includes(term))
    );
  }, [products, search]);

  const subtotal = cart.reduce((sum, line) => sum + line.qty * Number(line.variant.price), 0);
  const taxRate = Math.max(0, Number(taxPct) || 0);
  const taxAmount = (subtotal * taxRate) / 100;
  const grandTotal = subtotal + taxAmount;
  const allocationProduct = products.find((product) => product.id === allocationProductId) ?? null;
  const allocationBulk = Math.max(0, Number(allocationQty) || 0);
  const allocationRetail = allocationProduct ? allocationBulk * Number(allocationProduct.units_per_bulk) : 0;

  function selectProduct(product: Product) {
    setSelectedProduct(product);
    setSelectedVariant(getProductVariants(product)[0] ?? null);
    setQty('1');
  }

  function addSelected() {
    if (!selectedProduct || !selectedVariant) return;
    const quantity = Math.max(1, Math.round(Number(qty) || 1));
    setCart((current) => [
      ...current,
      { key: nextLineKey++, product: selectedProduct, variant: selectedVariant, qty: quantity },
    ]);
    setSelectedProduct(null);
    setSelectedVariant(null);
    setQty('1');
    setStatus('Added to order.');
  }

  function setLineQty(key: number, nextQty: number) {
    setCart((current) =>
      current.map((line) => (line.key === key ? { ...line, qty: Math.max(1, nextQty) } : line))
    );
  }

  function removeLine(key: number) {
    setCart((current) => current.filter((line) => line.key !== key));
  }

  async function completeOrder() {
    if (!profile || !selectedBranchId || cart.length === 0) return;
    setSaving(true);
    setStatus(null);

    const rows = cart.map((line) => ({
      id: crypto.randomUUID(),
      branch_id: selectedBranchId,
      product_id: line.product.id,
      variant_id: isSyntheticVariant(line.variant) ? null : line.variant.id,
      unit_type: variantUnitType(line.product, line.variant),
      quantity: line.qty,
      unit_price: Number(line.variant.price),
      total_price: Math.round(line.qty * Number(line.variant.price) * 100) / 100,
      sold_by: profile.id,
      sold_at: new Date().toISOString(),
      client_reported_at: new Date().toISOString(),
      price_flagged: false,
      customer_name: customerName.trim() || null,
      customer_phone: customerPhone.trim() || null,
    }));

    const { error } = await supabase.from('sales').insert(rows);

    if (error) {
      setStatus(`Error: ${error.message}`);
      setSaving(false);
      return;
    }

    setCart([]);
    setSelectedProduct(null);
    setSelectedVariant(null);
    setCustomerName('');
    setCustomerPhone('');
    setTaxPct('0');
    setStatus('Sale recorded.');
    setSaving(false);
    void refreshBranchData(selectedBranchId);
  }

  async function allocateToShop() {
    if (!profile || !selectedBranchId || !allocationProduct || allocationBulk <= 0 || allocating) return;
    setAllocating(true);
    setStatus(null);

    const { error } = await supabase.from('inventory_allocations').insert([{
      product_id: allocationProduct.id,
      branch_id: selectedBranchId,
      bulk_quantity: allocationBulk,
      retail_quantity_equivalent: allocationRetail,
      allocated_by: profile.id,
    }]);

    if (error) {
      setStatus(`Could not allocate stock: ${error.message}`);
    } else {
      setStatus(`Added ${allocationBulk} ${allocationProduct.bulk_unit_name} to this shop (${allocationRetail} ${allocationProduct.retail_unit_name}).`);
      setAllocationProductId('');
      setAllocationQty('');
      await refreshBranchData(selectedBranchId);
    }
    setAllocating(false);
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-md space-y-2 pb-2">
        <div className="card p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="page-title text-xl">Market POS</h1>
              <p className="page-sub mt-0 text-xs">Informal market sales</p>
            </div>
            <div className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
              {cart.length} item{cart.length === 1 ? '' : 's'}
            </div>
          </div>

          <div className="mt-3">
            <label className="label">My shop / branch</label>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="input w-full"
            >
              <option value="" disabled>Select branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedBranchId ? (
          <>
            <div className="card border-gray-900/10 bg-gray-50 p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Stock for this shop</p>
                  <p className="mt-1 text-xs text-gray-500">Receive stock here, then sell it from this manager till.</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-gray-500">Manager stock</span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_9rem_auto] sm:items-end">
                <div>
                  <label className="label">Product</label>
                  <select
                    value={allocationProductId}
                    onChange={(e) => setAllocationProductId(e.target.value)}
                    className="select w-full bg-white"
                  >
                    <option value="">Select product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>{product.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Bulk quantity</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={allocationQty}
                    onChange={(e) => setAllocationQty(e.target.value)}
                    placeholder="0"
                    className="input w-full bg-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void allocateToShop()}
                  disabled={!allocationProduct || allocationBulk <= 0 || allocating}
                  className="btn btn-primary whitespace-nowrap"
                >
                  {allocating ? 'Adding…' : 'Add to shop'}
                </button>
              </div>
              {allocationProduct && allocationBulk > 0 && (
                <p className="mt-2 text-xs text-gray-500">
                  This adds {allocationRetail} {allocationProduct.retail_unit_name} to {branches.find((branch) => branch.id === selectedBranchId)?.name ?? 'the shop'}.
                </p>
              )}
            </div>

            <div className="card p-3 sm:p-4">
              <label className="label">Search products</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type a product or variant name"
                className="input w-full"
              />
            </div>

            {selectedProduct && (
              <div className="card border-gray-900 p-3 sm:p-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{selectedProduct.name}</p>
                    <p className="mt-0.5 text-xs text-gray-500">Pick a variant to add</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSelectedProduct(null); setSelectedVariant(null); }}
                    className="text-gray-400 hover:text-gray-700"
                    aria-label="Cancel"
                  >
                    ×
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {getProductVariants(selectedProduct).map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVariant(v)}
                      className={`flex-1 min-w-[7rem] rounded-lg px-3 py-2 text-sm font-medium transition ${
                        selectedVariant?.id === v.id
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {v.name} · {formatGHS(Number(v.price))}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQty(String(Math.max(1, (Number(qty) || 1) - 1)))}
                    className="h-10 w-10 rounded-lg bg-gray-100 text-xl text-gray-700"
                    aria-label="Decrease"
                  >
                    −
                  </button>
                  <input
                    type="number" min="1" value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="input flex-1 text-center"
                  />
                  <button
                    type="button"
                    onClick={() => setQty(String((Number(qty) || 1) + 1))}
                    className="h-10 w-10 rounded-lg bg-gray-100 text-xl text-gray-700"
                    aria-label="Increase"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={addSelected}
                  disabled={!selectedVariant}
                  className="btn btn-primary mt-3 w-full"
                >
                  Add to order
                </button>
              </div>
            )}

            <div className="card overflow-hidden">
              <div className="card-header">Products</div>
              <div className="grid max-h-[420px] grid-cols-2 gap-2 overflow-y-auto p-2">
                {filtered.length === 0 ? (
                  <p className="col-span-2 p-4 text-sm text-gray-500">No products match.</p>
                ) : (
                  filtered.map((product) => {
                    const base = getProductVariants(product)[0];
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => selectProduct(product)}
                        className="rounded-2xl border border-gray-200 bg-white p-3 text-left shadow-sm transition active:scale-[0.99] hover:border-gray-300"
                      >
                        <div className="flex h-full flex-col justify-between gap-2">
                          <div>
                            <p className="line-clamp-2 text-sm font-semibold text-gray-900">{product.name}</p>
                            <p className="mt-1 text-[11px] text-gray-500">{stockFor(product)} base left</p>
                          </div>
                          <div>
                            <p className="text-base font-semibold text-gray-900">
                              {formatGHS(Number(base?.price))}
                            </p>
                            <p className="text-[11px] text-gray-500">{base?.name}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="card p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">Market basket</p>
                <span className="text-xs text-gray-500">{cart.length} items</span>
              </div>

              {cart.length === 0 ? (
                <p className="text-sm text-gray-500">No items yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {cart.map((line) => (
                    <div key={line.key} className="rounded-xl border border-gray-200 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">{line.product.name}</p>
                          <p className="text-[11px] text-gray-500">{line.variant.name}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          className="text-[11px] text-gray-500"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setLineQty(line.key, line.qty - 1)}
                            className="h-8 w-8 rounded-md bg-gray-100 text-base text-gray-700"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={line.qty}
                            onChange={(e) => setLineQty(line.key, Number(e.target.value || 1))}
                            className="input h-8 w-16 px-2 py-1 text-center"
                          />
                          <button
                            type="button"
                            onClick={() => setLineQty(line.key, line.qty + 1)}
                            className="h-8 w-8 rounded-md bg-gray-100 text-base text-gray-700"
                          >
                            +
                          </button>
                        </div>
                        <p className="text-sm font-medium text-gray-900">
                          {formatGHS(line.qty * Number(line.variant.price))}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Customer</label>
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Name"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Optional"
                    className="input w-full"
                  />
                </div>
              </div>

              <div className="mt-3">
                <label className="label">Tax %</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={taxPct}
                  onChange={(e) => setTaxPct(e.target.value)}
                  className="input w-full"
                />
              </div>

              <div className="mt-4 space-y-2 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
                <div className="flex justify-between"><span>Subtotal</span><span>{formatGHS(subtotal)}</span></div>
                <div className="flex justify-between"><span>Tax</span><span>{formatGHS(taxAmount)}</span></div>
                <div className="flex justify-between text-base font-semibold text-gray-900"><span>Total</span><span>{formatGHS(grandTotal)}</span></div>
              </div>

              {status && <p className="mt-3 text-xs text-gray-600">{status}</p>}

              <button
                type="button"
                onClick={() => void completeOrder()}
                disabled={cart.length === 0 || saving}
                className="btn btn-primary mt-4 w-full"
              >
                {saving ? 'Recording…' : 'Complete sale'}
              </button>
            </div>
          </>
        ) : (
          <div className="card p-4 text-sm text-gray-500">Add a branch before opening the POS.</div>
        )}
      </div>
    </DashboardLayout>
  );
}