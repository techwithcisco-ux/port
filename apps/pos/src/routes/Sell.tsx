import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useLocation } from 'react-router-dom';
import { db } from '../lib/db';
import { pushQueuedSales, pushLedger } from '../lib/sync';
import { useAuth } from '../contexts/AuthContext';
import type { Product, ProductVariant, QueuedSale, Invoice, InvoiceItem, PaymentMode } from '@branchport/shared';
import {
  getProductVariants,
  variantUnitType,
  saleBaseUnits,
  isSyntheticVariant,
  nowISO,
  loadFeatureConfig,
  isFeatureEnabled,
  productImageSrc,
} from '@branchport/shared';
import SyncIndicator from '../components/SyncIndicator';
import Calculator from '../components/Calculator';

// ─── Types ────────────────────────────────────────────────────────────────

interface CartLine {
  key: number;
  product: Product;
  variant: ProductVariant;
  qty: number;
  cutPrice: number | null; // discounted unit price (null = no discount)
}

// ─── Helpers ──────────────────────────────────────────────────────────────

let nextLineKey = 1;

const EMPTY_PRODUCTS: Product[] = [];

function ghs(n: number): string {
  return `GHS ${n.toFixed(2)}`;
}

function nextInvoiceNumber(): string {
  // Random-only suffixes collide across busy tills sharing one branch, and
  // the retry path reuses numbers. Mixing in time (base36) + randomness
  // makes same-branch collisions practically impossible.
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const time = Date.now().toString(36).slice(-4).toUpperCase();
  const rand = String(Math.floor(Math.random() * 1296)).padStart(2, '0');
  return `BP-${ym}-${time}${rand}`;
}

// ─── Component ────────────────────────────────────────────────────────────

