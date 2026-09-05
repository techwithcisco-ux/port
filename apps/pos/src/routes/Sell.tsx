import { useEffect, useMemo, useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useLocation } from 'react-router-dom';
import { db } from '../lib/db';
import { pushQueuedSales } from '../lib/sync';
import { useAuth } from '../contexts/AuthContext';
import type { Product, ProductVariant, QueuedSale, Invoice, InvoiceItem, PaymentMode } from '@branchport/shared';
import {
  getProductVariants,
  variantUnitType,
  saleBaseUnits,
  isSyntheticVariant,
  nowISO,
} from '@branchport/shared';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────

interface CartLine {
  key: number;
  product: Product;
  variant: ProductVariant;
  qty: number;
  cutPrice: number | null; // discounted unit price (null = no discount)
  isFreeDiscount: boolean; // free discount = cutPrice × qty replaces original
}

// ─── Helpers ──────────────────────────────────────────────────────────────

let nextLineKey = 1;

function ghs(n: number): string {
  return `GHS ${n.toFixed(2)}`;
}

function nextInvoiceNumber(): string {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `BP-${ym}-${String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0')}`;
}

// ─── Component ────────────────────────────────────────────────────────────

export default function Sell() {
  const { profile } = useAuth();
  const products = useLiveQuery(() => db.products.toArray(), []) ?? [];
  const allocations = useLiveQuery(
    () => (profile ? db.allocations.where('branch_id').equals(profile.branch_id!).toArray() : []),
    [profile]
  ) ?? [];
  const mySales = useLiveQuery(
    () => (profile ? db.sales.where('branch_id').equals(profile.branch_id!).toArray() : []),
    [profile]
  ) ?? [];
  const invoices = useLiveQuery(
    () => (profile ? db.invoices.where('branch_id').equals(profile.branch_id!).toArray() : []),
    [profile]
  ) ?? [];

  const location = useLocation();
  const resumeInvoiceId = (location.state as { resumeInvoiceId?: string } | null)?.resumeInvoiceId;

  // ── Search & product selection ──
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [qty, setQty] = useState('1');
  const [cutPrice, setCutPrice] = useState('');
  const [isFreeDiscount, setIsFreeDiscount] = useState(false);

  // ── Cart ──
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('full');

  // ── UI state ──
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [showCustomer, setShowCustomer] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (feedback) {
      const t = setTimeout(() => setFeedback(null), 2500);
      return () => clearTimeout(t);
    }
  }, [feedback]);

  useEffect(() => {
    setOnline(navigator.onLine);
  }, []);

  // Resume an invoice from InvoiceHistory navigation
  useEffect(() => {
    if (resumeInvoiceId) {
      const inv = invoices.find((i) => i.id === resumeInvoiceId);
      if (inv) resumeInvoice(inv);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeInvoiceId]);

  // Remaining stock
  function stockFor(product: Product) {
    const allocated = allocations
      .filter((a) => a.product_id === product.id)
      .reduce((sum, a) => sum + Number(a.retail_quantity_equivalent), 0);
    const sold = mySales
      .filter((s) => s.product_id === product.id)
      .reduce((sum, s) => sum + Number(s.quantity) * saleBaseUnits(product, s), 0);
    return Math.max(allocated - sold, 0);
  }

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return products;
    return products.filter((p) => {
      if (p.name.toLowerCase().includes(t)) return true;
      return getProductVariants(p).some((v) => v.name.toLowerCase().includes(t));
    });
  }, [products, search]);

  // Subtotal accounts for cut prices: if cutPrice is set, use it; otherwise use variant price
  const subtotal = cart.reduce((sum, l) => {
    const unitPrice = l.cutPrice != null ? l.cutPrice : Number(l.variant.price);
    return sum + l.qty * unitPrice;
  }, 0);
  const grandTotal = subtotal;

  // ── Product selection ──
  function selectProduct(p: Product) {
    setSelectedProduct(p);
    const variants = getProductVariants(p);
    setSelectedVariant(variants[0] ?? null);
    setQty('1');
  }

  function addSelected() {
    if (!selectedProduct || !selectedVariant) return;
    const q = Math.max(1, Math.round(Number(qty) || 1));
    const cp = cutPrice.trim() ? Math.max(0, Number(cutPrice)) : null;
    setCart((c) => [...c, { key: nextLineKey++, product: selectedProduct, variant: selectedVariant, qty: q, cutPrice: cp, isFreeDiscount: cp != null ? isFreeDiscount : false }]);
    const label = cp != null ? ` (cut price ${ghs(cp)})` : '';
    setFeedback(`Added ${selectedVariant.name} of ${selectedProduct.name}${label}`);
    setSelectedProduct(null);
    setSelectedVariant(null);
    setQty('1');
    setCutPrice('');
    setIsFreeDiscount(false);
  }

  function setLineQty(key: number, q: number) {
    setCart((c) => c.map((l) => (l.key === key ? { ...l, qty: Math.max(1, q) } : l)));
  }

  function removeLine(key: number) {
    setCart((c) => c.filter((l) => l.key !== key));
  }

  // ── Build InvoiceItem[] from cart ──
  function buildInvoiceItems(): InvoiceItem[] {
    return cart.map((l) => {
      const originalPrice = Number(l.variant.price);
      const effectivePrice = l.cutPrice != null ? l.cutPrice : originalPrice;
      return {
        product_id: l.product.id,
        product_name: l.product.name,
        variant_id: isSyntheticVariant(l.variant) ? null : l.variant.id,
        variant_name: l.variant.name,
        quantity: l.qty,
        unit_price: effectivePrice,
        original_unit_price: l.cutPrice != null ? originalPrice : undefined,
        is_discounted: l.cutPrice != null,
        total: Math.round(l.qty * effectivePrice * 100) / 100,
      };
    });
  }

  // ── Cost price per line (for profit display, manager/owner only) ──
  function costPerUnit(product: Product): number {
    return product.units_per_bulk > 0
      ? product.bulk_cost_price / product.units_per_bulk
      : 0;
  }

  const totalCost = cart.reduce((s, l) => s + l.qty * costPerUnit(l.product), 0);
  const totalProfit = grandTotal - totalCost;
  const totalSavings = cart.reduce((s, l) => {
    if (l.cutPrice == null) return s;
    return s + l.qty * (Number(l.variant.price) - l.cutPrice);
  }, 0);
  const isOwnerOrManager = profile?.role === 'owner' || profile?.role === 'manager';

  // ── Complete sale ──
  async function completeOrder() {
    if (cart.length === 0 || !profile?.branch_id || confirming) return;
    setConfirming(true);

    const now = nowISO();
    const items = buildInvoiceItems();
    const paid = paymentMode === 'full' ? grandTotal : 0;
    const owed = grandTotal - paid;
    const invoiceStatus = owed <= 0 ? 'completed' : 'pending';

    // Write individual sale rows — use cut price if set
    const rows: QueuedSale[] = cart.map((l) => {
      const originalPrice = Number(l.variant.price);
      const effectivePrice = l.cutPrice != null ? l.cutPrice : originalPrice;
      return {
        id: crypto.randomUUID(),
        branch_id: profile.branch_id!,
        product_id: l.product.id,
        variant_id: isSyntheticVariant(l.variant) ? null : l.variant.id,
        unit_type: variantUnitType(l.product, l.variant),
        quantity: l.qty,
        unit_price: effectivePrice,
        total_price: Math.round(l.qty * effectivePrice * 100) / 100,
        sold_by: profile.id,
        sold_at: now,
        client_reported_at: now,
        price_flagged: false,
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
        synced: false,
        cut_price: l.cutPrice,
        is_discounted: l.cutPrice != null,
      };
    });

    await db.sales.bulkAdd(rows);

    // Build notes with discount/credit info for audit trail
    const hasDiscounts = items.some((it) => it.is_discounted);
    const notesParts: string[] = [];
    if (hasDiscounts) {
      const discountLines = items
        .filter((it) => it.is_discounted)
        .map((it) => `${it.product_name}: ${ghs(it.original_unit_price!)} → ${ghs(it.unit_price)} each`);
      notesParts.push(`Discount applied: ${discountLines.join('; ')}`);
    }
    if (paymentMode === 'credit') {
      notesParts.push(`Credit sale — ${ghs(owed)} owed by ${customerName.trim() || 'walk-in'}`);
    }

    // Save invoice record
    const invoice: Invoice = {
      id: editingInvoiceId ?? crypto.randomUUID(),
      invoice_number: editingInvoiceId
        ? (invoices.find((i) => i.id === editingInvoiceId)?.invoice_number ?? nextInvoiceNumber())
        : nextInvoiceNumber(),
      branch_id: profile.branch_id!,
      created_by: profile.id,
      customer_name: customerName.trim() || null,
      customer_phone: customerPhone.trim() || null,
      items,
      subtotal: Math.round(subtotal * 100) / 100,
      tax_rate: 0,
      tax_amount: 0,
      grand_total: Math.round(grandTotal * 100) / 100,
      payment_mode: paymentMode,
      amount_paid: Math.round(paid * 100) / 100,
      amount_owed: Math.round(owed * 100) / 100,
      status: invoiceStatus,
      notes: notesParts.join(' | '),
      created_at: now,
      updated_at: now,
    };

    await db.invoices.put(invoice);
    void supabase.from('invoices').upsert(invoice);

    // If credit payment → auto-create a debtor record
    if (owed > 0) {
      const debtor = {
        id: crypto.randomUUID(),
        business_id: profile.business_id,
        branch_id: profile.branch_id,
        customer_name: customerName.trim() || 'Walk-in',
        customer_phone: customerPhone.trim() || null,
        invoice_id: invoice.id,
        original_amount: grandTotal,
        amount_paid: paid,
        amount_owed: owed,
        status: 'pending' as const,
        notes: `Invoice ${invoice.invoice_number} — credit sale`,
        created_at: now,
        updated_at: now,
      };
      await db.debtors.add(debtor);
      void supabase.from('debtors').upsert(debtor);
    }

    // Log discount + credit actions to audit_events
    if (hasDiscounts || paymentMode === 'credit') {
      const auditEntry = {
        id: crypto.randomUUID(),
        business_id: profile.business_id,
        actor_user_id: profile.id,
        action_type: hasDiscounts && paymentMode === 'credit' ? 'discounted_credit_sale' : hasDiscounts ? 'discount_applied' : 'credit_sale',
        entity_type: 'invoice',
        entity_id: invoice.id,
        before_state: null,
        after_state: {
          invoice_number: invoice.invoice_number,
          customer: customerName.trim() || 'Walk-in',
          grand_total: grandTotal,
          amount_owed: owed,
          discounted_items: items.filter((it) => it.is_discounted).map((it) => ({
            product: it.product_name,
            original_price: it.original_unit_price,
            cut_price: it.unit_price,
            quantity: it.quantity,
          })),
        },
        occurred_at: now,
        client_reported_at: now,
      };
      void supabase.from('audit_events').insert(auditEntry);
    }

    setFeedback(`Sale complete — ${ghs(grandTotal)}${owed > 0 ? ` (${ghs(owed)} owed)` : ''}`);
    resetForm();
    setConfirming(false);
    void pushQueuedSales();
  }

  // ── Resume a pending invoice ──
  function resumeInvoice(inv: Invoice) {
    setEditingInvoiceId(inv.id);
    setCustomerName(inv.customer_name ?? '');
    setCustomerPhone(inv.customer_phone ?? '');
    setPaymentMode(inv.payment_mode ?? 'full');
    setShowCustomer(!!inv.customer_name);
    setCart(
      inv.items.map((item) => {
        const product = products.find((p) => p.id === item.product_id);
        const variants = product ? getProductVariants(product) : [];
        const variant = variants.find((v) => v.id === item.variant_id) ?? variants[0];
        if (!product || !variant) return null;
        const hasDiscount = item.is_discounted && item.original_unit_price != null;
        return {
          key: nextLineKey++,
          product,
          variant,
          qty: item.quantity,
          cutPrice: hasDiscount ? item.unit_price : null,
          isFreeDiscount: hasDiscount,
        };
      }).filter(Boolean) as CartLine[]
    );
    setFeedback(`Editing invoice ${inv.invoice_number}`);
  }

  function resetForm() {
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setPaymentMode('full');
    setShowCustomer(false);
    setSearch('');
    setSelectedProduct(null);
    setSelectedVariant(null);
    setQty('1');
    setCutPrice('');
    setIsFreeDiscount(false);
    setEditingInvoiceId(null);
  }

  // ── Pending invoices ──
  const pendingInvoices = useMemo(
    () => invoices.filter((i) => i.status === 'pending').sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [invoices]
  );

  return (
    <div className="flex flex-col lg:flex-row h-[100dvh] min-h-[100dvh] max-h-[100dvh] bg-gray-50 overflow-hidden pb-14 lg:pb-0">
      {/* ══════════════════════════════════════════════════════════════════════
          LEFT PANEL — Search + Products
          Mobile: collapses to ~60vh. Desktop: fixed 480px sidebar.
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col lg:w-[480px] xl:w-[520px] border-b lg:border-b-0 lg:border-r border-gray-200 bg-white overflow-hidden lg:max-h-none max-h-[60vh] min-h-0">
        {/* Header — simplified: just 2 nav buttons */}
        <header className="px-4 pt-4 pb-3 border-b border-gray-100 safe-top">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Sell</h1>
              {profile?.branch_id && (
                <p className="text-xs text-gray-500">{profile.name}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={online ? 'text-green-500' : 'text-red-500 text-sm font-medium'}>
                {online ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
          {feedback && (
            <div className="bg-green-50 text-green-800 rounded-xl px-4 py-3 text-sm mb-3 font-medium">{feedback}</div>
          )}

          {/* Search — bigger touch target */}
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className="w-full border border-gray-200 rounded-xl px-4 py-4 text-base bg-gray-50 focus:outline-none focus:border-gray-900 focus:bg-white"
              inputMode="search"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-xl leading-none min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                ×
              </button>
            )}
          </div>
        </header>

        {/* Product list / selected product detail */}
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
          {/* Selected product "Add to order" card */}
          {selectedProduct && (
            <div className="mb-4 bg-gray-50 border-2 border-gray-900 rounded-2xl p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-base">{selectedProduct.name}</p>
                  <p className="text-sm text-gray-500">{stockFor(selectedProduct)} left</p>
                </div>
                <button
                  onClick={() => { setSelectedProduct(null); setSelectedVariant(null); }}
                  className="text-gray-400 hover:text-gray-700 text-xl leading-none min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  ×
                </button>
              </div>

              {/* Variants — bigger buttons */}
              <div className="flex flex-wrap gap-2 mb-3">
                {getProductVariants(selectedProduct).map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVariant(v)}
                    className={`px-4 py-3 rounded-xl text-sm font-medium min-h-[44px] ${
                      selectedVariant?.id === v.id
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {v.name} · {ghs(Number(v.price))}
                  </button>
                ))}
              </div>

              {/* Qty stepper + Add — bigger touch targets */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQty(String(Math.max(1, (Number(qty) || 1) - 1)))}
                  className="h-12 w-12 rounded-xl bg-gray-200 text-gray-700 text-xl font-medium flex items-center justify-center"
                >
                  −
                </button>
                <input
                  type="number" min="1" inputMode="numeric" value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="flex-1 text-center text-xl font-semibold border border-gray-200 rounded-xl py-2.5 bg-white focus:outline-none focus:border-gray-900"
                />
                <button
                  onClick={() => setQty(String((Number(qty) || 1) + 1))}
                  className="h-12 w-12 rounded-xl bg-gray-200 text-gray-700 text-xl font-medium flex items-center justify-center"
                >
                  +
                </button>
              </div>

              {/* Cut Price + Free Discount */}
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cutPrice.trim() !== ''}
                      onChange={(e) => {
                        if (!e.target.checked) { setCutPrice(''); setIsFreeDiscount(false); }
                        else { setCutPrice(selectedVariant ? String(selectedVariant.price) : ''); }
                      }}
                      className="h-5 w-5 rounded border-gray-300"
                    />
                    <span className="text-sm font-medium text-gray-700">✂️ Cut Price</span>
                  </label>
                </div>
                {cutPrice.trim() !== '' && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Original: <span className="line-through">{ghs(Number(selectedVariant?.price))}</span></span>
                      <span className="text-xs text-green-600 font-medium">You save: {ghs(Number(selectedVariant?.price) - Number(cutPrice))}</span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={cutPrice}
                      onChange={(e) => setCutPrice(e.target.value)}
                      placeholder="New unit price"
                      className="w-full border-2 border-green-400 rounded-xl px-4 py-3 text-base bg-green-50 focus:outline-none focus:border-green-600 font-semibold text-green-800"
                    />
                    <label className="flex items-center gap-2 cursor-pointer bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isFreeDiscount}
                        onChange={(e) => setIsFreeDiscount(e.target.checked)}
                        className="h-5 w-5 rounded border-amber-300"
                      />
                      <span className="text-sm font-medium text-amber-700">🏷️ Free Discount — use cut price × qty</span>
                    </label>
                  </>
                )}
              </div>

              <button
                onClick={addSelected}
                disabled={!selectedVariant}
                className="h-12 px-6 rounded-xl bg-gray-900 text-white text-base font-medium disabled:opacity-40 mt-3 w-full"
              >
                Add to order
              </button>
            </div>
          )}

          {/* Product grid — bigger cards for easy tapping */}
          {filtered.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-10">
              {products.length === 0
                ? 'No products loaded. Connect online once to sync.'
                : `No match for "${search}"`}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3">
              {filtered.sort((a, b) => a.name.localeCompare(b.name)).map((p) => {
                const active = selectedProduct?.id === p.id;
                const variants = getProductVariants(p);
                const base = variants[0];
                const stock = stockFor(p);
                return (
                  <button
                    key={p.id}
                    onClick={() => selectProduct(p)}
                    className={`bg-white border-2 rounded-2xl text-left transition-all overflow-hidden ${
                      active ? 'border-gray-900 shadow-md ring-2 ring-gray-900/10' : 'border-gray-200 hover:border-gray-400 hover:shadow-sm'
                    }`}
                  >
                    {/* Product image or placeholder */}
                    <div className="w-full aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
                      {p.image ? (
                        <img
                          src={`data:image/jpeg;base64,${p.image}`}
                          alt={p.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-4xl opacity-40">📦</span>
                      )}
                    </div>
                    {/* Product info below image */}
                    <div className="px-3 py-2.5">
                      <p className="font-semibold text-sm truncate">{p.name}</p>
                      <p className="text-sm text-gray-900 tabular-nums mt-0.5 font-bold">
                        {ghs(Number(base?.price))}<span className="text-gray-400 font-normal text-xs">/{base?.name}</span>
                      </p>
                      <p className={`text-xs mt-1 ${stock === 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                        {stock === 0 ? 'Out of stock' : `${stock} left`}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          RIGHT PANEL — Order / Invoice (simplified)
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 min-h-0">
        {/* Invoice header */}
        <div className="px-5 pt-4 pb-3 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {editingInvoiceId ? 'Editing invoice' : 'Current order'}
              </h2>
              {editingInvoiceId && (
                <p className="text-xs text-gray-500">
                  {invoices.find((i) => i.id === editingInvoiceId)?.invoice_number}
                </p>
              )}
            </div>
            {cart.length > 0 && (
              <button onClick={resetForm} className="text-sm text-gray-500 hover:text-gray-800 min-h-[44px] px-3">
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Customer details — phone auto-filled from profile, name optional */}
        {!showCustomer && cart.length > 0 && (
          <button
            onClick={() => setShowCustomer(true)}
            className="px-5 py-3 bg-white border-b border-gray-100 text-left text-sm text-gray-500 hover:text-gray-700 min-h-[48px]"
          >
            + Add customer
          </button>
        )}
        {showCustomer && (
          <div className="px-5 py-3 bg-white border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Customer</p>
              <button
                onClick={() => { setShowCustomer(false); setCustomerName(''); setCustomerPhone(''); }}
                className="text-xs text-gray-400 hover:text-gray-700"
              >
                Remove
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                disabled
                value={profile?.phone ?? ''}
                placeholder="Phone (auto-filled)"
                className="border border-gray-200 rounded-xl px-3 py-3 text-sm bg-gray-50 focus:outline-none focus:border-gray-900 focus:bg-white text-sm"
                readOnly
              />
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Name (optional)"
                className="border border-gray-200 rounded-xl px-3 py-3 text-sm bg-gray-50 focus:outline-none focus:border-gray-900 focus:bg-white"
              />
            </div>
          </div>
        )}

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <p className="text-5xl mb-4">🛒</p>
              <p className="text-base font-medium">No items yet</p>
              <p className="text-sm mt-1">Tap a product, then Add</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((l, idx) => (
                <div
                  key={l.key}
                  className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3"
                >
                  <span className="text-sm text-gray-400 w-6 text-center tabular-nums">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{l.product.name}</p>
                    {l.cutPrice != null ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 line-through">{ghs(Number(l.variant.price))}</span>
                        <span className="text-xs text-green-600 font-semibold">→ {ghs(l.cutPrice)}</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">CUT</span>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">
                        {ghs(Number(l.variant.price))}/{l.variant.name}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setLineQty(l.key, l.qty - 1)}
                      className="h-9 w-9 rounded-lg bg-gray-100 text-gray-600 text-base flex items-center justify-center"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm font-medium tabular-nums">{l.qty}</span>
                    <button
                      onClick={() => setLineQty(l.key, l.qty + 1)}
                      className="h-9 w-9 rounded-lg bg-gray-100 text-gray-600 text-base flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                  <p className="w-20 text-right text-sm font-semibold tabular-nums">
                    {ghs(l.qty * (l.cutPrice != null ? l.cutPrice : Number(l.variant.price)))}
                  </p>
                  <button
                    onClick={() => removeLine(l.key)}
                    className="text-gray-300 hover:text-red-600 text-lg leading-none ml-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totals & actions — simplified */}
        <div className="bg-white border-t border-gray-200 px-5 py-4 space-y-3 safe-bottom">
          {/* Payment mode — just Cash or Credit */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPaymentMode('full')}
              className={`py-3 rounded-xl text-sm font-medium transition-colors min-h-[48px] ${
                paymentMode === 'full'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              💵 Cash
            </button>
            <button
              onClick={() => setPaymentMode('credit')}
              className={`py-3 rounded-xl text-sm font-medium transition-colors min-h-[48px] ${
                paymentMode === 'credit'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              📝 Credit
            </button>
          </div>

          {paymentMode === 'credit' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
              <p className="text-sm font-medium text-amber-800">
                📝 Credit Sale — Customer pays later
              </p>
              <p className="text-xs text-amber-600">
                {customerName.trim() ? `${customerName.trim()} will owe ${ghs(grandTotal)}` : 'Enter customer name to track who owes'}
              </p>
              <p className="text-xs text-amber-500">
                Saved to debtors with invoice ID • Owner sees in audit log
              </p>
            </div>
          )}

          {/* Savings display — when discounts are applied */}
          {totalSavings > 0 && (
            <div className="flex justify-between text-sm bg-green-50 border border-green-200 rounded-xl px-3 py-2">
              <span className="text-green-700">🎉 Customer saves</span>
              <span className="font-bold tabular-nums text-green-700">{ghs(totalSavings)}</span>
            </div>
          )}

          {/* Total — big and clear */}
          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            <span className="font-semibold text-gray-900 text-base">Total</span>
            <span className="text-3xl font-bold tabular-nums text-gray-900">{ghs(grandTotal)}</span>
          </div>

          {/* Profit — owner/manager only */}
          {isOwnerOrManager && cart.length > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Profit</span>
              <span className={`tabular-nums font-medium ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{ghs(totalProfit)}</span>
            </div>
          )}

          {/* Action button — single big button */}
          <button
            onClick={completeOrder}
            disabled={confirming || cart.length === 0}
            className="w-full py-4 rounded-xl bg-gray-900 text-white text-base font-semibold hover:bg-gray-800 disabled:opacity-50 min-h-[56px]"
          >
            {confirming ? 'Recording…' : paymentMode === 'full' ? '✓ Complete sale' : `📝 Save credit — ${ghs(grandTotal)}`}
          </button>
        </div>

        {/* Pending invoices — only show if any exist */}
        {pendingInvoices.length > 0 && (
          <div className="bg-white border-t border-gray-200 px-5 py-3 max-h-[160px] overflow-y-auto">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Pending invoices ({pendingInvoices.length})
            </p>
            <div className="space-y-1.5">
              {pendingInvoices.map((inv) => (
                <button
                  key={inv.id}
                  onClick={() => resumeInvoice(inv)}
                  className="w-full text-left flex items-center justify-between p-3 rounded-xl border border-gray-200 hover:border-gray-900 hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {inv.invoice_number}
                    </p>
                    <p className="text-xs text-gray-500">
                      {inv.customer_name || 'Walk-in'} · {inv.items.length} item{inv.items.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums ml-3">
                    {ghs(inv.grand_total)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
