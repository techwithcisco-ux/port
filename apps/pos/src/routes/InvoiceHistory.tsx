import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import type { Invoice } from '@branchport/shared';
import { ghFormatDateTime } from '@branchport/shared';

function ghs(n: number): string {
  return `GHS ${n.toFixed(2)}`;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending:   { bg: 'bg-amber-50',  text: 'text-amber-800',  label: 'Pending' },
  completed: { bg: 'bg-green-50',  text: 'text-green-800',  label: 'Completed' },
  cancelled: { bg: 'bg-red-50',    text: 'text-red-800',    label: 'Cancelled' },
};

export default function InvoiceHistory() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const invoices = useLiveQuery(
    () => (profile ? db.invoices.where('branch_id').equals(profile.branch_id!).toArray() : []),
    [profile]
  ) ?? [];

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = [...invoices];
    if (statusFilter !== 'all') {
      list = list.filter((i) => i.status === statusFilter);
    }
    const t = search.trim().toLowerCase();
    if (t) {
      list = list.filter(
        (i) =>
          i.invoice_number.toLowerCase().includes(t) ||
          (i.customer_name ?? '').toLowerCase().includes(t) ||
          (i.customer_phone ?? '').includes(t)
      );
    }
    return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [invoices, search, statusFilter]);

  async function handleDelete(id: string) {
    setDeleting(id);
    await db.invoices.delete(id);
    setDeleting(null);
    if (expandedId === id) setExpandedId(null);
  }

  function handleEdit(inv: Invoice) {
    // Navigate to POS with the invoice id in state so Sell.tsx picks it up
    navigate('/', { state: { resumeInvoiceId: inv.id } });
  }

  const statusCounts = useMemo(() => {
    const counts = { all: invoices.length, pending: 0, completed: 0, cancelled: 0 };
    for (const inv of invoices) {
      if (inv.status in counts) counts[inv.status as keyof typeof counts]++;
    }
    return counts;
  }, [invoices]);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 pb-16">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Invoices</h1>
            <p className="text-sm text-gray-500 mt-0.5">{invoices.length} total</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by number, customer name, or phone…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:border-gray-900 focus:bg-white"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
            >
              ×
            </button>
          )}
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1.5">
          {(['all', 'pending', 'completed', 'cancelled'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s === 'all' ? 'All' : STATUS_STYLES[s].label}
              <span className="ml-1 text-[10px] opacity-70">
                {statusCounts[s]}
              </span>
            </button>
          ))}
        </div>
      </header>

      {/* Invoice list */}
      <div className="flex-1 px-4 py-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-sm">
              {invoices.length === 0 ? 'No invoices yet' : 'No invoices match your search'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((inv) => {
              const st = STATUS_STYLES[inv.status] ?? STATUS_STYLES.pending;
              const expanded = expandedId === inv.id;
              const date = new Date(inv.created_at);
              return (
                <div
                  key={inv.id}
                  className="bg-white border border-gray-200 rounded-xl overflow-hidden"
                >
                  {/* Row header */}
                  <button
                    onClick={() => setExpandedId(expanded ? null : inv.id)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50"
                  >
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.bg} ${st.text}`}>
                      {st.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{inv.invoice_number}</p>
                      <p className="text-xs text-gray-500">
                        {inv.customer_name || 'Walk-in'} · {inv.items.length} item{inv.items.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-gray-900">{ghs(inv.grand_total)}</p>
                      <p className="text-[10px] text-gray-400">
                        {ghFormatDateTime(inv.created_at)}
                      </p>
                    </div>
                    <span className={`text-gray-400 text-sm transition-transform ${expanded ? 'rotate-90' : ''}`}>
                      ›
                    </span>
                  </button>

                  {/* Expanded detail */}
                  {expanded && (
                    <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                      {/* Customer info */}
                      {(inv.customer_name || inv.customer_phone) && (
                        <div className="text-xs text-gray-500">
                          <span className="font-medium text-gray-700">Customer:</span>{' '}
                          {inv.customer_name || '—'}
                          {inv.customer_phone ? ` · ${inv.customer_phone}` : ''}
                        </div>
                      )}

                      {/* Line items */}
                      <div className="bg-gray-50 rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-200">
                              <th className="text-left px-3 py-2 font-semibold text-gray-500">Item</th>
                              <th className="text-right px-3 py-2 font-semibold text-gray-500">Qty</th>
                              <th className="text-right px-3 py-2 font-semibold text-gray-500">Price</th>
                              <th className="text-right px-3 py-2 font-semibold text-gray-500">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inv.items.map((item, idx) => (
                              <tr key={idx} className="border-b border-gray-100 last:border-b-0">
                                <td className="px-3 py-2">
                                  <span className="font-medium text-gray-900">{item.product_name}</span>
                                  <span className="text-gray-500 ml-1">/ {item.variant_name}</span>
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{ghs(item.unit_price)}</td>
                                <td className="px-3 py-2 text-right font-medium tabular-nums">{ghs(item.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Totals */}
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Subtotal</span>
                          <span className="tabular-nums">{ghs(inv.subtotal)}</span>
                        </div>
                        {inv.tax_rate > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Tax ({inv.tax_rate}%)</span>
                            <span className="tabular-nums">{ghs(inv.tax_amount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-semibold pt-1 border-t border-gray-100">
                          <span>Total</span>
                          <span className="tabular-nums">{ghs(inv.grand_total)}</span>
                        </div>
                      </div>

                      {inv.notes && (
                        <p className="text-xs text-gray-500 italic">Note: {inv.notes}</p>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 pt-1">
                        {inv.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleEdit(inv)}
                              className="flex-1 py-2 rounded-lg bg-gray-900 text-white text-xs font-medium"
                            >
                              Edit & resume
                            </button>
                            <button
                              onClick={() => handleDelete(inv.id)}
                              disabled={deleting === inv.id}
                              className="px-4 py-2 rounded-lg border border-red-200 text-red-700 text-xs font-medium hover:bg-red-50 disabled:opacity-50"
                            >
                              {deleting === inv.id ? '…' : 'Delete'}
                            </button>
                          </>
                        )}
                        {inv.status === 'completed' && (
                          <button
                            onClick={() => handleDelete(inv.id)}
                            disabled={deleting === inv.id}
                            className="px-4 py-2 rounded-lg border border-red-200 text-red-700 text-xs font-medium hover:bg-red-50 disabled:opacity-50"
                          >
                            {deleting === inv.id ? '…' : 'Delete'}
                          </button>
                        )}
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
  );
}
