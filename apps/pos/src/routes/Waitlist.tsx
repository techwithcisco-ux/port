import { useEffect, useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import SyncIndicator from '../components/SyncIndicator';

function ghs(n: number): string {
  return `GHS ${n.toFixed(2)}`;
}

// Public shop origin that serves /w/:token links. In production this is
// the branchport-shop static site; locally the shop dev server on :5176.
const SHOP_BASE = ((import.meta.env.VITE_SHOP_URL as string | undefined) || '').replace(/\/$/, '')
  || 'http://localhost:5176';

interface Invite {
  id: string;
  branch_id: string;
  branch_name: string;
  customer_phone: string;
  token: string;
  status: string;
  expires_at: string;
  created_at: string;
  order_count: number;
}

interface OrderItem {
  name: string;
  unit: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

interface CustomerOrder {
  id: string;
  branch_name: string;
  customer_phone: string;
  customer_name: string | null;
  items: OrderItem[];
  total: number;
  status: string;
  created_at: string;
}

async function authed(path: string, init?: RequestInit) {
  const token = localStorage.getItem('branchport-pos-token');
  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('Session expired — sign in again.');
  if (res.status !== 200) throw new Error((body as { error?: string }).error || `Request failed (${res.status}).`);
  return body as Record<string, unknown>;
}

function waNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('0') ? `233${digits.slice(1)}` : digits;
}

const apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
  || 'http://localhost:8080';

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  pending:   { bg: 'bg-amber-100',  text: 'text-amber-700' },
  ordered:   { bg: 'bg-blue-100',   text: 'text-blue-700' },
  confirmed: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  fulfilled: { bg: 'bg-gray-200',   text: 'text-gray-700' },
  cancelled: { bg: 'bg-red-100',    text: 'text-red-600' },
};

