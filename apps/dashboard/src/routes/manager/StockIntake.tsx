import { useEffect, useState, FormEvent, useMemo } from 'react';
import BackButton from '../../components/BackButton';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Product, Supplier, ProductVariant, InventoryIntake } from '@branchport/shared';
import { formatGHS } from '../../lib/utils';
import { AdinkraStock, IconBox } from '../../components/Icons';
import { GyeNyame, Nsoromma, GhanaFlagStripe } from '../../components/AdinkraSymbols';

// ═══════════════════════════════════════════════════════════════════════
// UNIFIED STOCK INTAKE — Per-Variant Cost & Profit System
//
// Flow: Distributor → Product (with variants) → Auto-cost → Set profit
//
// Each variant has its own quantity and total cost.
// System auto-calculates: unit_cost = total_cost / quantity
// User enters: profit per unit → selling_price = unit_cost + profit
// Everything saves to DB and persists on reload.
// ═══════════════════════════════════════════════════════════════════════

type Step = 'distributor' | 'intake' | 'history';

interface VariantDraft {
  key: number;
  name: string; // The variant name IS the unit (e.g. "16 inch", "cup", "bag")
  quantity: string;
  totalCost: string;
  profitMargin: string;
  // Auto-calculated (read-only)
  unitCost: number;
  sellPrice: number;
}

interface IntakeDraft {
  key: number;
  productName: string;
  hasVariants: boolean; // false = "no variant" single unit
  variants: VariantDraft[];
  paidOnCredit: boolean;
  amountPaid: string;
}

let nextItemKey = 1;
let nextVariantKey = 1;

function calcUnitCost(totalCost: number, quantity: number): number {
  if (quantity <= 0) return 0;
  return totalCost / quantity;
}

function calcSellPrice(unitCost: number, profitMargin: number): number {
  return unitCost + profitMargin;
}

function createEmptyVariant(): VariantDraft {
  return {
    key: nextVariantKey++,
    name: '',
    quantity: '',
    totalCost: '',
    profitMargin: '',
    unitCost: 0,
    sellPrice: 0,
  };
}

function createEmptyIntake(): IntakeDraft {
  return {
    key: nextItemKey++,
    productName: '',
    hasVariants: false,
    variants: [createEmptyVariant()],
    paidOnCredit: false,
    amountPaid: '',
  };
}

function recalcVariant(v: VariantDraft): VariantDraft {
  const totalCost = Number(v.totalCost) || 0;
  const quantity = Number(v.quantity) || 0;
  const profit = Number(v.profitMargin) || 0;
  const unitCost = calcUnitCost(totalCost, quantity);
  const sellPrice = calcSellPrice(unitCost, profit);
  return { ...v, unitCost, sellPrice };
}

