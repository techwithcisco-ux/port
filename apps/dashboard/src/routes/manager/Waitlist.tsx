import { useEffect, useState, FormEvent } from 'react';
import BackButton from '../../components/BackButton';
import DashboardLayout from '../../components/DashboardLayout';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import type { Branch } from '@branchport/shared';

// Public shop origin that serves /w/:token links. In production this is
// the branchport-shop static site (render.yaml); locally the shop dev
// server on :5176.
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
  const token = api.auth.getToken();
  const res = await fetch(`${api.baseUrl}${path}`, {
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

export default function Waitlist() {
  const { profile } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [branchId, setBranchId] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ phone: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const isStaff = profile?.role === 'staff';

  async function refresh() {
    try {
      const [b, inv, ord] = await Promise.all([
        api.from('branches').select('*'),
        authed('/api/waitlist/invites'),
        authed('/api/waitlist/orders'),
      ]);
      setBranches(((b as { data: Branch[] }).data) ?? []);
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
        body: JSON.stringify({
          customer_phone: cleanPhone,
          ...(isStaff ? {} : branchId ? { branch_id: branchId } : {}),
        }),
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

  const statusColor = (s: string) =>
    s === 'pending' ? 'bg-amber-100 text-amber-700'
    : s === 'ordered' ? 'bg-blue-100 text-blue-700'
    : s === 'confirmed' ? 'bg-emerald-100 text-emerald-700'
    : s === 'fulfilled' ? 'bg-gray-200 text-gray-700'
    : 'bg-red-100 text-red-600';

  return (
    <DashboardLayout>
      <BackButton />
      <h1 className="page-title mb-1">Customer waitlist</h1>
      <p className="page-sub mb-4">
        Send a customer their personal shop link — they see live stock, pick quantities,
        and forward the order to you on WhatsApp.
      </p>

      <div className="grid gap-4 lg:grid-cols-2 max-w-6xl">
        <div className="space-y-4">
          {/* ── New invite ── */}
          <form onSubmit={handleCreate} className="card space-y-3 p-4 sm:p-5">
            <p className="text-sm font-semibold text-gray-900">＋ New waitlist link</p>
            {!isStaff && (
              <div>
                <label className="label" htmlFor="wl-branch">Branch (whose stock the customer shops)</label>
                <select
                  id="wl-branch"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="select w-full"
                >
                  <option value="">My branch (default)</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="label" htmlFor="wl-phone">Customer phone number</label>
              <input
                id="wl-phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 054 123 4567"
                className="input w-full"
              />
            </div>
            {error && <p className="text-sm text-red-700 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
            <button type="submit" disabled={busy} className="btn btn-primary w-full">
              {busy ? 'Creating link…' : 'Create + send via WhatsApp'}
            </button>
            {created && (
              <div className="rounded-2xl bg-gray-50 p-3">
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

          {/* ── Sent links ── */}
          <div className="card overflow-hidden">
            <p className="card-header">Sent links ({invites.length})</p>
            {invites.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">No links yet — create one above.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {invites.map((inv) => (
                  <li key={inv.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900">{inv.customer_phone}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${statusColor(inv.status)}`}>
                        {inv.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {inv.branch_name} · {inv.order_count} order{inv.order_count === 1 ? '' : 's'} · expires {new Date(inv.expires_at).toLocaleDateString()}
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
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ── Incoming orders ── */}
        <div className="card overflow-hidden h-fit">
          <p className="card-header">Customer orders ({orders.length})</p>
          {orders.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">No orders yet — they appear here the moment a customer submits.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {orders.map((o) => (
                <li key={o.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">
                      {o.customer_name || o.customer_phone}
                      <span className="ml-1.5 font-mono text-[11px] text-gray-400">{o.id.slice(0, 8).toUpperCase()}</span>
                    </p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${statusColor(o.status)}`}>
                      {o.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">{o.branch_name} · {new Date(o.created_at).toLocaleString()}</p>
                  <ul className="mt-2 rounded-xl bg-gray-50 px-3 py-2 space-y-1">
                    {(Array.isArray(o.items) ? o.items : []).map((l, i) => (
                      <li key={i} className="flex justify-between gap-2 text-xs text-gray-700">
                        <span className="truncate">{l.qty} × {l.name}</span>
                        <span className="shrink-0 font-semibold tabular-nums">GHS {Number(l.line_total).toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-sm font-bold tabular-nums">GHS {Number(o.total).toFixed(2)}</p>
                    {o.status === 'pending' && (
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => handleOrderStatus(o.id, 'confirmed')} className="rounded-lg bg-gray-900 px-2.5 py-1.5 text-[11px] font-semibold text-white">Confirm</button>
                        <button type="button" onClick={() => handleOrderStatus(o.id, 'cancelled')} className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600">Cancel</button>
                      </div>
                    )}
                    {o.status === 'confirmed' && (
                      <button type="button" onClick={() => handleOrderStatus(o.id, 'fulfilled')} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white">Fulfill</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