export default function Waitlist() {
  const { profile } = useAuth();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ phone: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'orders' | 'links'>('orders');

  async function refresh() {
    try {
      const [inv, ord] = await Promise.all([
        authed('/api/waitlist/invites'),
        authed('/api/waitlist/orders'),
      ]);
      setInvites(((inv as { data: Invite[] }).data) ?? []);
      setOrders(((ord as { data: CustomerOrder[] }).data) ?? []);
    } catch {
      // Lists fail silently on first paint; actions surface their own errors.
    }
  }

  useEffect(() => { refresh(); }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const cleanPhone = phone.trim().replace(/\s+/g, '').replace(/[^+\d]/g, '');
    if (!cleanPhone) return;
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const body = await authed('/api/waitlist/invites', {
        method: 'POST',
        body: JSON.stringify({ customer_phone: cleanPhone }),
      });
      const invite = (body as { invite: Invite }).invite;
      const url = `${SHOP_BASE}/w/${invite.token}`;
      setCreated({ phone: cleanPhone, url });
      setPhone('');
      refresh();
      // Open WhatsApp to the customer with the shop link ready to send.
      const msg = [
        `Hello! Order from our shop here:`,
        url,
        '',
        'Pick your items and quantities — your total shows before you send the order.',
      ].join('\n');
      window.open(`https://wa.me/${waNumber(cleanPhone)}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!window.confirm('Revoke this link? Customers with it will be locked out.')) return;
    await authed('/api/waitlist/invites/revoke', { method: 'POST', body: JSON.stringify({ id }) });
    refresh();
  }

  async function handleOrderStatus(id: string, status: string) {
    await authed('/api/waitlist/orders', { method: 'PATCH', body: JSON.stringify({ id, status }) });
    refresh();
  }

  function copyLink() {
    if (!created) return;
    navigator.clipboard.writeText(created.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => { /* clipboard blocked */ });
  }

  const pendingOrders = orders.filter((o) => o.status === 'pending');
  const statusStyle = (s: string) => STATUS_STYLES[s] ?? STATUS_STYLES.pending;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Waitlist</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {pendingOrders.length > 0
                ? `${pendingOrders.length} order${pendingOrders.length !== 1 ? 's' : ''} waiting`
                : 'Send shop links · track customer orders'}
            </p>
          </div>
          <SyncIndicator compact />
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5">
          <button
            onClick={() => setTab('orders')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === 'orders' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Orders
            {pendingOrders.length > 0 && (
              <span className="ml-1.5 inline-grid h-4 min-w-[16px] place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                {pendingOrders.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('links')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === 'links' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Sent links ({invites.length})
          </button>
        </div>
      </header>

      <div className="flex-1 px-4 py-4 space-y-4">
        {/* ── Create invite form ── */}
        <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-900">＋ New waitlist link</p>
          <p className="text-xs text-gray-500">
            Customer gets a personal shop link — they see live stock, pick quantities, and the order comes to you.
          </p>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Customer phone number</label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 054 123 4567"
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-3 text-sm bg-gray-50 focus:outline-none focus:border-gray-900 focus:bg-white"
            />
          </div>
          {error && <p className="text-sm text-red-700 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
          <button type="submit" disabled={busy} className="w-full py-3 rounded-xl bg-ghana-green text-white text-sm font-semibold hover:bg-[#007A4A] disabled:opacity-50">
            {busy ? 'Creating link…' : 'Create + send via WhatsApp'}
          </button>
          {created && (
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-[11px] text-gray-500 mb-1">Link for {created.phone}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate text-xs font-mono text-gray-700 select-all">{created.url}</code>
                <button type="button" onClick={copyLink} className="text-xs font-medium text-gray-500 hover:text-gray-900 underline shrink-0">
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </form>

        {/* ── Orders tab ── */}
        {tab === 'orders' && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <p className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">
              Customer orders ({orders.length})
            </p>
            {orders.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <p className="text-3xl mb-2">📋</p>
                <p className="text-sm">No orders yet — they appear here the moment a customer submits.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {orders.map((o) => {
                  const st = statusStyle(o.status);
                  return (
                    <li key={o.id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-900">
                          {o.customer_name || o.customer_phone}
                        </p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${st.bg} ${st.text}`}>
                          {o.status}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {new Date(o.created_at).toLocaleString()}
                      </p>
                      <ul className="mt-2 rounded-xl bg-gray-50 px-3 py-2 space-y-1">
                        {(Array.isArray(o.items) ? o.items : []).map((l, i) => (
                          <li key={i} className="flex justify-between gap-2 text-xs text-gray-700">
                            <span className="truncate">{l.qty} × {l.name}</span>
                            <span className="shrink-0 font-semibold tabular-nums">{ghs(Number(l.line_total))}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-sm font-bold tabular-nums">{ghs(Number(o.total))}</p>
                        {o.status === 'pending' && (
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOrderStatus(o.id, 'confirmed')}
                              className="rounded-lg bg-gray-900 px-3 py-1.5 text-[11px] font-semibold text-white"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOrderStatus(o.id, 'cancelled')}
                              className="rounded-lg bg-gray-100 px-3 py-1.5 text-[11px] font-semibold text-gray-600"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                        {o.status === 'confirmed' && (
                          <button
                            type="button"
                            onClick={() => handleOrderStatus(o.id, 'fulfilled')}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white"
                          >
                            Fulfill
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* ── Links tab ── */}
        {tab === 'links' && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <p className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">
              Sent links ({invites.length})
            </p>
            {invites.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <p className="text-3xl mb-2">🔗</p>
                <p className="text-sm">No links yet — create one above.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {invites.map((inv) => {
                  const st = statusStyle(inv.status);
                  return (
                    <li key={inv.id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-900">{inv.customer_phone}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${st.bg} ${st.text}`}>
                          {inv.status}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {inv.order_count} order{inv.order_count === 1 ? '' : 's'} · expires {new Date(inv.expires_at).toLocaleDateString()}
                      </p>
                      {(inv.status === 'pending' || inv.status === 'ordered') && (
                        <button
                          type="button"
                          onClick={() => handleRevoke(inv.id)}
                          className="mt-1.5 text-xs font-medium text-red-500 hover:text-red-700"
                        >
                          Revoke link
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
