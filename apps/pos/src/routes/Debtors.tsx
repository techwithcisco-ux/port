import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { pushLedger } from '../lib/sync';
import { useAuth } from '../contexts/AuthContext';
import { ghFormatDateTime, nowISO } from '@branchport/shared';
import SyncIndicator from '../components/SyncIndicator';

function ghs(n: number): string {
  return `GHS ${n.toFixed(2)}`;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending:  { bg: 'bg-red-50',    text: 'text-red-700',    label: 'Owing' },
  partial:  { bg: 'bg-amber-50',  text: 'text-amber-700',  label: 'Part paid' },
  settled:  { bg: 'bg-green-50',  text: 'text-green-700',  label: 'Settled' },
};

export default function Debtors() {
  const { profile } = useAuth();
  const debtors = useLiveQuery(
    () => (profile ? db.debtors.where('branch_id').equals(profile.branch_id!).toArray() : []),
    [profile]
  ) ?? [];
  const payments = useLiveQuery(
    () => (profile ? db.debtor_payments.toArray() : []),
    [profile]
  ) ?? [];
  const invoices = useLiveQuery(
    () => (profile ? db.invoices.where('branch_id').equals(profile.branch_id!).toArray() : []),
    [profile]
  ) ?? [];

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = [...debtors];
    if (statusFilter !== 'all') list = list.filter((d) => d.status === statusFilter);
    const t = search.trim().toLowerCase();
    if (t) {
      list = list.filter(
        (d) =>
          d.customer_name.toLowerCase().includes(t) ||
          (d.customer_phone ?? '').includes(t) ||
          d.notes.toLowerCase().includes(t)
      );
    }
    return list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [debtors, search, statusFilter]);

  const totalOwed = useMemo(
    () => debtors.reduce((s, d) => s + (d.status !== 'settled' ? d.amount_owed : 0), 0),
    [debtors]
  );

  const statusCounts = useMemo(() => {
    const counts = { all: debtors.length, pending: 0, partial: 0, settled: 0 };
    for (const d of debtors) {
      if (d.status in counts) counts[d.status as keyof typeof counts]++;
    }
    return counts;
  }, [debtors]);

  function paymentsFor(debtorId: string) {
    return payments.filter((p) => p.debtor_id === debtorId).sort((a, b) => b.paid_at.localeCompare(a.paid_at));
  }

  async function recordPayment() {
    if (!payingId || !profile) return;
    const debtor = debtors.find((d) => d.id === payingId);
    if (!debtor) return;
    const amt = Number(payAmount);
    if (!isFinite(amt) || amt <= 0) { setError('Enter an amount greater than zero.'); return; }
    if (amt > debtor.amount_owed + 0.001) { setError(`That's more than the ${ghs(debtor.amount_owed)} owed.`); return; }
    setSaving(true);
    setError(null);
    try {
      const now = nowISO();
      const newPaid = debtor.amount_paid + amt;
      const newOwed = Math.max(0, Math.round((debtor.original_amount - newPaid) * 100) / 100);
      const newStatus = newOwed <= 0 ? 'settled' : 'partial' as const;
      // Write the payment record
      await db.debtor_payments.add({
        id: crypto.randomUUID(),
        debtor_id: payingId,
        amount: Math.round(amt * 100) / 100,
        note: payNote.trim() || '',
        paid_at: now,
        created_by: profile.id,
        serverSynced: false,
      });
      // Update the debtor
      await db.debtors.update(payingId, {
        amount_paid: Math.round(newPaid * 100) / 100,
        amount_owed: newOwed,
        status: newStatus,
        updated_at: now,
        serverSynced: false,
      });
      // Mark the linked invoice as settled if fully paid
      if (newOwed <= 0 && debtor.invoice_id) {
        await db.invoices.update(debtor.invoice_id, {
          status: 'completed',
          updated_at: now,
          serverSynced: false,
        });
      }
      setFeedback(`Payment of ${ghs(amt)} recorded for ${debtor.customer_name}`);
      setPayingId(null);
      setPayAmount('');
      setPayNote('');
      void pushLedger();
    } catch (err) {
      setError(`Could not save — ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  function setFeedback(msg: string) {
    setError(null);
    // Reuse the error banner slot for success feedback (green styling below)
    setError(`__OK__${msg}`);
    setTimeout(() => setError(null), 3000);
  }

  const isOk = error?.startsWith('__OK__');
  const okMsg = isOk ? error!.slice(6) : null;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Debtors</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {debtors.length > 0 && totalOwed > 0
                ? `${ghs(totalOwed)} outstanding across ${debtors.filter((d) => d.status !== 'settled').length} customer${debtors.filter((d) => d.status !== 'settled').length !== 1 ? 's' : ''}`
                : `${debtors.length} record${debtors.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <SyncIndicator compact />
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
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
          {(['all', 'pending', 'partial', 'settled'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {STATUS_STYLES[s]?.label ?? 'All'}
              <span className="ml-1 text-[10px] opacity-70">{statusCounts[s]}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Feedback banner */}
      {error && (
        <div className={`mx-4 mt-3 rounded-xl text-sm px-4 py-3 border ${
          isOk ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {isOk ? okMsg : error}
        </div>
      )}

      {/* Debtors list */}
      <div className="flex-1 px-4 py-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <p className="text-4xl mb-3">👥</p>
            <p className="text-sm">
              {debtors.length === 0
                ? 'No debtors yet — credit sales will appear here'
                : 'No debtors match your search'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((d) => {
              const st = STATUS_STYLES[d.status] ?? STATUS_STYLES.pending;
              const expanded = expandedId === d.id;
              const inv = d.invoice_id ? invoices.find((i) => i.id === d.invoice_id) : null;
              const dPayments = paymentsFor(d.id);
              return (
                <div key={d.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  {/* Row header */}
                  <button
                    onClick={() => setExpandedId(expanded ? null : d.id)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50"
                  >
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.bg} ${st.text}`}>
                      {st.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{d.customer_name}</p>
                      <p className="text-xs text-gray-500">
                        {d.customer_phone || 'No phone'}{inv ? ` · ${inv.invoice_number}` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold tabular-nums ${d.amount_owed > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {d.amount_owed > 0 ? ghs(d.amount_owed) : 'Settled'}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {ghFormatDateTime(d.updated_at)}
                      </p>
                    </div>
                    <span className={`text-gray-400 text-sm transition-transform ${expanded ? 'rotate-90' : ''}`}>
                      ›
                    </span>
                  </button>

                  {/* Expanded detail */}
                  {expanded && (
                    <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                      {/* Amounts */}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-gray-50 rounded-lg py-2">
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Original</p>
                          <p className="text-sm font-bold tabular-nums text-gray-900">{ghs(d.original_amount)}</p>
                        </div>
                        <div className="bg-green-50 rounded-lg py-2">
                          <p className="text-[10px] text-green-600 uppercase tracking-wide">Paid</p>
                          <p className="text-sm font-bold tabular-nums text-green-700">{ghs(d.amount_paid)}</p>
                        </div>
                        <div className={`rounded-lg py-2 ${d.amount_owed > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                          <p className={`text-[10px] uppercase tracking-wide ${d.amount_owed > 0 ? 'text-red-600' : 'text-green-600'}`}>Owed</p>
                          <p className={`text-sm font-bold tabular-nums ${d.amount_owed > 0 ? 'text-red-700' : 'text-green-700'}`}>{ghs(d.amount_owed)}</p>
                        </div>
                      </div>

                      {d.notes && <p className="text-xs text-gray-500 italic">{d.notes}</p>}

                      {/* Payment history */}
                      {dPayments.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Payment history</p>
                          <div className="space-y-1">
                            {dPayments.map((p) => (
                              <div key={p.id} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 last:border-0">
                                <div>
                                  <span className="font-medium text-gray-900">{ghs(p.amount)}</span>
                                  {p.note && <span className="text-gray-500 ml-2">{p.note}</span>}
                                </div>
                                <span className="text-gray-400">{ghFormatDateTime(p.paid_at)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Record payment — only when still owing */}
                      {d.amount_owed > 0 && (
                        payingId === d.id ? (
                          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
                            <p className="text-sm font-medium text-blue-800">Record a payment</p>
                            {error && !isOk && (
                              <p className="text-xs text-red-600">{error}</p>
                            )}
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-blue-700 shrink-0">Amount</span>
                              <input
                                type="number"
                                min="0.01"
                                max={d.amount_owed}
                                step="0.01"
                                inputMode="decimal"
                                value={payAmount}
                                onChange={(e) => setPayAmount(e.target.value)}
                                placeholder="0.00"
                                autoFocus
                                className="flex-1 border border-blue-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-600 tabular-nums"
                              />
                            </div>
                            <input
                              value={payNote}
                              onChange={(e) => setPayNote(e.target.value)}
                              placeholder="Note (optional)"
                              className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-600"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={recordPayment}
                                disabled={saving}
                                className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                              >
                                {saving ? 'Saving…' : 'Save payment'}
                              </button>
                              <button
                                onClick={() => { setPayingId(null); setPayAmount(''); setPayNote(''); setError(null); }}
                                className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setPayingId(d.id); setPayAmount(''); setPayNote(''); setError(null); }}
                            className="w-full py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800"
                          >
                            💰 Record payment
                          </button>
                        )
                      )}
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
