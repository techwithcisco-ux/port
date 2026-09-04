import { useEffect, useMemo, useState } from 'react';
import BackButton from '../../components/BackButton';
import DashboardLayout from '../../components/DashboardLayout';
import { ColorLegend, StatusBadge, ColorStatCard, BarMeter } from '../../components/Visuals';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatGHS } from '../../lib/utils';
import type { Debtor, DebtorPayment, Creditor, CreditorPayment } from '@branchport/shared';

type Tab = 'debtors' | 'creditors';

interface PersonDebt {
  id: string;
  name: string;
  phone: string | null;
  originalAmount: number;
  amountPaid: number;
  amountOwed: number;
  status: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (24 * 60 * 60 * 1000));
}

function debtUrgencyColor(daysOld: number, amountOwed: number): 'green' | 'amber' | 'orange' | 'red' {
  if (amountOwed <= 0) return 'green';
  if (daysOld <= 7) return 'green';
  if (daysOld <= 30) return 'amber';
  if (daysOld <= 60) return 'orange';
  return 'red';
}

function debtStatusLabel(daysOld: number, amountOwed: number, status: string): string {
  if (status === 'settled') return '✓ Settled';
  if (amountOwed <= 0) return '✓ Paid';
  if (daysOld <= 7) return 'Recently due';
  if (daysOld <= 14) return 'Due soon';
  if (daysOld <= 30) return 'Overdue';
  if (daysOld <= 60) return 'Seriously overdue';
  return '⚠ Critical';
}