export default function Sell() {
  const { profile } = useAuth();
  // `undefined` while Dexie is still resolving — used to tell "loading"
  // apart from "genuinely empty", otherwise the till flashes
  // "No products loaded" on every cold start.
  const productsQuery = useLiveQuery(() => db.products.toArray(), []);
  const products = productsQuery ?? EMPTY_PRODUCTS;
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

  // ── Cart ──
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('full');
  const [amountPaid, setAmountPaid] = useState('');       // partial-payment input
  const [orderDiscount, setOrderDiscount] = useState(''); // order-level discount amount
  const [discountReason, setDiscountReason] = useState(''); // why the discount was given
  const [showSummary, setShowSummary] = useState(false);   // invoice summary modal

  // ── UI state ──
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  // `created_at` of the invoice being resumed — sale rows written for it are
  // the ones carrying this exact `sold_at`, which is how completeOrder
  // swaps them instead of appending duplicates.
  const [editingCreatedAt, setEditingCreatedAt] = useState<string | null>(null);
  const [showCustomer, setShowCustomer] = useState(false);
  const [showCalc, setShowCalc] = useState(false);

  useEffect(() => {
    if (feedback) {
      const t = setTimeout(() => setFeedback(null), 2500);
      return () => clearTimeout(t);
    }
  }, [feedback]);

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

  // Order-level discount (applied on top of any per-line cut prices)
  const discountAmt = Math.max(0, Math.min(Number(orderDiscount) || 0, subtotal));
  const grandTotal = Math.max(0, subtotal - discountAmt);

  // Partial payment: how much the customer is paying right now.
  // For 'full' mode this is the full total; for 'credit' it's whatever they
  // hand over (can be 0). For 'partial' it's the explicit amount entered.
  const paidNow = paymentMode === 'full'
    ? grandTotal
    : paymentMode === 'credit'
      ? Math.max(0, Number(amountPaid) || 0)
      : Math.max(0, Math.min(Number(amountPaid) || 0, grandTotal));
  const owed = Math.max(0, Math.round((grandTotal - paidNow) * 100) / 100);

  // How many of each product are already in the order (tile badge).
  const cartQtyByProduct = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of cart) m[l.product.id] = (m[l.product.id] ?? 0) + l.qty;
    return m;
  }, [cart]);

  // ── Product selection ──
  function selectProduct(p: Product) {
    setSelectedProduct(p);
    const variants = getProductVariants(p);
    setSelectedVariant(variants[0] ?? null);
    setQty('1');
  }

  function addSelected() {
    if (!selectedProduct || !selectedVariant) return;
    const available = stockFor(selectedProduct);
    if (available <= 0) {
      setFeedback(`${selectedProduct.name} is out of stock.`);
      return;
    }
    let q = Math.max(1, Math.round(Number(qty) || 1));
    if (q > available) {
      q = available;
      setQty(String(q));
    }
    const original = Number(selectedVariant.price);
    let cp = cutPrice.trim() ? Number(cutPrice) : NaN;
    if (!isFinite(cp) || cp <= 0) cp = NaN;
    // A "discount" above the list price produces negative savings in the
    // receipt, so clamp it back to the original price.
    if (isFinite(cp) && cp >= original) cp = NaN;
    const cut = isFinite(cp) ? Math.round(cp * 100) / 100 : null;
    setCart((c) => [...c, { key: nextLineKey++, product: selectedProduct, variant: selectedVariant, qty: q, cutPrice: cut }]);
    const label = cut != null ? ` (cut price ${ghs(cut)})` : '';
    setFeedback(`Added ${selectedVariant.name} of ${selectedProduct.name}${label}`);
    setSelectedProduct(null);
    setSelectedVariant(null);
    setQty('1');
    setCutPrice('');
  }

  function setLineQty(key: number, q: number) {
    setCart((c) => c.map((l) => (l.key === key ? { ...l, qty: Math.max(1, q) } : l)));
  }

  // One tap from the tile: drop 1 of the default (retail) variant into the
  // order. The tile's own + button calls this repeatedly to add more.
  function quickAdd(p: Product) {
    const variant = getProductVariants(p)[0];
    if (!variant) return;
    const available = stockFor(p);
    const already = cart.reduce((s, l) => (l.product.id === p.id ? s + l.qty : s), 0);
    if (available <= 0) {
      setFeedback(`${p.name} is out of stock.`);
      return;
    }
    if (already >= available) {
      setFeedback(`Only ${available} × ${p.name} in stock.`);
      return;
    }
    setCart((c) => [...c, { key: nextLineKey++, product: p, variant, qty: 1, cutPrice: null }]);
    setFeedback(`Added 1 × ${p.name}`);
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
  const featureConfig = useMemo(
    () => loadFeatureConfig((profile?.role as 'owner' | 'manager' | 'staff') ?? 'staff', profile?.id),
    [profile?.role, profile?.id],
  );
  const showProfit = isOwnerOrManager && isFeatureEnabled(featureConfig, 'pos_profit_display');
  const showCalculator = isFeatureEnabled(featureConfig, 'posCalculator');

  // ── Complete sale ──
  async function completeOrder() {
    if (cart.length === 0 || !profile?.branch_id || confirming) return;
    setConfirming(true);
    try {
      const now = nowISO();
      const items = buildInvoiceItems();
      const paid = paidNow;
      const owedAmt = owed;
      const invoiceStatus = owedAmt <= 0 ? 'completed' : 'pending';

      // Write individual sale rows — use cut price if set
      let rows: QueuedSale[] = cart.map((l) => {
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

      // Resuming an invoice: its sale rows were already written the first
      // time it was completed. Swap them out — re-using their ids so a row
      // already pushed to the server stays a harmless duplicate-key no-op —
      // instead of appending a second copy that double-counts stock.
      const previous = editingInvoiceId && editingCreatedAt
        ? await db.sales
            .filter((s) => s.branch_id === profile.branch_id && s.sold_at === editingCreatedAt)
            .toArray()
        : [];
      if (previous.length > 0) {
        const idsByKey = new Map<string, string[]>();
        for (const p of previous) {
          const key = `${p.product_id}::${p.variant_id ?? ''}`;
          const list = idsByKey.get(key);
          if (list) list.push(p.id);
          else idsByKey.set(key, [p.id]);
        }
        rows = rows.map((r) => {
          const list = idsByKey.get(`${r.product_id}::${r.variant_id ?? ''}`);
          const reused = list?.shift();
          return reused ? { ...r, id: reused } : r;
        });
        await db.sales.bulkDelete(previous.map((p) => p.id));
      }

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
      if (discountAmt > 0) {
        const reason = discountReason.trim();
        notesParts.push(
          `Order discount: −${ghs(discountAmt)}${reason ? ` (${reason})` : ''}`,
        );
      }
      if (paymentMode === 'credit') {
        notesParts.push(`Credit sale — ${ghs(owedAmt)} owed by ${customerName.trim() || 'walk-in'}`);
      } else if (paymentMode === 'partial' && owedAmt > 0) {
        notesParts.push(`Partial payment — ${ghs(paid)} paid, ${ghs(owedAmt)} owed by ${customerName.trim() || 'walk-in'}`);
      }

      // Save invoice record (keep the original created_at when editing)
      const originalCreated =
        editingInvoiceId && invoices.find((i) => i.id === editingInvoiceId)?.created_at;
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
        amount_owed: owedAmt,
        status: invoiceStatus,
        notes: notesParts.join(' | '),
        created_at: originalCreated ?? now,
        updated_at: now,
        // Local write first (instant UI); sync.ts pushLedger() retries the
        // server upsert until confirmed — a dropped connection can no longer
        // strand an invoice as local-only.
        serverSynced: false,
      };

      await db.invoices.put(invoice);

      // Credit or partial → debtor. Resuming must settle or update the
      // EXISTING debtor for this invoice instead of creating a second one.
      const existingDebtor = editingInvoiceId
        ? await db.debtors.where('invoice_id').equals(editingInvoiceId).first()
        : undefined;
      if (owedAmt > 0) {
        const debtorStatus = paid > 0 ? 'partial' as const : 'pending' as const;
        const debtor = {
          id: existingDebtor?.id ?? crypto.randomUUID(),
          business_id: profile.business_id,
          branch_id: profile.branch_id,
          customer_name: customerName.trim() || 'Walk-in',
          customer_phone: customerPhone.trim() || null,
          invoice_id: invoice.id,
          original_amount: grandTotal,
          amount_paid: paid,
          amount_owed: owedAmt,
          status: debtorStatus,
          notes: `Invoice ${invoice.invoice_number} — ${paymentMode === 'credit' ? 'credit sale' : 'partial payment'}`,
          created_at: existingDebtor?.created_at ?? now,
          updated_at: now,
        };
        if (existingDebtor) {
          await db.debtors.update(existingDebtor.id, { ...debtor, id: existingDebtor.id, serverSynced: false });
        } else {
          await db.debtors.add({ ...debtor, serverSynced: false });
        }
      } else if (existingDebtor) {
        await db.debtors.update(existingDebtor.id, {
          amount_paid: grandTotal,
          amount_owed: 0,
          status: 'settled',
          updated_at: now,
          serverSynced: false,
        });
      }

      setFeedback(`Sale complete — ${ghs(grandTotal)}${owedAmt > 0 ? ` (${ghs(owedAmt)} owed)` : ''}`);
      resetForm();
      void pushQueuedSales().then(() => pushLedger());
    } catch (err) {
      // Without this finally, any thrown write left `confirming` true and
      // the CTA permanently stuck on "Recording…".
      setFeedback(`Could not record the sale — ${(err as Error).message}`);
    } finally {
      setConfirming(false);
    }
  }

  // ── Resume a pending invoice ──
  function resumeInvoice(inv: Invoice) {
    setEditingInvoiceId(inv.id);
    setEditingCreatedAt(inv.created_at);
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
    setAmountPaid('');
    setOrderDiscount('');
    setDiscountReason('');
    setShowCustomer(false);
    setSearch('');
    setSelectedProduct(null);
    setSelectedVariant(null);
    setQty('1');
    setCutPrice('');
    setEditingInvoiceId(null);
    setEditingCreatedAt(null);
  }

  // ── Pending invoices ──
  const pendingInvoices = useMemo(
    () => invoices.filter((i) => i.status === 'pending').sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [invoices]
  );

  return (
    <div className="flex flex-col lg:flex-row h-[100dvh] min-h-[100dvh] max-h-[100dvh] bg-gray-50 overflow-hidden">
      {/* ══════════════════════════════════════════════════════════════════════
          LEFT PANEL — Search + Products
          Mobile: collapses to ~60vh. Desktop: fixed 480px sidebar.
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col lg:w-[480px] xl:w-[520px] border-b lg:border-b-0 lg:border-r border-line bg-white overflow-hidden lg:max-h-none max-h-[60vh] min-h-0">
        {/* Header — simplified: just 2 nav buttons */}
        <header className="px-4 pt-4 pb-3 border-b border-line safe-top">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Sell</h1>
              {profile?.branch_id && (
                <p className="text-xs text-gray-500">{profile.name}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <SyncIndicator compact />
              {showCalculator && (
                <button
                  type="button"
                  onClick={() => setShowCalc(true)}
                  aria-label="Open calculator"
                  className="grid h-10 w-10 place-items-center rounded-xl border border-gray-200 bg-white text-gray-700 active:scale-95"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="2" width="16" height="20" rx="2" />
                    <path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h4" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          {feedback && (
            <div
              role="status"
              aria-live="polite"
              className="bg-green-50 text-green-800 rounded-xl px-4 py-3 text-sm mb-3 font-medium"
            >
              {feedback}
            </div>
          )}

          {/* Search — bigger touch target */}
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name (optional)…"
              aria-label="Search products"
              className="w-full border border-gray-200 rounded-xl pl-4 pr-12 py-4 text-base bg-gray-50 focus:outline-none focus:border-gray-900 focus:bg-white"
              inputMode="search"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Clear search"
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
                <div className="flex items-center gap-3">
                  {selectedProduct.image && (
                    <img
                      src={productImageSrc(selectedProduct.image)}
                      alt=""
                      className="h-12 w-12 rounded-xl object-cover border border-gray-200"
                    />
                  )}
                  <div>
                    <p className="font-semibold text-base">{selectedProduct.name}</p>
                    <p className="text-sm text-gray-500">{stockFor(selectedProduct)} left</p>
                  </div>
                </div>
                <button
                  onClick={() => { setSelectedProduct(null); setSelectedVariant(null); }}
                  aria-label="Close product"
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
                        ? 'bg-ghana-green text-white'
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
                  aria-label="Decrease quantity"
                  className="h-12 w-12 rounded-xl bg-gray-200 text-gray-700 text-xl font-medium flex items-center justify-center"
                >
                  −
                </button>
                <input
                  type="number" min="1" inputMode="numeric" value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  aria-label="Quantity"
                  className="flex-1 text-center text-xl font-semibold border border-gray-200 rounded-xl py-2.5 bg-white focus:outline-none focus:border-gray-900"
                />
                <button
                  onClick={() => setQty(String((Number(qty) || 1) + 1))}
                  aria-label="Increase quantity"
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
                        if (!e.target.checked) setCutPrice('');
                        else setCutPrice(selectedVariant ? String(selectedVariant.price) : '');
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
                      <span className="text-xs text-green-600 font-medium">
                        You save: {ghs(Math.max(Number(selectedVariant?.price) - Number(cutPrice), 0))}
                      </span>
                    </div>
                    <input
                      type="number"
                      min="0.01"
                      max={selectedVariant ? Number(selectedVariant.price) : undefined}
                      step="0.01"
                      inputMode="decimal"
                      value={cutPrice}
                      onChange={(e) => setCutPrice(e.target.value)}
                      placeholder="New unit price"
                      aria-label="Cut unit price"
                      className="w-full border-2 border-green-400 rounded-xl px-4 py-3 text-base bg-green-50 focus:outline-none focus:border-green-600 font-semibold text-green-800"
                    />
                    {Number(cutPrice) >= Number(selectedVariant?.price) && (
                      <p className="text-xs text-amber-700">
                        A cut price must be lower than {ghs(Number(selectedVariant?.price))} — it will be ignored.
                      </p>
                    )}
                  </>
                )}
              </div>

              <button
                onClick={addSelected}
                disabled={!selectedVariant || stockFor(selectedProduct) <= 0}
                className="h-12 px-6 rounded-xl bg-ghana-green text-white text-base font-semibold disabled:opacity-40 mt-3 w-full hover:bg-[#007A4A]"
              >
                {stockFor(selectedProduct) <= 0 ? 'Out of stock' : 'Add to order'}
              </button>
            </div>
          )}

          {/* Product grid — ALL items visible, photo tiles, tap + to sell.
              Columns adapt to the phone: 2 up on small screens, 3 from
              mid-width, 4 on wide panels. */}
          {productsQuery === undefined ? (
            <div className="grid grid-cols-2 min-[430px]:grid-cols-3 xl:grid-cols-4 gap-2.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-gray-200 bg-white overflow-hidden animate-pulse">
                  <div className="w-full aspect-square bg-gray-100" />
                  <div className="px-3 py-2.5 space-y-2">
                    <div className="h-3 w-3/4 rounded bg-gray-100" />
                    <div className="h-3 w-1/2 rounded bg-gray-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-10">
              {products.length === 0
                ? 'No products loaded. Connect online once to sync.'
                : `No match for "${search}"`}
            </p>
          ) : (
            <div className="grid grid-cols-2 min-[430px]:grid-cols-3 xl:grid-cols-4 gap-2.5">
              {[...filtered].sort((a, b) => a.name.localeCompare(b.name)).map((p) => {
                const active = selectedProduct?.id === p.id;
                const variants = getProductVariants(p);
                const base = variants[0];
                const stock = stockFor(p);
                const soldOut = stock === 0;
                const inCart = cartQtyByProduct[p.id] ?? 0;
                const canAdd = !soldOut && inCart < stock;
                return (
                  <div key={p.id} className="relative">
                    <button
                      onClick={() => selectProduct(p)}
                      aria-label={`${p.name}, ${ghs(Number(base?.price))}, ${soldOut ? 'out of stock' : `${stock} left`}. Tap for options.`}
                      className={`w-full bg-white border-2 rounded-2xl text-left transition-all overflow-hidden ${
                        active
                          ? 'border-gray-900 shadow-md ring-2 ring-gray-900/10'
                          : soldOut
                            ? 'border-gray-200 opacity-55'
                            : 'border-gray-200 hover:border-gray-400 hover:shadow-sm'
                      }`}
                    >
                      {/* Product photo — the main way to recognise an item */}
                      <div className="w-full aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
                        {p.image ? (
                          <img
                            src={productImageSrc(p.image)}
                            alt={p.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span className="text-5xl opacity-40">📦</span>
                        )}
                      </div>
                      {/* Product info below photo (right side kept clear for +) */}
                      <div className="px-3 py-2.5 pr-12">
                        <p className="font-semibold text-sm leading-tight line-clamp-2">{p.name}</p>
                        <p className="text-sm text-gray-900 tabular-nums mt-0.5 font-bold">
                          {ghs(Number(base?.price))}<span className="text-gray-400 font-normal text-xs">/{base?.name}</span>
                        </p>
                        <p className={`text-xs mt-1 ${stock === 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                          {stock === 0 ? 'Out of stock' : `${stock} left`}
                        </p>
                      </div>
                    </button>

                    {/* In-order badge */}
                    {inCart > 0 && (
                      <span className="absolute top-2 right-2 grid h-7 min-w-[28px] place-items-center rounded-full bg-gray-900 px-1.5 text-xs font-bold text-white shadow">
                        {inCart}
                      </span>
                    )}

                    {/* One-tap add — hit again to add more */}
                    <button
                      onClick={() => quickAdd(p)}
                      disabled={!canAdd}
                      aria-label={`Add ${p.name} to order`}
                      className="absolute bottom-3 right-2.5 grid h-11 w-11 place-items-center rounded-full bg-ghana-green text-white text-2xl font-bold leading-none shadow-md transition-transform active:scale-90 disabled:opacity-30 disabled:active:scale-100"
                    >
                      +
                    </button>
                  </div>
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
        <div className="shrink-0 px-5 pt-4 pb-3 bg-white border-b border-gray-200 safe-top">
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

        {/* Customer details — always visible so it is never a hidden extra */}
        {!showCustomer && (
          <button
            onClick={() => setShowCustomer(true)}
            className="shrink-0 px-5 py-3 bg-white border-b border-gray-100 text-left text-sm text-gray-600 hover:text-gray-900 min-h-[48px] font-medium"
          >
            + Add customer (name or phone)
          </button>
        )}
        {showCustomer && (
          <div className="shrink-0 px-5 py-3 bg-white border-b border-gray-100">
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
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Phone (optional)"
                inputMode="tel"
                autoComplete="tel"
                aria-label="Customer phone number"
                className="border border-gray-200 rounded-xl px-3 py-3 text-sm bg-gray-50 focus:outline-none focus:border-gray-900 focus:bg-white"
              />
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Name (optional)"
                autoComplete="name"
                aria-label="Customer name"
                className="border border-gray-200 rounded-xl px-3 py-3 text-sm bg-gray-50 focus:outline-none focus:border-gray-900 focus:bg-white"
              />
            </div>
            <p className="mt-1.5 text-[11px] text-gray-400">
              Saved on the sale so the owner can reach the customer about credit.
            </p>
          </div>
        )}

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <p className="text-5xl mb-4">🛒</p>
              <p className="text-base font-medium">No items yet</p>
              <p className="text-sm mt-1">Tap the + on an item to sell it</p>
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
                      aria-label={`Decrease quantity of ${l.product.name}`}
                      className="h-9 w-9 rounded-lg bg-gray-100 text-gray-600 text-base flex items-center justify-center"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm font-medium tabular-nums">{l.qty}</span>
                    <button
                      onClick={() => setLineQty(l.key, l.qty + 1)}
                      aria-label={`Increase quantity of ${l.product.name}`}
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
                    aria-label={`Remove ${l.product.name} from order`}
                    className="text-gray-300 hover:text-red-600 text-lg leading-none ml-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totals & actions — simplified. pr-24 keeps every control clear of the
            assistive-touch circle, which parks in the bottom-right by default. */}
        <div className="shrink-0 bg-white border-t border-gray-200 pl-5 pr-24 py-4 space-y-3 safe-bottom">
          {/* Invoice summary icon — opens the full breakdown before placing */}
          <button
            type="button"
            onClick={() => setShowSummary(true)}
            disabled={cart.length === 0}
            className="w-full flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 hover:border-gray-900 hover:bg-white transition-colors disabled:opacity-40 min-h-[48px]"
          >
            <span className="flex items-center gap-2">
              <span className="relative">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <path d="M16 10a4 4 0 01-8 0" />
                </svg>
                {cart.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-ghana-green px-1 text-[10px] font-bold text-white">
                    {cart.length}
                  </span>
                )}
              </span>
              Invoice summary
            </span>
            <span className="text-xs text-gray-500">
              {cart.length} item{cart.length !== 1 ? 's' : ''} · {ghs(grandTotal)}
            </span>
          </button>

          {/* Payment mode — Cash, Partial, or Credit */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setPaymentMode('full')}
              className={`py-3 rounded-xl text-sm font-medium transition-colors min-h-[48px] ${
                paymentMode === 'full'
                  ? 'bg-ghana-green text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              💵 Cash
            </button>
            <button
              onClick={() => setPaymentMode('partial')}
              className={`py-3 rounded-xl text-sm font-medium transition-colors min-h-[48px] ${
                paymentMode === 'partial'
                  ? 'bg-ghana-green text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              💰 Partial
            </button>
            <button
              onClick={() => setPaymentMode('credit')}
              className={`py-3 rounded-xl text-sm font-medium transition-colors min-h-[48px] ${
                paymentMode === 'credit'
                  ? 'bg-ghana-green text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              📝 Credit
            </button>
          </div>

          {/* Partial payment — enter amount paid now */}
          {paymentMode === 'partial' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 space-y-2">
              <p className="text-sm font-medium text-blue-800">
                💰 Partial payment — customer pays part now, rest later
              </p>
              <div className="flex items-center gap-2">
                <label className="text-xs text-blue-700 shrink-0">Amount paid now</label>
                <input
                  type="number"
                  min="0"
                  max={grandTotal}
                  step="0.01"
                  inputMode="decimal"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 border border-blue-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-600 tabular-nums"
                />
              </div>
              {Number(amountPaid) > 0 && (
                <p className="text-xs text-blue-600">
                  Customer pays {ghs(paidNow)} now · owes <strong>{ghs(owed)}</strong>
                </p>
              )}
              {!customerName.trim() && (
                <p className="text-xs text-amber-600">⚠ Add customer name so we know who owes</p>
              )}
            </div>
          )}

          {/* Credit — customer pays nothing now */}
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

          {/* Order-level discount */}
          {discountAmt > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-green-800">🏷️ Order discount</p>
                <button
                  type="button"
                  onClick={() => { setOrderDiscount(''); setDiscountReason(''); }}
                  className="text-xs text-green-600 hover:text-green-800 underline"
                >
                  Remove
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-green-700 shrink-0">Amount off</span>
                <input
                  type="number"
                  min="0"
                  max={subtotal}
                  step="0.01"
                  inputMode="decimal"
                  value={orderDiscount}
                  onChange={(e) => setOrderDiscount(e.target.value)}
                  className="flex-1 border border-green-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-green-600 tabular-nums"
                />
              </div>
              <input
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                placeholder="Reason (e.g. loyalty discount, damaged packaging)"
                className="w-full border border-green-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-green-600"
              />
              <p className="text-xs text-green-600">
                Subtotal {ghs(subtotal)} → Total <strong>{ghs(grandTotal)}</strong> (−{ghs(discountAmt)})
              </p>
            </div>
          )}

          {/* Add discount button — only when no discount yet */}
          {discountAmt <= 0 && cart.length > 0 && (
            <button
              type="button"
              onClick={() => setOrderDiscount(String(grandTotal > 0 ? Math.min(1, grandTotal) : 0))}
              className="w-full flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-2.5 text-sm text-gray-500 hover:border-gray-900 hover:text-gray-700 transition-colors min-h-[40px]"
            >
              🏷️ Add order discount
            </button>
          )}

          {/* Savings display — when discounts are applied */}
          {totalSavings > 0 && (
            <div className="flex justify-between text-sm bg-green-50 border border-green-200 rounded-xl px-3 py-2">
              <span className="text-green-700">🎉 Customer saves</span>
              <span className="font-bold tabular-nums text-green-700">{ghs(totalSavings + discountAmt)}</span>
            </div>
          )}

          {/* Subtotal / discount / total breakdown */}
          {discountAmt > 0 && (
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span>
              <span className="tabular-nums line-through">{ghs(subtotal)}</span>
            </div>
          )}
          {/* Total — big and clear */}
          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            <span className="font-semibold text-gray-900 text-base">Total</span>
            <span className="text-3xl font-bold tabular-nums text-gray-900">{ghs(grandTotal)}</span>
          </div>

          {/* Profit — owner/manager only, when enabled in Feature Settings */}
          {showProfit && cart.length > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Profit</span>
              <span className={`tabular-nums font-medium ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{ghs(totalProfit)}</span>
            </div>
          )}

          {/* Action button — single big button */}
          <button
            onClick={completeOrder}
            disabled={confirming || cart.length === 0}
            className="w-full py-4 rounded-xl bg-ghana-green text-white text-base font-semibold hover:bg-[#007A4A] disabled:opacity-50 min-h-[56px]"
          >
            {confirming
              ? 'Recording…'
              : paymentMode === 'full'
                ? '✓ Complete sale'
                : paymentMode === 'partial'
                  ? `💰 Save partial — ${ghs(paidNow)} paid, ${ghs(owed)} owed`
                  : `📝 Save credit — ${ghs(grandTotal)} owed`}
          </button>
        </div>

        {/* Pending invoices — only show if any exist */}
        {pendingInvoices.length > 0 && (
          <div className="shrink-0 bg-white border-t border-gray-200 pl-5 pr-24 py-3 max-h-[160px] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Pending invoices ({pendingInvoices.length})
              </p>
              <Link to="/invoices" className="text-xs font-medium text-gray-600 hover:text-gray-900">
                View all
              </Link>
            </div>
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

      {/* Calculator overlay — quick maths without leaving the till */}
      {showCalc && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Calculator">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCalc(false)} aria-hidden />
          <div className="relative w-full max-w-sm rounded-3xl bg-white p-4 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">Calculator</p>
              <button
                type="button"
                onClick={() => setShowCalc(false)}
                aria-label="Close calculator"
                className="grid h-9 w-9 place-items-center rounded-lg text-gray-400 hover:text-gray-700"
              >
                ×
              </button>
            </div>
            <Calculator />
          </div>
        </div>
      )}

      {/* Invoice summary modal — full breakdown before placing the order */}
      {showSummary && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Invoice summary">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowSummary(false)} aria-hidden />
          <div className="relative w-full sm:max-w-md max-h-[90dvh] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="shrink-0 px-5 pt-5 pb-3 border-b border-gray-100">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-bold text-gray-900">Invoice Summary</h2>
                <button
                  type="button"
                  onClick={() => setShowSummary(false)}
                  aria-label="Close summary"
                  className="grid h-9 w-9 place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                >
                  ×
                </button>
              </div>
              <p className="text-xs text-gray-500">
                {editingInvoiceId ? 'Editing existing invoice' : 'Review before placing the order'}
              </p>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
              {/* Customer */}
              {(customerName || customerPhone) && (
                <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-gray-900 text-white text-sm font-bold">
                    {(customerName || '?').slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{customerName || 'Walk-in'}</p>
                    {customerPhone && <p className="text-xs text-gray-500">{customerPhone}</p>}
                  </div>
                </div>
              )}

              {/* Line items */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Items ({cart.length})
                </p>
                {cart.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">No items in this order</p>
                ) : (
                  <div className="space-y-2">
                    {cart.map((l, idx) => {
                      const unitPrice = l.cutPrice != null ? l.cutPrice : Number(l.variant.price);
                      const lineTotal = l.qty * unitPrice;
                      return (
                        <div key={l.key} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                          <span className="text-xs text-gray-400 w-5 text-center mt-0.5 tabular-nums">{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{l.product.name}</p>
                            <p className="text-xs text-gray-500">
                              {l.qty} × {ghs(unitPrice)} <span className="text-gray-400">/ {l.variant.name}</span>
                            </p>
                            {l.cutPrice != null && (
                              <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                                CUT · was {ghs(Number(l.variant.price))}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-semibold tabular-nums text-gray-900 shrink-0">
                            {ghs(lineTotal)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Totals */}
              <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="tabular-nums text-gray-900">{ghs(subtotal)}</span>
                </div>
                {discountAmt > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-green-700">Order discount{discountReason ? ` (${discountReason})` : ''}</span>
                    <span className="tabular-nums text-green-700 font-medium">−{ghs(discountAmt)}</span>
                  </div>
                )}
                {totalSavings > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-green-700">Item savings</span>
                    <span className="tabular-nums text-green-700 font-medium">−{ghs(totalSavings)}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-2 border-t border-gray-200">
                  <span className="font-semibold text-gray-900">Total</span>
                  <span className="text-2xl font-bold tabular-nums text-gray-900">{ghs(grandTotal)}</span>
                </div>
              </div>

              {/* Payment preview */}
              <div className={`rounded-xl px-4 py-3 text-sm ${
                paymentMode === 'full' ? 'bg-green-50 text-green-800'
                : paymentMode === 'partial' ? 'bg-blue-50 text-blue-800'
                : 'bg-amber-50 text-amber-800'
              }`}>
                <p className="font-medium">
                  {paymentMode === 'full' ? '💵 Paying in full'
                  : paymentMode === 'partial' ? '💰 Partial payment'
                  : '📝 Buy on credit'}
                </p>
                {paymentMode !== 'full' && (
                  <p className="text-xs mt-1">
                    {paymentMode === 'partial'
                      ? `Paying ${ghs(paidNow)} now · owing ${ghs(owed)}`
                      : `Owing ${ghs(grandTotal)} — no payment now`}
                  </p>
                )}
                {paymentMode !== 'full' && !customerName.trim() && (
                  <p className="text-xs mt-1 text-amber-600 font-medium">⚠ Add customer name to track the debt</p>
                )}
              </div>
            </div>

            {/* Footer actions */}
            <div className="shrink-0 px-5 py-4 border-t border-gray-100 safe-bottom space-y-2">
              <button
                onClick={() => { setShowSummary(false); completeOrder(); }}
                disabled={confirming || cart.length === 0}
                className="w-full py-4 rounded-xl bg-ghana-green text-white text-base font-semibold hover:bg-[#007A4A] disabled:opacity-50 min-h-[56px]"
              >
                {confirming
                  ? 'Recording…'
                  : paymentMode === 'full'
                    ? `✓ Place order — ${ghs(grandTotal)}`
                    : paymentMode === 'partial'
                      ? `✓ Place order — ${ghs(paidNow)} paid, ${ghs(owed)} owed`
                      : `✓ Place order — ${ghs(grandTotal)} on credit`}
              </button>
              <button
                onClick={() => setShowSummary(false)}
                className="w-full py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 min-h-[44px]"
              >
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
