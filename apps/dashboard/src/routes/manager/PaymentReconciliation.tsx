import { useEffect, useMemo, useState } from 'react';
import BackButton from '../../components/BackButton';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatGHS } from '../../lib/utils';
import type { Debtor, DebtorPayment, Creditor, CreditorPayment } from '@branchport/shared';

type Side = 'money-in' | 'money-out';

interface UnmatchedPayment {
  id: string;
  side: 'in' | 'out';
  personName: string;
  amount: number;
  paidAt: string;
  note: string;
  linkedDebtorId: string | null;
  linkedCreditorId: string | null;
}

export default function PaymentReconciliation() {
  const { profile } = useAuth();
  const [side, setSide] = useState<Side>('money-in');
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [debtorPayments, setDebtorPayments] = useState<DebtorPayment[]>([]);
  const [creditors, setCreditors] = useState<Creditor[]>([]);
  const [creditorPayments, setCreditorPayments] = useState<CreditorPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [d, dp, c, cp] = await Promise.allSettled([
        supabase.from('debtors').select('*'),
        supabase.from('debtor_payments').select('*'),
        supabase.from('creditors').select('*'),
        supabase.from('creditor_payments').select('*'),
      ]);
      setDebtors((d.status === 'fulfilled' ? d.value.data : null as any) ?? []);
      setDebtorPayments((dp.status === 'fulfilled' ? dp.value.data : null as any) ?? []);
      setCreditors((c.status === 'fulfilled' ? c.value.data : null as any) ?? []);
      setCreditorPayments((cp.status === 'fulfilled' ? cp.value.data : null as any) ?? []);
    } catch (err) {
      console.error('Failed to load reconciliation data:', err);
    }
    setLoading(false);
  }

  // ── Summary ──
  const summary = useMemo(() => {
    if (side === 'money-in') {
      const totalOwed = debtors.reduce((s, d) => s + Number(d.amount_owed), 0);
      const totalPaid = debtors.reduce((s, d) => s + Number(d.amount_paid), 0);
      const unsettled = debtors.filter((d) => d.status !== 'settled').length;
      const oldestDays = Math.max(
        ...debtors.filter((d) => d.amount_owed > 0).map((d) => daysSince(d.created_at)),
        0
      );
      return { totalOwed, totalPaid, unsettled, oldestDays, count: debtors.length };
    } else {
      const totalOwed = creditors.reduce((s, c) => s + Number(c.amount_owed), 0);
      const totalPaid = creditors.reduce((s, c) => s + Number(c.amount_paid), 0);
      const unsettled = creditors.filter((c) => c.status !== 'settled').length;
      const oldestDays = Math.max(
        ...creditors.filter((c) => c.amount_owed > 0).map((c) => daysSince(c.created_at)),
        0
      );
      return { totalOwed, totalPaid, unsettled, oldestDays, count: creditors.length };
    }
  }, [side, debtors, creditors]);

  // ── Unmatched payments (payments that haven't fully settled their debt) ──
  const unmatchedPayments = useMemo<UnmatchedPayment[]>(() => {
    const result: UnmatchedPayment[] = [];

    for (const d of debtors) {
      const payments = debtorPayments.filter((p) => p.debtor_id === d.id);
      const matched = payments.filter((p) => p.paid_at && d.amount_owed <= 0);
      const unmatched = matched.length === 0 && d.amount_owed > 0;
      for (const p of payments) {
        result.push({
          id: p.id,
          side: 'in',
          personName: d.customer_name,
          amount: Number(p.amount),
          paidAt: p.paid_at,
          note: p.note,
          linkedDebtorId: d.id,
          linkedCreditorId: null,
        });
      }
    }

    for (const c of creditors) {
      const payments = creditorPayments.filter((p) => p.creditor_id === c.id);
      for (const p of payments) {
        result.push({
          id: p.id,
          side: 'out',
          personName: c.supplier_name,
          amount: Number(p.amount),
          paidAt: p.paid_at,
          note: p.note,
          linkedDebtorId: null,
          linkedCreditorId: c.id,
        });
      }
    }

    return result.sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  }, [debtors, creditors, debtorPayments, creditorPayments]);

  // ── People list (filtered by side) ──
  const people = useMemo(() => {
    if (side === 'money-in') {
      return debtors
        .filter((d) => d.amount_owed > 0)
        .sort((a, b) => daysSince(b.created_at) - daysSince(a.created_at))
        .map((d) => ({
          id: d.id,
          name: d.customer_name,
          phone: d.customer_phone,
          originalAmount: Number(d.original_amount),
          amountPaid: Number(d.amount_paid),
          amountOwed: Number(d.amount_owed),
          status: d.status,
          daysOld: daysSince(d.created_at),
          payments: debtorPayments
            .filter((p) => p.debtor_id === d.id)
            .sort((a, b) => b.paid_at.localeCompare(a.paid_at)),
        }));
    } else {
      return creditors
        .filter((c) => c.amount_owed > 0)
        .sort((a, b) => daysSince(b.created_at) - daysSince(a.created_at))
        .map((c) => ({
          id: c.id,
          name: c.supplier_name,
          phone: c.supplier_phone,
          originalAmount: Number(c.original_amount),
          amountPaid: Number(c.amount_paid),
          amountOwed: Number(c.amount_owed),
          status: c.status,
          daysOld: daysSince(c.created_at),
          payments: creditorPayments
            .filter((p) => p.creditor_id === c.id)
            .sort((a, b) => b.paid_at.localeCompare(a.paid_at)),
        }));
    }
  }, [side, debtors, creditors, debtorPayments, creditorPayments]);

  async function handleRecordPayment(personId: string, amount: number) {
    if (!profile || amount <= 0) return;
    setStatus(null);

    if (side === 'money-in') {
      const debtor = debtors.find((d) => d.id === personId);
      if (!debtor) return;
      const { error } = await supabase.from('debtor_payments').insert({
        debtor_id: personId,
        amount,
        note: `Payment from ${debtor.customer_name}`,
        created_by: profile.id,
      });
      if (!error) {
        const newPaid = Number(debtor.amount_paid) + amount;
        const newOwed = Math.max(Number(debtor.original_amount) - newPaid, 0);
        await supabase.from('debtors').update({
          amount_paid: newPaid,
          amount_owed: newOwed,
          status: newOwed <= 0 ? 'settled' : 'partial',
          updated_at: new Date().toISOString(),
        }).eq('id', personId);
        setStatus(`✅ Recorded ${formatGHS(amount)} from ${debtor.customer_name}`);
        void loadData();
      }
    } else {
      const creditor = creditors.find((c) => c.id === personId);
      if (!creditor) return;
      const { error } = await supabase.from('creditor_payments').insert({
        creditor_id: personId,
        amount,
        note: `Payment to ${creditor.supplier_name}`,
        created_by: profile.id,
      });
      if (!error) {
        const newPaid = Number(creditor.amount_paid) + amount;
        const newOwed = Math.max(Number(creditor.original_amount) - newPaid, 0);
        await supabase.from('creditors').update({
          amount_paid: newPaid,
          amount_owed: newOwed,
          status: newOwed <= 0 ? 'settled' : 'partial',
          updated_at: new Date().toISOString(),
        }).eq('id', personId);
        setStatus(`✅ Recorded ${formatGHS(amount)} to ${creditor.supplier_name}`);
        void loadData();
      }
    }
    setPayAmount('');
    setExpandedId(null);
  }

  return (
    <DashboardLayout>
      <BackButton />
      <div>
        <div>
          <h1 className="page-title">🔄 Payment Reconciliation</h1>
          <p className="page-sub">Match payments to who owes you and who you owe.</p>
        </div>
      </div>

      {status && (
        <div className="mb-4 px-4 py-3 bg-green-50 text-green-800 rounded-xl text-sm font-medium">{status}</div>
      )}

      {/* Side toggle */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => { setSide('money-in'); setExpandedId(null); }}
          className={`px-5 py-3 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
            side === 'money-in' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          💰 Money In (Debtors)
        </button>
        <button
          onClick={() => { setSide('money-out'); setExpandedId(null); }}
          className={`px-5 py-3 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
            side === 'money-out' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          💸 Money Out (Creditors)
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div className={`rounded-2xl p-4 ${summary.totalOwed > 0 ? (side === 'money-in' ? 'bg-amber-50 border border-amber-200' : 'bg-red-50 border border-red-200') : 'bg-green-50 border border-green-200'}`}>
          <p className={`text-xs font-medium uppercase ${side === 'money-in' ? 'text-amber-600' : 'text-red-600'}`}>
            {side === 'money-in' ? 'Still owed to you' : 'You still owe'}
          </p>
          <p className={`text-2xl font-bold mt-1 tabular-nums ${side === 'money-in' ? 'text-amber-700' : 'text-red-700'}`}>
            {formatGHS(summary.totalOwed)}
          </p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
          <p className="text-xs font-medium text-green-600 uppercase">Already paid</p>
          <p className="text-2xl font-bold text-green-700 mt-1 tabular-nums">{formatGHS(summary.totalPaid)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">Unsettled</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{summary.unsettled}</p>
          <p className="text-xs text-gray-400">of {summary.count} total</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">Oldest</p>
          <p className={`text-2xl font-bold mt-1 ${summary.oldestDays > 60 ? 'text-red-600' : summary.oldestDays > 30 ? 'text-amber-600' : 'text-green-600'}`}>
            {summary.oldestDays > 0 ? `${summary.oldestDays}d` : '—'}
          </p>
          <p className="text-xs text-gray-400">days overdue</p>
        </div>
      </div>

      {/* People list */}
      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : people.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
          <p className="text-4xl mb-3">{side === 'money-in' ? '🎉' : '✅'}</p>
          <p className="text-sm font-medium text-gray-900">
            {side === 'money-in' ? 'Nobody owes you anything!' : 'You don\'t owe anyone!'}
          </p>
          <p className="text-xs text-gray-500 mt-1">All settled up.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {people.map((person) => {
            const isExpanded = expandedId === person.id;
            const urgencyColor = person.daysOld > 60 ? 'border-l-red-500' : person.daysOld > 30 ? 'border-l-amber-500' : 'border-l-green-500';
            const paidPct = person.originalAmount > 0 ? (person.amountPaid / person.originalAmount) * 100 : 0;

            return (
              <div
                key={person.id}
                className={`bg-white border border-gray-200 border-l-4 ${urgencyColor} rounded-xl overflow-hidden transition-all`}
              >
                {/* Person header */}
                <button
                  onClick={() => { setExpandedId(isExpanded ? null : person.id); setPayAmount(String(person.amountOwed)); }}
                  className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{person.name}</p>
                    {person.phone && <p className="text-xs text-gray-400">{person.phone}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[120px]">
                        <div
                          className={`h-full rounded-full ${paidPct >= 100 ? 'bg-green-500' : paidPct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(paidPct, 100)}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-gray-400">{paidPct.toFixed(0)}% settled</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className={`text-lg font-bold tabular-nums ${person.amountOwed > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatGHS(person.amountOwed)}
                    </p>
                    <p className="text-[11px] text-gray-400">of {formatGHS(person.originalAmount)}</p>
                  </div>
                </button>

                {/* Expanded: payment history + record payment */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-3 space-y-2 bg-gray-50/50">
                    {/* Payment history */}
                    {person.payments.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase mb-2">Payment History</p>
                        <div className="space-y-1.5">
                          {person.payments.map((p) => (
                            <div key={p.id} className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-2">
                              <span className="text-gray-600">{p.note || 'Payment'}</span>
                              <div className="flex items-center gap-3">
                                <span className="text-gray-400">{new Date(p.paid_at).toLocaleDateString()}</span>
                                <span className="font-medium tabular-nums text-green-600">{formatGHS(p.amount)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Record payment */}
                    {person.amountOwed > 0 && (
                      <div className="pt-2 border-t border-gray-200">
                        <p className="text-xs font-medium text-gray-500 mb-2">
                          Record {side === 'money-in' ? 'incoming' : 'outgoing'} payment
                        </p>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0.01"
                            max={person.amountOwed}
                            step="0.01"
                            value={payAmount}
                            onChange={(e) => setPayAmount(e.target.value)}
                            placeholder="Amount"
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:border-gray-900"
                          />
                          <button
                            onClick={() => {
                              const amt = Number(payAmount);
                              if (amt > 0 && amt <= person.amountOwed) handleRecordPayment(person.id, amt);
                            }}
                            className={`px-4 py-2 rounded-lg text-white text-xs font-medium ${
                              side === 'money-in' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                            }`}
                          >
                            Record
                          </button>
                          <button
                            onClick={() => handleRecordPayment(person.id, person.amountOwed)}
                            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-100"
                          >
                            Settle all
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Recent payments log */}
      {!loading && unmatchedPayments.length > 0 && (
        <div className="mt-8 bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">Recent Payments</p>
            <p className="text-xs text-gray-500">All payments recorded across debtors and creditors</p>
          </div>
          <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
            {unmatchedPayments.slice(0, 20).map((p) => (
              <div key={p.id} className="px-4 py-2.5 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900">{p.personName}</p>
                  <p className="text-[11px] text-gray-400">{new Date(p.paidAt).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                    p.side === 'in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {p.side === 'in' ? '↑ In' : '↓ Out'}
                  </span>
                  <span className="text-sm font-bold tabular-nums text-gray-900">{formatGHS(p.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (24 * 60 * 60 * 1000));
}