export default function StockIntake() {
  const { profile } = useAuth();
  const [step, setStep] = useState<Step>('distributor');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Data
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productVariants, setProductVariants] = useState<ProductVariant[]>([]);
  const [intakes, setIntakes] = useState<InventoryIntake[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<string>('');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [intakeDrafts, setIntakeDrafts] = useState<IntakeDraft[]>([createEmptyIntake()]);

  // Supplier edit
  const [editingSupplier, setEditingSupplier] = useState<string | null>(null);
  const [editSupplierName, setEditSupplierName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [supplierBusy, setSupplierBusy] = useState(false);

  // History edit
  const [editingIntake, setEditingIntake] = useState<string | null>(null);

  async function refresh() {
    const [s, p, v, i] = await Promise.all([
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      supabase.from('product_variants').select('*'),
      supabase.from('inventory_intake').select('*').order('created_at', { ascending: false }),
    ]);
    setSuppliers((s.data as Supplier[]) ?? []);
    setProducts((p.data as Product[]) ?? []);
    setProductVariants((v.data as ProductVariant[]) ?? []);
    setIntakes((i.data as InventoryIntake[]) ?? []);
  }

  useEffect(() => { refresh(); }, []);

  // ═══════════════════════════════════════════════════════════════════
  // SUPPLIER MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════

  async function handleAddDistributor(e: FormEvent) {
    e.preventDefault();
    setError(null); setStatus(null);
    if (!profile) return setError('You must be logged in.');
    const name = newSupplierName.trim();
    if (!name) return setError('Enter a distributor name.');

    const { error: insertErr } = await supabase
      .from('suppliers').insert({ name, business_id: profile.business_id });
    if (insertErr) return setError(`Error: ${insertErr.message}`);

    await refresh();
    const { data: found } = await supabase
      .from('suppliers').select('id')
      .eq('name', name).eq('business_id', profile.business_id).single();

    if (!found) return setError('Supplier added but could not find it.');
    setSelectedSupplier(found.id);
    setNewSupplierName('');
    setIntakeDrafts([createEmptyIntake()]);
    setStep('intake');
  }

  async function handleUpdateSupplier(id: string) {
    const name = editSupplierName.trim();
    if (!name) return;
    setSupplierBusy(true);
    const { error } = await supabase.from('suppliers').update({ name }).eq('id', id);
    setSupplierBusy(false);
    if (error) setError(`Error: ${error.message}`);
    else { setStatus(`Distributor renamed to "${name}".`); setEditingSupplier(null); await refresh(); }
  }

  async function handleDeleteSupplier(id: string) {
    setSupplierBusy(true);
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    setSupplierBusy(false);
    if (error) setError(`Error: ${error.message}`);
    else {
      setStatus('Distributor deleted.');
      setDeleteConfirm(null);
      if (selectedSupplier === id) { setSelectedSupplier(''); setStep('distributor'); }
      await refresh();
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // INTAKE DRAFT — Per-variant editing
  // ═══════════════════════════════════════════════════════════════════

  function updateVariant(itemKey: number, variantKey: number, patch: Partial<VariantDraft>) {
    setIntakeDrafts((drafts) =>
      drafts.map((d) => {
        if (d.key !== itemKey) return d;
        return {
          ...d,
          variants: d.variants.map((v) => {
            if (v.key !== variantKey) return v;
            return recalcVariant({ ...v, ...patch });
          }),
        };
      })
    );
  }

  function addVariant(itemKey: number) {
    setIntakeDrafts((drafts) =>
      drafts.map((d) => d.key === itemKey ? { ...d, variants: [...d.variants, createEmptyVariant()] } : d)
    );
  }

  function removeVariant(itemKey: number, variantKey: number) {
    setIntakeDrafts((drafts) =>
      drafts.map((d) => {
        if (d.key !== itemKey) return d;
        if (d.variants.length <= 1) return d;
        return { ...d, variants: d.variants.filter((v) => v.key !== variantKey) };
      })
    );
  }

  function updateItem(itemKey: number, patch: Partial<IntakeDraft>) {
    setIntakeDrafts((drafts) => drafts.map((d) => d.key === itemKey ? { ...d, ...patch } : d));
  }

  function addItem() {
    setIntakeDrafts((drafts) => [...drafts, createEmptyIntake()]);
  }

  function removeItem(itemKey: number) {
    setIntakeDrafts((drafts) => drafts.length > 1 ? drafts.filter((d) => d.key !== itemKey) : drafts);
  }

  // ═══════════════════════════════════════════════════════════════════
  // SAVE ALL — Parallel inserts for speed
  // ═══════════════════════════════════════════════════════════════════

  async function handleSaveAll(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setError(null); setStatus(null); setSaving(true);

    for (const draft of intakeDrafts) {
      const productName = draft.productName.trim();
      if (!productName) { setError('Every product needs a name.'); setSaving(false); return; }

      const validVariants = draft.variants.filter((v) => v.name.trim() && Number(v.quantity) > 0);
      if (validVariants.length === 0) {
        setError(`"${productName}" needs a unit name and quantity.`);
        setSaving(false);
        return;
      }

      for (const v of validVariants) {
        const totalCost = Number(v.totalCost) || 0;
        const quantity = Number(v.quantity) || 0;
        if (totalCost < 0) { setError(`"${v.name}" total cost can't be negative.`); setSaving(false); return; }
        if (quantity <= 0) { setError(`"${v.name}" needs a quantity > 0.`); setSaving(false); return; }
      }

      const firstV = validVariants[0];
      const firstUnitCost = calcUnitCost(Number(firstV.totalCost), Number(firstV.quantity));
      const firstSellPrice = calcSellPrice(firstUnitCost, Number(firstV.profitMargin) || 0);
      const unitName = firstV.name.trim() || 'unit';

      // 1. Create product (must await for ID)
      const { data: prod, error: prodErr } = await supabase.from('products').insert({
        business_id: profile.business_id,
        name: productName,
        bulk_unit_name: draft.hasVariants && validVariants.length > 1 ? 'set' : unitName,
        retail_unit_name: unitName,
        units_per_bulk: 1,
        bulk_cost_price: firstUnitCost,
        bulk_sell_price: firstSellPrice,
        retail_sell_price: firstSellPrice,
      }).select('id').single();

      if (prodErr) { setError(`Error creating "${productName}": ${prodErr.message}`); setSaving(false); return; }

      // 2. Insert variants (batch)
      const totalAllCosts = validVariants.reduce((s, x) => s + (Number(x.totalCost) || 0), 0);
      const totalPaid = draft.paidOnCredit ? Number(draft.amountPaid || 0) : totalAllCosts;

      const variantRows = validVariants.map((v, i) => ({
        product_id: prod.id,
        name: v.name.trim(),
        price: calcSellPrice(calcUnitCost(Number(v.totalCost), Number(v.quantity)), Number(v.profitMargin) || 0),
        base_units: 1,
        sort_order: i,
      }));
      const { error: varErr } = await supabase.from('product_variants').insert(variantRows);
      if (varErr) setError(`Variants error: ${varErr.message}`);

      // 3. Insert intake records (one per variant)
      for (const v of validVariants) {
        const totalCost = Number(v.totalCost) || 0;
        const quantity = Number(v.quantity) || 0;
        const proportion = totalAllCosts > 0 ? totalCost / totalAllCosts : 1 / validVariants.length;
        const variantPaid = Math.round(totalPaid * proportion * 100) / 100;

        const { error: intakeErr } = await supabase.from('inventory_intake').insert({
          business_id: profile.business_id,
          supplier_id: selectedSupplier,
          product_id: prod.id,
          bulk_quantity: quantity,
          cost_price_total: totalCost,
          amount_paid: variantPaid,
          created_by: profile.id,
        });
        if (intakeErr) setError(`Intake error: ${intakeErr.message}`);
      }
    }

    const count = intakeDrafts.length;
    setStatus(`✅ ${count} product${count === 1 ? '' : 's'} saved!`);
    setIntakeDrafts([createEmptyIntake()]);
    setSaving(false);
    await refresh();
  }

  // ═══════════════════════════════════════════════════════════════════
  // EDIT SAVED PRODUCTS
  // ═══════════════════════════════════════════════════════════════════

  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [editProductName, setEditProductName] = useState('');
  const [editUnitName, setEditUnitName] = useState('');
  const [editSellPrice, setEditSellPrice] = useState('');
  const [editCostPrice, setEditCostPrice] = useState('');

  // Variant edit state
  const [editingVariant, setEditingVariant] = useState<string | null>(null);
  const [editVariantName, setEditVariantName] = useState('');
  const [editVariantPrice, setEditVariantPrice] = useState('');
  const [deleteVariantConfirm, setDeleteVariantConfirm] = useState<string | null>(null);

  function startEditProduct(p: Product) {
    setEditingProduct(p.id);
    setEditProductName(p.name);
    setEditUnitName(p.retail_unit_name || '');
    setEditSellPrice(String(p.retail_sell_price || p.bulk_sell_price || ''));
    setEditCostPrice(String(p.bulk_cost_price || ''));
  }

  async function handleUpdateProduct(productId: string) {
    const { error } = await supabase.from('products').update({
      name: editProductName.trim(),
      retail_unit_name: editUnitName.trim() || 'unit',
      bulk_unit_name: editUnitName.trim() || 'unit',
      retail_sell_price: Number(editSellPrice) || 0,
      bulk_sell_price: Number(editSellPrice) || 0,
      bulk_cost_price: Number(editCostPrice) || 0,
    }).eq('id', productId);
    if (error) setError(`Error: ${error.message}`);
    else { setStatus('Product updated.'); setEditingProduct(null); await refresh(); }
  }

  async function handleDeleteProduct(productId: string) {
    // 1. Delete variants first
    const { error: varDelErr } = await supabase.from('product_variants').delete().eq('product_id', productId);
    if (varDelErr) console.warn('Variant delete:', varDelErr.message);

    // 2. Try to null out intake records referencing this product
    await supabase.from('inventory_intake').update({ product_id: null }).eq('product_id', productId);

    // 3. Delete the product
    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) {
      if (error.message.includes('foreign key') || error.message.includes('violates')) {
        setError(`Cannot delete: this product has intake records. Run migration 0017 in Supabase SQL Editor to allow deletion.`);
      } else {
        setError(`Delete failed: ${error.message}`);
      }
      console.error('Product delete error:', error);
    } else {
      setStatus('Product deleted successfully.');
      setEditingProduct(null);
      await refresh();
    }
  }

  function startEditVariant(v: ProductVariant) {
    setEditingVariant(v.id);
    setEditVariantName(v.name);
    setEditVariantPrice(String(v.price));
  }

  async function handleUpdateVariant(variantId: string) {
    const { error } = await supabase.from('product_variants').update({
      name: editVariantName.trim(),
      price: Number(editVariantPrice) || 0,
    }).eq('id', variantId);
    if (error) setError(`Error updating variant: ${error.message}`);
    else { setStatus('Variant updated.'); setEditingVariant(null); await refresh(); }
  }

  async function handleDeleteVariant(variantId: string) {
    const { error } = await supabase.from('product_variants').delete().eq('id', variantId);
    if (error) {
      setError(`Delete failed: ${error.message}. You may need to run migration 0016 in Supabase SQL Editor.`);
      console.error('Variant delete error:', error);
    } else {
      setStatus('Variant deleted.');
      setDeleteVariantConfirm(null);
      setEditingVariant(null);
      await refresh();
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // HISTORY — Edit intake records
  // ═══════════════════════════════════════════════════════════════════

  async function handleUpdateIntakeAmountPaid(intakeId: string, newAmountPaid: number) {
    const { error } = await supabase.from('inventory_intake').update({ amount_paid: newAmountPaid }).eq('id', intakeId);
    if (error) setError(`Error: ${error.message}`);
    else { setStatus('Payment updated.'); await refresh(); }
  }

  // ═══════════════════════════════════════════════════════════════════
  // COMPUTED
  // ═══════════════════════════════════════════════════════════════════

  const selectedSupplierName = suppliers.find((s) => s.id === selectedSupplier)?.name;

  const supplierIntakes = useMemo(() => {
    if (!selectedSupplier) return [];
    return intakes.filter((i) => i.supplier_id === selectedSupplier);
  }, [intakes, selectedSupplier]);

  const supplierNetOwed = useMemo(() => {
    return supplierIntakes.reduce((sum, i) => sum + Number(i.amount_owed), 0);
  }, [supplierIntakes]);

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? '—';

  return (
    <DashboardLayout>
      <BackButton />
      <div className="flex items-center gap-2 mb-1">
        <GyeNyame size={28} className="text-emerald-600" />
        <h1 className="page-title mb-0">Stock Intake</h1>
      </div>
      <p className="page-sub mb-2">
        Buy from distributor → Add variants → Auto-calculate costs → Set profit → Done.
      </p>
      <GhanaFlagStripe height={4} showStar className="mb-3 rounded-full" />

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {[
          { key: 'distributor', label: '① Distributor' },
          { key: 'intake', label: '② Add Stock' },
          { key: 'history', label: '③ Items' },
        ].map((s) => (
          <button
            key={s.key}
            onClick={() => {
              if (s.key === 'distributor') setStep('distributor');
              else if (s.key === 'intake' && selectedSupplier) setStep('intake');
              else if (s.key === 'history') setStep('history');
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
              step === s.key ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            style={step === s.key ? { background: 'var(--ghana-green)' } : {}}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>}
      {status && <div className="mb-4 p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-800">{status}</div>}

      {/* ═══════════════════════════════════════════════════════════════
          STEP 1: SELECT OR ADD DISTRIBUTOR
          ═══════════════════════════════════════════════════════════════ */}
      {step === 'distributor' && (
        <div className="grid gap-3 lg:grid-cols-2 max-w-5xl">
          <form onSubmit={handleAddDistributor} className="card p-4 space-y-2 h-fit">
            <h2 className="text-lg font-semibold text-gray-900">Add New Distributor</h2>
            <p className="text-sm text-gray-500">Who did you buy from?</p>
            <div>
              <label className="label">Distributor Name</label>
              <input required value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)}
                placeholder="e.g. Kumasi Trading Co." className="input w-full" />
            </div>
            <button type="submit" className="btn btn-primary w-full">Add & Start Intake →</button>
          </form>

          <div className="card overflow-hidden">
            <p className="card-header">Existing Distributors ({suppliers.length})</p>
            {suppliers.length === 0 ? (
              <p className="p-4 text-gray-500 text-sm">No distributors yet.</p>
            ) : (
              <ul className="divide-y">
                {suppliers.map((s) => {
                  const owed = intakes.filter((i) => i.supplier_id === s.id).reduce((sum, i) => sum + Number(i.amount_owed), 0);
                  const isEditing = editingSupplier === s.id;
                  return (
                    <li key={s.id}>
                      {isEditing ? (
                        <div className="px-4 py-3 bg-gray-50">
                          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-2">Edit Distributor</p>
                          <div className="flex gap-2 items-end">
                            <div className="flex-1">
                              <label className="label">Name</label>
                              <input value={editSupplierName} onChange={(e) => setEditSupplierName(e.target.value)} className="input w-full" autoFocus />
                            </div>
                            <button onClick={() => handleUpdateSupplier(s.id)} disabled={supplierBusy || !editSupplierName.trim()} className="btn btn-primary btn-sm">
                              {supplierBusy ? '...' : 'Save'}
                            </button>
                            <button onClick={() => { setEditingSupplier(null); setDeleteConfirm(null); }} className="btn btn-outline btn-sm">Cancel</button>
                          </div>
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            {deleteConfirm === s.id ? (
                              <div className="flex items-center gap-2">
                                <p className="text-sm text-red-600 font-medium">Delete "{s.name}" permanently?</p>
                                <button onClick={() => handleDeleteSupplier(s.id)} disabled={supplierBusy} className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700">
                                  {supplierBusy ? '...' : 'Yes, Delete'}
                                </button>
                                <button onClick={() => setDeleteConfirm(null)} className="px-3 py-1 rounded-lg bg-gray-200 text-gray-700 text-xs font-medium">No</button>
                              </div>
                            ) : (
                              <button onClick={() => setDeleteConfirm(s.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">🗑️ Delete this distributor</button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
                          <button onClick={() => { setSelectedSupplier(s.id); setIntakeDrafts([createEmptyIntake()]); setStep('intake'); }} className="flex-1 text-left">
                            <span className="font-medium">{s.name}</span>
                            {owed > 0 && (
                              <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                                owes {formatGHS(owed)}
                              </span>
                            )}
                            {owed <= 0 && intakes.filter((i) => i.supplier_id === s.id).length > 0 && (
                              <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
                                settled ✓
                              </span>
                            )}
                            <span className="ml-2 text-sm text-emerald-600 font-medium">Select →</span>
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); setEditingSupplier(s.id); setEditSupplierName(s.name); setDeleteConfirm(null); }}
                            className="px-2 py-1 rounded-lg text-xs text-gray-400 hover:text-gray-900 hover:bg-gray-100" title="Edit name">✏️</button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          STEP 2: ADD PRODUCTS WITH VARIANTS
          ═══════════════════════════════════════════════════════════════ */}
      {step === 'intake' && (
        <div className="max-w-5xl">
          {/* Supplier banner */}
          <div className="mb-4 p-3 rounded-xl flex items-center gap-3" style={{ background: 'rgba(252,209,22,0.1)', border: '1px solid var(--ghana-gold)' }}>
            <Nsoromma size={20} color="var(--ghana-gold)" />
            <div>
              <p className="text-sm font-semibold text-gray-900">Buying from: {selectedSupplierName}</p>
              {supplierNetOwed > 0 && (
                <p className="text-xs text-amber-700 font-medium">Currently owe: {formatGHS(supplierNetOwed)}</p>
              )}
            </div>
            <button onClick={() => { setStep('distributor'); setSelectedSupplier(''); }}
              className="ml-auto text-xs text-gray-500 hover:text-gray-900 underline">Change distributor</button>
          </div>

          <form onSubmit={handleSaveAll} className="space-y-6">
            {intakeDrafts.map((draft, idx) => {
              const totalAllCosts = draft.variants.reduce((s, v) => s + (Number(v.totalCost) || 0), 0);
              const totalPaid = draft.paidOnCredit ? Number(draft.amountPaid || 0) : totalAllCosts;
              const totalOwed = Math.max(totalAllCosts - totalPaid, 0);

              return (
                <div key={draft.key} className="card overflow-hidden">
                  {/* Product header */}
                  <div className="px-5 py-2 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <label className="label mb-1">Product Name</label>
                        <input
                          required value={draft.productName}
                          onChange={(e) => updateItem(draft.key, { productName: e.target.value })}
                          placeholder="e.g. Mattress, Sugar, Rice"
                          className="input w-full max-w-md"
                        />
                      </div>
                      {intakeDrafts.length > 1 && (
                        <button type="button" onClick={() => removeItem(draft.key)} className="ml-3 text-xs text-gray-400 hover:text-red-600">Remove</button>
                      )}
                    </div>

                    {/* Variant toggle */}
                    <div className="mt-3 flex items-center gap-3">
                      <p className="text-sm text-gray-600">Does this product have variants?</p>
                      <div className="flex rounded-lg overflow-hidden border border-gray-200">
                        <button
                          type="button"
                          onClick={() => {
                            updateItem(draft.key, {
                              hasVariants: false,
                              variants: [{ ...draft.variants[0], name: '' }],
                            });
                          }}
                          className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                            !draft.hasVariants ? 'text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                          }`}
                          style={!draft.hasVariants ? { background: 'var(--ghana-green)' } : {}}
                        >
                          No variant
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            updateItem(draft.key, {
                              hasVariants: true,
                              variants: draft.variants[0]?.name.trim() ? draft.variants : [{ ...draft.variants[0], name: '' }],
                            });
                          }}
                          className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                            draft.hasVariants ? 'text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                          }`}
                          style={draft.hasVariants ? { background: 'var(--ghana-green)' } : {}}
                        >
                          Has variants
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Variant rows */}
                  <div className="p-4 space-y-2">
                    {!draft.hasVariants ? (
                      /* ---- NO VARIANT: Single unit ---- */
                      <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Single Unit</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                          <div>
                            <label className="label">Unit Name</label>
                            <input required value={draft.variants[0]?.name || ''}
                              onChange={(e) => updateVariant(draft.key, draft.variants[0].key, { name: e.target.value })}
                              placeholder="piece, item, unit"
                              className="input w-full" />
                          </div>
                          <div>
                            <label className="label">Quantity Bought</label>
                            <input type="number" min="0" step="1" required value={draft.variants[0]?.quantity || ''}
                              onChange={(e) => updateVariant(draft.key, draft.variants[0].key, { quantity: e.target.value })}
                              placeholder="e.g. 10"
                              className="input w-full" />
                          </div>
                          <div>
                            <label className="label">Total Cost (GHS)</label>
                            <input type="number" min="0" step="any" required value={draft.variants[0]?.totalCost || ''}
                              onChange={(e) => updateVariant(draft.key, draft.variants[0].key, { totalCost: e.target.value })}
                              placeholder="e.g. 500"
                              className="input w-full" />
                          </div>
                          <div>
                            <label className="label">Profit per Unit (GHS)</label>
                            <input type="number" min="0" step="any" value={draft.variants[0]?.profitMargin || ''}
                              onChange={(e) => updateVariant(draft.key, draft.variants[0].key, { profitMargin: e.target.value })}
                              placeholder="e.g. 10"
                              className="input w-full" />
                          </div>
                          <div className="rounded-lg p-3" style={{ background: 'rgba(0,107,63,0.06)', border: '1px solid rgba(0,107,63,0.15)' }}>
                            <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--ghana-green)' }}>Auto-Calculated</p>
                            <p className="text-sm"><span className="text-gray-500">Cost/unit:</span> <span className="font-bold tabular-nums">{draft.variants[0]?.unitCost > 0 ? formatGHS(draft.variants[0].unitCost) : '—'}</span></p>
                            <p className="text-sm mt-0.5"><span className="text-gray-500">Sell price:</span> <span className="font-bold tabular-nums" style={{ color: 'var(--ghana-green)' }}>{draft.variants[0]?.sellPrice > 0 ? formatGHS(draft.variants[0].sellPrice) : '—'}</span></p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* ---- HAS VARIANTS: Multiple units ---- */
                      <>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Add each variant (each variant = a unit)</p>
                          <button type="button" onClick={() => addVariant(draft.key)} className="text-xs font-medium text-emerald-600 hover:text-emerald-800">
                            + Add Variant
                          </button>
                        </div>

                        {draft.variants.map((v, vi) => (
                          <div key={v.key} className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                                Variant {vi + 1}
                              </p>
                              {draft.variants.length > 1 && (
                                <button type="button" onClick={() => removeVariant(draft.key, v.key)} className="text-xs text-gray-400 hover:text-red-700">Remove</button>
                              )}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                              <div>
                                <label className="label">Variant / Unit Name</label>
                                <input required value={v.name}
                                  onChange={(e) => updateVariant(draft.key, v.key, { name: e.target.value })}
                                  placeholder="16 inch, large, cup"
                                  className="input w-full" />
                              </div>
                              <div>
                                <label className="label">Quantity Bought</label>
                                <input type="number" min="0" step="1" required value={v.quantity}
                                  onChange={(e) => updateVariant(draft.key, v.key, { quantity: e.target.value })}
                                  placeholder="e.g. 16"
                                  className="input w-full" />
                              </div>
                              <div>
                                <label className="label">Total Cost (GHS)</label>
                                <input type="number" min="0" step="any" required value={v.totalCost}
                                  onChange={(e) => updateVariant(draft.key, v.key, { totalCost: e.target.value })}
                                  placeholder="e.g. 400"
                                  className="input w-full" />
                              </div>
                              <div>
                                <label className="label">Profit per Unit (GHS)</label>
                                <input type="number" min="0" step="any" value={v.profitMargin}
                                  onChange={(e) => updateVariant(draft.key, v.key, { profitMargin: e.target.value })}
                                  placeholder="e.g. 10"
                                  className="input w-full" />
                              </div>
                              <div className="rounded-lg p-3" style={{ background: 'rgba(0,107,63,0.06)', border: '1px solid rgba(0,107,63,0.15)' }}>
                                <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--ghana-green)' }}>Auto</p>
                                <p className="text-sm"><span className="text-gray-500">Cost:</span> <span className="font-bold tabular-nums">{v.unitCost > 0 ? formatGHS(v.unitCost) : '—'}</span></p>
                                <p className="text-sm mt-0.5"><span className="text-gray-500">Sell:</span> <span className="font-bold tabular-nums" style={{ color: 'var(--ghana-green)' }}>{v.sellPrice > 0 ? formatGHS(v.sellPrice) : '—'}</span></p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </>
                    )}

                    {/* Product totals */}
                    <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-gray-100 text-sm">
                      <p className="text-gray-500">
                        Total cost: <span className="font-bold text-gray-900">{formatGHS(totalAllCosts)}</span>
                      </p>
                      {draft.hasVariants && draft.variants.filter((v) => v.name.trim()).length > 1 && (
                        <p className="text-gray-500">
                          {draft.variants.filter((v) => v.name.trim()).length} variants
                        </p>
                      )}
                    </div>

                    {/* Credit / Payment */}
                    <div className="pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-3 mb-2">
                        <label className="flex items-center gap-2 text-sm text-gray-600">
                          <input type="checkbox" checked={draft.paidOnCredit}
                            onChange={(e) => updateItem(draft.key, { paidOnCredit: e.target.checked })}
                            className="rounded border-gray-300" />
                          Bought on credit?
                        </label>
                      </div>
                      {draft.paidOnCredit && (
                        <div className="flex flex-wrap items-end gap-3">
                          <div>
                            <label className="label">Amount Paid Now (GHS)</label>
                            <input type="number" min="0" step="any" value={draft.amountPaid}
                              onChange={(e) => updateItem(draft.key, { amountPaid: e.target.value })}
                              placeholder="0" className="input w-40" />
                          </div>
                          <div className="rounded-lg px-4 py-2" style={{
                            background: totalOwed > 0 ? 'rgba(206,17,38,0.08)' : 'rgba(0,107,63,0.08)',
                            border: `1px solid ${totalOwed > 0 ? 'rgba(206,17,38,0.2)' : 'rgba(0,107,63,0.2)'}`,
                          }}>
                            <p className="text-xs text-gray-500">Amount remaining</p>
                            <p className="text-lg font-bold tabular-nums" style={{ color: totalOwed > 0 ? 'var(--ghana-red)' : 'var(--ghana-green)' }}>
                              {formatGHS(totalOwed)}
                            </p>
                          </div>
                        </div>
                      )}
                      {!draft.paidOnCredit && totalAllCosts > 0 && (
                        <div className="rounded-lg px-4 py-2 inline-flex items-center gap-2" style={{ background: 'rgba(0,107,63,0.08)', border: '1px solid rgba(0,107,63,0.2)' }}>
                          <span className="text-sm" style={{ color: 'var(--ghana-green)' }}>✓ Paid in full</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="flex gap-3">
              <button type="button" onClick={addItem} className="btn btn-outline">+ Add Another Product</button>
              <button type="submit" disabled={saving} className="btn btn-primary flex-1">
                {saving ? 'Saving...' : '💾 Save All to Inventory'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          STEP 3: ITEMS — Products, Variants, Edit, Delete
          ═══════════════════════════════════════════════════════════════ */}
      {step === 'history' && (
        <div className="max-w-5xl space-y-8">
          {/* ---- Saved Products ---- */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">All Items ({products.length})</h2>
            <p className="text-sm text-gray-500 mb-4">Edit product names, unit names, prices, and variants. Delete items you no longer sell.</p>
            <div className="mb-4 p-3 rounded-xl text-xs" style={{ background: 'rgba(252,209,22,0.08)', border: '1px solid var(--ghana-gold)' }}>
              <p className="font-medium text-gray-700">⚠️ If edit/delete doesn't work, run migrations 0016 and 0017 in Supabase SQL Editor.</p>
            </div>
            {products.length === 0 ? (
              <div className="card p-8 text-center">
                <p className="text-gray-500">No products yet. Add your first in Step ②.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {products.map((p) => {
                  const variants = productVariants.filter((v) => v.product_id === p.id);
                  const intakeForProduct = intakes.filter((i) => i.product_id === p.id);
                  const totalOwed = intakeForProduct.reduce((s, i) => s + Number(i.amount_owed), 0);
                  const isEditing = editingProduct === p.id;

                  return (
                    <div key={p.id} className="card overflow-hidden">
                      {isEditing ? (
                        <div className="p-4 bg-gray-50">
                          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-2">Edit Product</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                            <div>
                              <label className="label">Product Name</label>
                              <input value={editProductName} onChange={(e) => setEditProductName(e.target.value)} className="input w-full" />
                            </div>
                            <div>
                              <label className="label">Unit Name</label>
                              <input value={editUnitName} onChange={(e) => setEditUnitName(e.target.value)} placeholder="piece, cup, bag" className="input w-full" />
                            </div>
                            <div>
                              <label className="label">Cost Price (GHS)</label>
                              <input type="number" min="0" step="any" value={editCostPrice} onChange={(e) => setEditCostPrice(e.target.value)} className="input w-full" />
                            </div>
                            <div>
                              <label className="label">Sell Price (GHS)</label>
                              <input type="number" min="0" step="any" value={editSellPrice} onChange={(e) => setEditSellPrice(e.target.value)} className="input w-full" />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleUpdateProduct(p.id)} className="btn btn-primary btn-sm">Save Product</button>
                            <button onClick={() => setEditingProduct(null)} className="btn btn-outline btn-sm">Cancel</button>
                            <button onClick={() => { if (confirm(`Delete "${p.name}" and all its variants?`)) handleDeleteProduct(p.id); }} className="ml-auto text-xs text-red-500 hover:text-red-700 font-medium">🗑️ Delete Product</button>
                          </div>

                          {/* Variant edit section */}
                          {variants.length > 0 && (
                            <div className="mt-4 pt-3 border-t border-gray-200">
                              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-2">Variants ({variants.length})</p>
                              <div className="space-y-2">
                                {variants.map((v) => {
                                  const isVarEditing = editingVariant === v.id;
                                  const isVarDeleting = deleteVariantConfirm === v.id;
                                  return (
                                    <div key={v.id} className="rounded-lg border border-gray-200 bg-white p-3">
                                      {isVarEditing ? (
                                        <div className="flex items-end gap-2">
                                          <div className="flex-1">
                                            <label className="label">Name</label>
                                            <input value={editVariantName} onChange={(e) => setEditVariantName(e.target.value)} className="input w-full" />
                                          </div>
                                          <div className="w-32">
                                            <label className="label">Price (GHS)</label>
                                            <input type="number" min="0" step="any" value={editVariantPrice} onChange={(e) => setEditVariantPrice(e.target.value)} className="input w-full" />
                                          </div>
                                          <button onClick={() => handleUpdateVariant(v.id)} className="btn btn-primary btn-sm">Save</button>
                                          <button onClick={() => setEditingVariant(null)} className="btn btn-outline btn-sm">Cancel</button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-between">
                                          <span className="text-sm"><span className="font-medium">{v.name}</span> · {formatGHS(v.price)}</span>
                                          <div className="flex items-center gap-1">
                                            <button onClick={() => startEditVariant(v)} className="text-xs text-gray-400 hover:text-gray-900 px-1.5 py-0.5 rounded hover:bg-gray-100">✏️</button>
                                            {isVarDeleting ? (
                                              <div className="flex items-center gap-1">
                                                <span className="text-xs text-red-600">Delete?</span>
                                                <button onClick={() => handleDeleteVariant(v.id)} className="text-xs text-red-600 font-bold hover:text-red-800">Yes</button>
                                                <button onClick={() => setDeleteVariantConfirm(null)} className="text-xs text-gray-500 hover:text-gray-900">No</button>
                                              </div>
                                            ) : (
                                              <button onClick={() => setDeleteVariantConfirm(v.id)} className="text-xs text-gray-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50">🗑️</button>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-4 flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900">{p.name}</p>
                              {totalOwed > 0 && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">owes {formatGHS(totalOwed)}</span>
                              )}
                              {totalOwed <= 0 && intakeForProduct.length > 0 && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">✓ settled</span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {variants.map((v) => (
                                <span key={v.id} className="tag">
                                  {v.name} · {formatGHS(v.price)}
                                </span>
                              ))}
                              {variants.length === 0 && (
                                <span className="tag">{p.retail_unit_name} · {formatGHS(p.retail_sell_price)}</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 mt-1">
                              Cost: {formatGHS(p.bulk_cost_price)} · Sell: {formatGHS(p.retail_sell_price || p.bulk_sell_price)}
                            </p>
                          </div>
                          <button onClick={() => startEditProduct(p)} className="text-xs text-gray-400 hover:text-gray-900 font-medium px-2 py-1 rounded hover:bg-gray-100">✏️ Edit</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ---- Intake Records ---- */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Intake Records ({intakes.length})</h2>
            <p className="text-sm text-gray-500 mb-4">Payment history per purchase.</p>
            {intakes.length === 0 ? (
              <div className="card p-8 text-center">
                <p className="text-gray-500">No intake records yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {intakes.map((intake) => {
                  const owed = Number(intake.amount_owed);
                  const paid = Number(intake.amount_paid);
                  const total = Number(intake.cost_price_total);
                  const isSettled = owed <= 0;
                  const isEditing = editingIntake === intake.id;

                  return (
                    <div key={intake.id} className="card p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900">{productName(intake.product_id)}</p>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isSettled ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {isSettled ? '✓ Settled' : `owes ${formatGHS(owed)}`}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {Number(intake.bulk_quantity)} units · Total: {formatGHS(total)} ·
                            Paid: {formatGHS(paid)} ·
                            {new Date(intake.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <button onClick={() => setEditingIntake(isEditing ? null : intake.id)}
                          className="text-xs text-gray-400 hover:text-gray-900 font-medium px-2 py-1 rounded hover:bg-gray-100">
                          {isEditing ? 'Close' : 'Edit →'}
                        </button>
                      </div>

                      {isEditing && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <div className="flex items-end gap-3">
                            <div>
                              <label className="label">Amount Paid (GHS)</label>
                              <input type="number" min="0" step="any" defaultValue={paid}
                                id={`paid-${intake.id}`} className="input w-40" />
                            </div>
                            <button onClick={() => {
                              const el = document.getElementById(`paid-${intake.id}`) as HTMLInputElement;
                              if (el) handleUpdateIntakeAmountPaid(intake.id, Number(el.value) || 0);
                            }} className="btn btn-primary btn-sm">
                              Update Payment
                            </button>
                          </div>
                          <div className="mt-2 rounded-lg px-3 py-2 text-xs" style={{
                            background: owed > 0 ? 'rgba(206,17,38,0.06)' : 'rgba(0,107,63,0.06)',
                            border: `1px solid ${owed > 0 ? 'rgba(206,17,38,0.15)' : 'rgba(0,107,63,0.15)'}`,
                          }}>
                            <span style={{ color: owed > 0 ? 'var(--ghana-red)' : 'var(--ghana-green)' }}>
                              {owed > 0 ? `Still owes ${formatGHS(owed)}` : '✓ Fully paid'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