function PersonCard({
  person,
  payments,
  onPay,
  expanded,
  onToggle,
  isDebtor,
}: {
  person: PersonDebt;
  payments: Array<{ id: string; amount: number; note: string; paidAt: string }>;
  onPay: (personId: string, amount: number) => void;
  expanded: boolean;
  onToggle: () => void;
  isDebtor: boolean;
}) {
  const [payAmount, setPayAmount] = useState(String(person.amountOwed));
  const daysOld = daysSince(person.createdAt);
  const urgencyColor = debtUrgencyColor(daysOld, person.amountOwed);
  const paidPct = person.originalAmount > 0 ? (person.amountPaid / person.originalAmount) * 100 : 0;

  const borderColor: Record<string, string> = {
    green: 'border-l-green-500', amber: 'border-l-amber-500',
    orange: 'border-l-orange-500', red: 'border-l-red-500',
  };
  const bgColor: Record<string, string> = {
    green: 'bg-green-50/30', amber: 'bg-amber-50/30',
    orange: 'bg-orange-50/30', red: 'bg-red-50/30',
  };

  return (
    <div className={`bg-white border border-gray-200 border-l-4 ${borderColor[urgencyColor]} rounded-xl overflow-hidden transition-all duration-300`}>
      <button onClick={onToggle} className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-900 truncate">{person.name}</p>
            <StatusBadge color={urgencyColor} pulse={urgencyColor === 'red' && person.amountOwed > 0}>
              {debtStatusLabel(daysOld, person.amountOwed, person.status)}
            </StatusBadge>
          </div>
          {person.phone && <p className="text-xs text-gray-400 mt-0.5">{person.phone}</p>}
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[10px] text-gray-400">{daysOld} days ago</span>
            <span className="text-[10px] text-gray-400">•</span>
            <span className="text-[10px] text-gray-400">{paidPct.toFixed(0)}% paid</span>
          </div>
        </div>
        <div className="text-right shrink-0 ml-3">
          <p className={`text-lg font-bold tabular-nums ${person.amountOwed > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {person.amountOwed > 0 ? formatGHS(person.amountOwed) : '✓'}
          </p>
          <p className="text-[11px] text-gray-400">
            of {formatGHS(person.originalAmount)}
          </p>
        </div>
      </button>

      {/* Paid/owed progress bar */}
      <div className="px-4 pb-2">
        <BarMeter value={person.amountPaid} max={person.originalAmount || 1} color={paidPct >= 100 ? 'green' : paidPct >= 50 ? 'amber' : 'red'} height={6} />
      </div>

      {expanded && (
        <div className={`border-t border-gray-100 px-4 py-3 space-y-2 ${bgColor[urgencyColor]}`}>
          {person.notes && <p className="text-xs text-gray-500 italic">📝 {person.notes}</p>}

          {payments.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Payment history</p>
              <div className="space-y-1">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">{p.note || 'Payment'}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400">{new Date(p.paidAt).toLocaleDateString()}</span>
                      <span className="font-medium tabular-nums text-green-600">-{formatGHS(p.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {person.amountOwed > 0 && (
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              <input
                type="number" min="0.01" max={person.amountOwed} step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:border-gray-900"
              />
              <button
                onClick={() => {
                  const amt = Number(payAmount);
                  if (amt > 0 && amt <= person.amountOwed) { onPay(person.id, amt); setPayAmount(String(person.amountOwed - amt)); }
                }}
                className="px-4 py-2 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700"
              >
                Record payment
              </button>
              <button
                onClick={() => { onPay(person.id, person.amountOwed); }}
                className="px-4 py-2 rounded-lg border border-green-300 text-green-700 text-xs font-medium hover:bg-green-50"
              >
                Settle full
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Ledger() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('debtors');
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [debtorPayments, setDebtorPayments] = useState<DebtorPayment[]>([]);
  const [creditors, setCreditors] = useState<Creditor[]>([]);
  const [creditorPayments, setCreditorPayments] = useState<CreditorPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

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
      console.error('Failed to load ledger data:', err);
    }
    setLoading(false);
  }

  async function handlePayDebtor(debtorId: string, amount: number) {
    if (!profile) return;
    const debtor = debtors.find((d) => d.id === debtorId);
    if (!debtor) return;
    await supabase.from('debtor_payments').insert({ debtor_id: debtorId, amount, note: `Payment by ${debtor.customer_name}`, created_by: profile.id });
    const newPaid = debtor.amount_paid + amount;
    const newOwed = debtor.original_amount - newPaid;
    await supabase.from('debtors').update({ amount_paid: newPaid, amount_owed: Math.max(newOwed, 0), status: newOwed <= 0 ? 'settled' : 'partial', updated_at: new Date().toISOString() }).eq('id', debtorId);
    void loadData();
  }

  async function handlePayCreditor(creditorId: string, amount: number) {
    if (!profile) return;
    const creditor = creditors.find((c) => c.id === creditorId);
    if (!creditor) return;
    await supabase.from('creditor_payments').insert({ creditor_id: creditorId, amount, note: `Payment to ${creditor.supplier_name}`, created_by: profile.id });
    const newPaid = creditor.amount_paid + amount;
    const newOwed = creditor.original_amount - newPaid;
    await supabase.from('creditors').update({ amount_paid: newPaid, amount_owed: Math.max(newOwed, 0), status: newOwed <= 0 ? 'settled' : 'partial', updated_at: new Date().toISOString() }).eq('id', creditorId);
    void loadData();
  }

  const filteredDebtors = useMemo(() => {
    let list = debtors;
    if (statusFilter !== 'all') list = list.filter((d) => d.status === statusFilter);
    return list.sort((a, b) => daysSince(b.created_at) - daysSince(a.created_at));
  }, [debtors, statusFilter]);

  const filteredCreditors = useMemo(() => {
    let list = creditors;
    if (statusFilter !== 'all') list = list.filter((c) => c.status === statusFilter);
    return list.sort((a, b) => daysSince(b.created_at) - daysSince(a.created_at));
  }, [creditors, statusFilter]);

  const debtorsSummary = useMemo(() => ({
    total: debtors.reduce((s, d) => s + d.original_amount, 0),
    paid: debtors.reduce((s, d) => s + d.amount_paid, 0),
    owed: debtors.reduce((s, d) => s + d.amount_owed, 0),
    count: debtors.filter((d) => d.status !== 'settled').length,
    oldestDays: Math.max(...debtors.filter((d) => d.amount_owed > 0).map((d) => daysSince(d.created_at)), 0),
  }), [debtors]);

  const creditorsSummary = useMemo(() => ({
    total: creditors.reduce((s, c) => s + c.original_amount, 0),
    paid: creditors.reduce((s, c) => s + c.amount_paid, 0),
    owed: creditors.reduce((s, c) => s + c.amount_owed, 0),
    count: creditors.filter((c) => c.status !== 'settled').length,
    oldestDays: Math.max(...creditors.filter((c) => c.amount_owed > 0).map((c) => daysSince(c.created_at)), 0),
  }), [creditors]);

  const persons = tab === 'debtors' ? filteredDebtors : filteredCreditors;
  const summary = tab === 'debtors' ? debtorsSummary : creditorsSummary;

  return (
    <DashboardLayout>
      <BackButton />
      <div>
        <div>
          <h1 className="page-title">📒 Debtors & Creditors</h1>
          <p className="page-sub">Who owes you, who you owe — colors show how urgent it is.</p>
        </div>
      </div>

      <ColorLegend items={[
        { color: 'bg-green-500', label: 'Recent / Settled' },
        { color: 'bg-amber-500', label: 'Due soon (7-30 days)' },
        { color: 'bg-orange-500', label: 'Overdue (30-60 days)' },
        { color: 'bg-red-500', label: 'Critical (60+ days)' },
      ]} className="mb-3" />

      {/* Tab switcher */}
      <div className="flex gap-1.5 mb-3 max-w-xs">
        <button onClick={() => { setTab('debtors'); setExpandedId(null); setStatusFilter('all'); }}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${tab === 'debtors' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          👤 Debtors ({debtorsSummary.count})
        </button>
        <button onClick={() => { setTab('creditors'); setExpandedId(null); setStatusFilter('all'); }}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${tab === 'creditors' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          🏭 Creditors ({creditorsSummary.count})
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:gap-3 mb-3 max-w-4xl lg:grid-cols-4">
        <ColorStatCard
          label={tab === 'debtors' ? 'Owed to us' : 'We owe'}
          value={loading ? '…' : formatGHS(summary.owed)}
          color={summary.owed > 0 ? (tab === 'debtors' ? 'amber' : 'red') : 'green'}
          icon={tab === 'debtors' ? '💰' : '📋'}
        />
        <ColorStatCard label="Total paid" value={loading ? '…' : formatGHS(summary.paid)} color="green" icon="✅" />
        <ColorStatCard label="Original amount" value={loading ? '…' : formatGHS(summary.total)} color="blue" icon="📄" />
        <ColorStatCard
          label="Oldest debt"
          value={summary.oldestDays > 0 ? `${summary.oldestDays} days` : 'None'}
          color={summary.oldestDays > 60 ? 'red' : summary.oldestDays > 30 ? 'orange' : summary.oldestDays > 0 ? 'amber' : 'green'}
          icon={summary.oldestDays > 60 ? '🚨' : summary.oldestDays > 30 ? '⚠️' : '✅'}
        />
      </div>

      {/* Status filter */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {['all', 'pending', 'partial', 'settled'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize whitespace-nowrap ${statusFilter === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {s} ({s === 'all' ? (tab === 'debtors' ? debtors : creditors).length : (tab === 'debtors' ? debtors : creditors).filter((p) => p.status === s).length})
          </button>
        ))}
      </div>

      {/* Person cards */}
      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : persons.length === 0 ? (
        <p className="text-gray-500 text-sm">
          {tab === 'debtors' ? 'No debtors yet. They appear when a customer makes a partial payment at the POS.' : 'No creditors yet. They appear when you buy on credit from suppliers.'}
        </p>
      ) : (
        <div className="space-y-2 max-w-4xl">
          {persons.map((person) => {
            const payments = tab === 'debtors'
              ? debtorPayments.filter((p) => p.debtor_id === person.id).map((p) => ({ id: p.id, amount: p.amount, note: p.note, paidAt: p.paid_at }))
              : creditorPayments.filter((p) => p.creditor_id === person.id).map((p) => ({ id: p.id, amount: p.amount, note: p.note, paidAt: p.paid_at }));
            return (
              <PersonCard
                key={person.id}
                person={{
                  id: person.id,
                  name: tab === 'debtors' ? (person as Debtor).customer_name : (person as Creditor).supplier_name,
                  phone: tab === 'debtors' ? (person as Debtor).customer_phone : (person as Creditor).supplier_phone,
                  originalAmount: person.original_amount, amountPaid: person.amount_paid,
                  amountOwed: person.amount_owed, status: person.status, notes: person.notes,
                  createdAt: person.created_at, updatedAt: person.updated_at,
                }}
                payments={payments}
                onPay={tab === 'debtors' ? handlePayDebtor : handlePayCreditor}
                expanded={expandedId === person.id}
                onToggle={() => setExpandedId(expandedId === person.id ? null : person.id)}
                isDebtor={tab === 'debtors'}
              />
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
