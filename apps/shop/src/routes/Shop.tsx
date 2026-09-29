import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  fetchCatalog, submitOrder, orderWhatsAppText, waLink, ghs,
  type ShopCatalog, type PlacedOrder,
} from '../lib/shop';

export default function Shop() {
  const { token = '' } = useParams();
  const [catalog, setCatalog] = useState<ShopCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState('');
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ order: PlacedOrder; contact: { name: string; phone: string | null } } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCatalog(token)
      .then((c) => { if (!cancelled) { setCatalog(c); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setLoadError((e as Error).message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [token]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = catalog?.items ?? [];
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [catalog, search]);

  const lines = useMemo(() => {
    if (!catalog) return [];
    return catalog.items
      .filter((i) => (qty[i.product_id] || 0) > 0)
      .map((i) => ({ ...i, qty: qty[i.product_id] || 0 }));
  }, [catalog, qty]);
  const total = useMemo(
    () => Math.round(lines.reduce((s, l) => s + l.qty * l.unit_price, 0) * 100) / 100,
    [lines],
  );

  function bump(id: string, max: number, d: number) {
    setOrderError(null);
    setQty((prev) => {
      const next = Math.min(Math.floor(max), Math.max(0, (prev[id] || 0) + d));
      if (next === 0) {
        const { [id]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: next };
    });
  }

  async function placeOrder() {
    if (!catalog || lines.length === 0 || placing) return;
    setPlacing(true);
    setOrderError(null);
    try {
      const res = await submitOrder(
        token,
        lines.map((l) => ({ product_id: l.product_id, qty: l.qty })),
        customerName.trim(),
      );
      setPlaced(res);
      setQty({});
      // Open WhatsApp straight away (still inside the tap gesture chain);
      // the button below stays as a fallback if a blocker stops it.
      const link = waLink(
        res.contact.phone,
        orderWhatsAppText(catalog.business_name, catalog.branch_name, res.order, customerName.trim()),
      );
      if (link) window.open(link, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setOrderError((e as Error).message);
      // Availability may have shifted — refresh the catalog so counts are true.
      try { setCatalog(await fetchCatalog(token)); } catch { /* keep stale */ }
    } finally {
      setPlacing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 rounded-full border-[3px] border-gray-200 border-t-gray-900 animate-spin" />
          <p className="text-sm text-gray-500">Loading shop…</p>
        </div>
      </div>
    );
  }

  if (loadError || !catalog) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-3xl border border-gray-200/80 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gray-900">
            <span className="text-xl font-black leading-none text-amber-300">★</span>
          </div>
          <h1 className="text-lg font-bold tracking-tight text-gray-900">Link not working</h1>
          <p className="mt-1 text-sm text-gray-500">{loadError ?? 'Could not load this shop.'}</p>
        </div>
      </div>
    );
  }

  // ── Success: show the confirmed order + WhatsApp forward ──
  if (placed) {
    const text = orderWhatsAppText(catalog.business_name, catalog.branch_name, placed.order, customerName.trim());
    const link = waLink(placed.contact.phone, text);
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10">
        <div className="mx-auto w-full max-w-md">
          <div className="rounded-3xl border border-gray-200/80 bg-white p-6 shadow-sm sm:p-8">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-500">
              <span className="text-2xl font-bold text-white">✓</span>
            </div>
            <h1 className="text-center text-xl font-bold tracking-tight text-gray-900">Order received</h1>
            <p className="mt-1 text-center text-sm text-gray-500">
              Ref <span className="font-mono font-semibold text-gray-900">{placed.order.ref}</span> · {catalog.business_name} ({catalog.branch_name})
            </p>
            <ul className="mt-5 divide-y divide-gray-100 rounded-2xl bg-gray-50 px-4">
              {placed.order.items.map((l) => (
                <li key={l.product_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate text-gray-700">{l.qty} × {l.name}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-gray-900">{ghs(l.line_total)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between rounded-2xl bg-gray-900 px-4 py-3.5">
              <span className="text-sm font-medium text-gray-300">Total to pay</span>
              <span className="text-lg font-bold tabular-nums text-white">{ghs(placed.order.total)}</span>
            </div>
            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 py-4 text-base font-bold text-white active:scale-[0.99]"
              >
                Send order via WhatsApp
              </a>
            ) : (
              <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
                The shop will confirm on {placed.order.customer_phone}. Show ref {placed.order.ref} when you pay.
              </p>
            )}
            <button
              type="button"
              onClick={() => setPlaced(null)}
              className="mt-3 w-full py-2 text-center text-sm font-medium text-gray-500 hover:text-gray-900"
            >
              Order more from this shop
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Shop ──
  return (
    <div className="min-h-screen bg-gray-50 pb-40">
      <header className="sticky top-0 z-20 border-b border-gray-200/70 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-md px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-900">
              <span className="text-base font-black leading-none text-amber-300">★</span>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-bold leading-tight tracking-tight text-gray-900">{catalog.business_name}</h1>
              <p className="truncate text-xs text-gray-500">{catalog.branch_name} · order from your phone</p>
            </div>
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items…"
            className="input mt-3 w-full"
          />
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-2.5 px-4 pt-4">
        {visible.length === 0 && (
          <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-gray-500">
            {catalog.items.length === 0 ? 'No items in this shop yet — check back soon.' : 'No items match your search.'}
          </p>
        )}
        {visible.map((item) => {
          const q = qty[item.product_id] || 0;
          const max = Math.floor(item.available);
          const soldOut = max <= 0;
          return (
            <div key={item.product_id} className={`card flex items-center gap-3 p-3.5 ${soldOut ? 'opacity-60' : ''}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-gray-900">{item.name}</p>
                <p className="mt-0.5 text-sm tabular-nums text-gray-500">
                  {ghs(item.unit_price)} <span className="text-gray-400">/ {item.unit}</span>
                </p>
                <p className={`mt-0.5 text-xs font-medium ${soldOut ? 'text-red-500' : max <= 5 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {soldOut ? 'Sold out' : `${item.available} ${item.unit} left`}
                </p>
              </div>
              {soldOut ? (
                <span className="shrink-0 rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-400">—</span>
              ) : (
                <div className="flex shrink-0 items-center gap-1 rounded-2xl bg-gray-100 p-1">
                  <button
                    type="button"
                    aria-label={`Remove one ${item.name}`}
                    onClick={() => bump(item.product_id, max, -1)}
                    className="grid h-10 w-10 place-items-center rounded-xl bg-white text-lg font-bold text-gray-700 shadow-sm active:scale-95"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-base font-bold tabular-nums text-gray-900">{q}</span>
                  <button
                    type="button"
                    aria-label={`Add one ${item.name}`}
                    onClick={() => bump(item.product_id, max, 1)}
                    className="grid h-10 w-10 place-items-center rounded-xl bg-gray-900 text-lg font-bold text-white shadow-sm active:scale-95"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {lines.length > 0 && (
          <div className="card space-y-3 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Your order</p>
            <div>
              <label htmlFor="shop-name" className="label">Your name (for the shop)</label>
              <input
                id="shop-name"
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Ama Serwaa"
                autoComplete="name"
                className="input w-full"
              />
            </div>
            {orderError && (
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm leading-snug text-red-800">
                {orderError}
              </div>
            )}
            <button
              type="button"
              onClick={placeOrder}
              disabled={placing}
              className="btn btn-primary w-full !py-3.5 text-[15px] font-semibold"
            >
              {placing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Placing order…
                </span>
              ) : (
                `Place order · ${ghs(total)}`
              )}
            </button>
          </div>
        )}
      </main>

      {/* Sticky cart total */}
      {lines.length > 0 && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-md items-center justify-between">
            <p className="text-sm text-gray-500">
              {lines.reduce((s, l) => s + l.qty, 0)} items
            </p>
            <p className="text-lg font-bold tabular-nums text-gray-900">{ghs(total)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
