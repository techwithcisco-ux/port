import { useEffect, useState, FormEvent } from 'react';
import BackButton from '../../components/BackButton';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Product, ProductVariant } from '@branchport/shared';
import { formatGHS } from '../../lib/utils';
import { AdinkraStock, IconBox } from '../../components/Icons';

// Product setup with variants. Informal-market stock isn't "bulk vs retail"
// — sugar is sold as cups, bags, sachets. Each product is entered as a list
// of named variants, each with its own price. The first variant is the base
// (stock-counting) unit; every other variant carries `base_units` = how many
// base units one of it equals, so remaining stock stays one consistent number
// no matter which variant sold. The legacy bulk/retail columns are derived
// from the variant list at save time (they feed intake, allocation and the
// pricing trigger), and every variant gets a row in product_variants (0011).

interface VariantDraft {
  key: number;
  name: string;
  price: string;
  baseUnits: string;
}

let nextVariantKey = 1;

export default function ProductSetup() {
  const { profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [variants, setVariants] = useState<VariantDraft[]>([
    { key: nextVariantKey++, name: 'cup', price: '', baseUnits: '1' },
  ]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [{ data: prodRows }, { data: variantRows }] = await Promise.all([
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      supabase.from('product_variants').select('*'),
    ]);
    const variantsByProduct = new Map<string, ProductVariant[]>();
    for (const v of (variantRows as ProductVariant[] | null) ?? []) {
      const list = variantsByProduct.get(v.product_id) ?? [];
      list.push(v);
      variantsByProduct.set(v.product_id, list);
    }
    const joined = ((prodRows as Product[] | null) ?? []).map((p) => ({
      ...p,
      variants: (variantsByProduct.get(p.id) ?? []).sort((a, b) => a.sort_order - b.sort_order),
    }));
    setProducts(joined);
  }

  useEffect(() => {
    refresh();
  }, []);

  function updateVariant(key: number, patch: Partial<VariantDraft>) {
    setVariants((vs) => vs.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  }

  function addVariant() {
    setVariants((vs) => [...vs, { key: nextVariantKey++, name: '', price: '', baseUnits: '1' }]);
  }

  function removeVariant(key: number) {
    setVariants((vs) => (vs.length > 1 ? vs.filter((v) => v.key !== key) : vs));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    setStatus(null);

    const cleanName = name.trim();
    if (!cleanName) return setError('Product name is required.');
    const bulkCost = Number(cost);
    if (!(bulkCost >= 0)) return setError('Bulk cost must be 0 or more.');

    const cleanVariants: Array<{ name: string; price: number; baseUnits: number }> = [];
    for (const v of variants) {
      const vName = v.name.trim();
      const price = Number(v.price);
      if (!vName) return setError('Every variant needs a name.');
      if (!(price >= 0)) return setError(`Variant "${vName}" needs a valid price.`);
      const baseUnits = Number(v.baseUnits) || 1;
      if (!(baseUnits > 0)) return setError(`Variant "${vName}" needs units per base greater than 0.`);
      cleanVariants.push({ name: vName, price, baseUnits });
    }

    // First variant is the base unit; the variant with the most base units
    // seeds the bulk columns the rest of the engine relies on.
    const base = cleanVariants[0];
    const bulk = cleanVariants.reduce((a, b) => (b.baseUnits > a.baseUnits ? b : a));

    const { data: inserted, error: insertErr } = await supabase.from('products').insert({
      business_id: profile.business_id,
      name: cleanName,
      bulk_unit_name: bulk.name,
      retail_unit_name: base.name,
      units_per_bulk: bulk.baseUnits,
      bulk_cost_price: bulkCost,
      bulk_sell_price: bulk.price,
      retail_sell_price: base.price,
    });

    if (insertErr) {
      setError(`Error: ${insertErr.message}`);
      return;
    }

    const firstRow = Array.isArray(inserted) ? (inserted[0] as { id: string } | undefined) : undefined;
    const productId = firstRow?.id;
    if (!productId) {
      setError('Could not read back the new product id.');
      return;
    }

    const variantRows = cleanVariants.map((v, i) => ({
      product_id: productId,
      name: v.name,
      price: v.price,
      base_units: v.baseUnits,
      sort_order: i,
    }));
    const { error: variantErr } = await supabase.from('product_variants').insert(variantRows);
    if (variantErr) {
      setError(`Product saved but variants failed: ${variantErr.message}`);
      return;
    }

    setStatus(`"${cleanName}" added with ${cleanVariants.length} variant${cleanVariants.length === 1 ? '' : 's'}.`);
    setName('');
    setCost('');
    setVariants([{ key: nextVariantKey++, name: 'cup', price: '', baseUnits: '1' }]);
    refresh();
  }

  return (
    <DashboardLayout>
      <BackButton />
      <div className="flex items-center gap-2 mb-1">
        <AdinkraStock size={22} className="text-emerald-600" />
        <h1 className="page-title mb-0">Product setup</h1>
      </div>
      <p className="page-sub mb-3">
        Add a product with its variants — e.g. Sugar sold as a cup, a bag, or a sachet. The first variant is the
        base unit stock is counted in.
      </p>

      <div className="grid gap-3 lg:grid-cols-2 max-w-5xl">
        <form onSubmit={handleSubmit} className="card p-4 space-y-2 h-fit">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Product name</label>
              <input
                required value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sugar"
                className="input w-full"
              />
            </div>
            <div>
              <label className="label">Bulk cost (GHS)</label>
              <input
                type="number" min="0" step="any" required value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="e.g. 30"
                className="input w-full"
              />
              <p className="text-[11px] text-gray-400 mt-1">What one bulk unit costs you to buy.</p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">Variants</label>
              <button
                type="button"
                onClick={addVariant}
                className="text-xs font-medium text-gray-500 hover:text-gray-900"
              >
                + Add variant
              </button>
            </div>

            <div className="space-y-2">
              {variants.map((v, i) => (
                <div key={v.key} className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                      {i === 0 ? 'Base variant (stock unit)' : `Variant ${i + 1}`}
                    </p>
                    {variants.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeVariant(v.key)}
                        className="text-xs text-gray-400 hover:text-red-700"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">Name</label>
                      <input
                        required value={v.name}
                        onChange={(e) => updateVariant(v.key, { name: e.target.value })}
                        placeholder="cup, bag, sachet…"
                        className="input w-full"
                      />
                    </div>
                    <div>
                      <label className="label">Price (GHS)</label>
                      <input
                        type="number" min="0" step="any" required value={v.price}
                        onChange={(e) => updateVariant(v.key, { price: e.target.value })}
                        placeholder="0.00"
                        className="input w-full"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="label">Units per base</label>
                      <input
                        type="number" min="0" step="any" value={v.baseUnits}
                        disabled={i === 0}
                        onChange={(e) => updateVariant(v.key, { baseUnits: e.target.value })}
                        placeholder="1"
                        className="input w-full disabled:bg-gray-100"
                      />
                      <p className="text-[11px] text-gray-400 mt-1">
                        {i === 0
                          ? 'The base is 1 of itself — stock is counted in these units.'
                          : 'How many base units one of these equals (e.g. a bag holding 24 cups = 24).'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-800">{error}</p>}
          {status && <p className="text-sm text-gray-600">{status}</p>}

          <button type="submit" className="btn btn-primary w-full">
            Add product
          </button>
        </form>

        <div className="card overflow-hidden">
          <p className="card-header">Products ({products.length})</p>
          {products.length === 0 ? (
            <p className="p-4 text-gray-500 text-sm">
              No products yet. Add your first one here so intake, allocation and the staff POS
              have something to work from.
            </p>
          ) : (
            <ul className="divide-y">
              {products.map((p) => (
                <li key={p.id} className="px-4 py-3 text-sm">
                  <p className="font-medium">{p.name}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(p.variants && p.variants.length > 0 ? p.variants : []).map((v) => (
                      <span key={v.id} className="tag">
                        {v.name} · {formatGHS(v.price)}
                        {Number(v.base_units) > 1 ? ` ×${v.base_units}` : ''}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    {Number(p.units_per_bulk)} per bulk · cost {formatGHS(p.bulk_cost_price)}/bulk
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