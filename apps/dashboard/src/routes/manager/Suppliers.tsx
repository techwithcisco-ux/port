import { useEffect, useState, FormEvent } from 'react';
import BackButton from '../../components/BackButton';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Supplier, InventoryIntake, Product, SupplierPayment, SupplierReconciliation } from '@branchport/shared';
import { formatGHS } from '../../lib/utils';

// Supplier ledger + reconciliation (requirements 4.3, extended with
// payments + balance confirmations from migration 0007).
//
// Balances are NEVER stored or maintained by the app — a supplier's running
// balance is always DERIVED on read:
//     sum(inventory_intake.amount_owed)  −  sum(supplier_payments)
// where amount_owed is a generated column on each intake row and a payment
// is its own append-only row. Recording a payment can therefore never
// backdate or rewrite the intake; it only adds a new audited row.
//
// A supplier can be marked as having confirmed (reconciled) the balance
// they owe — owner-only. That confirmation is stored as its own row
// (supplier_reconciliations) and shows up in the audit log with the owner
// as actor, so "has the balance been confirmed?" is always answerable.
export default function Suppliers() {
  const { authUserId, profile } = useAuth();
  const isOwner = profile?.role === 'owner';
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [intakes, setIntakes] = useState<InventoryIntake[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [reconciliations, setReconciliations] = useState<SupplierReconciliation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [openSupplier, setOpenSupplier] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [payAmt, setPayAmt] = useState('');
  const [payNote, setPayNote] = useState('');
  const [payBusy, setPayBusy] = useState(false);

  async function refresh() {
    const [s, i, p, pm, rc] = await Promise.all([
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('inventory_intake').select('*').order('created_at', { ascending: false }),
      supabase.from('products').select('*'),
      supabase.from('supplier_payments').select('*').order('paid_at', { ascending: false }),
      supabase.from('supplier_reconciliations').select('*').order('reconciled_at', { ascending: false }),
    ]);
    setSuppliers((s.data as Supplier[]) ?? []);
    setIntakes((i.data as InventoryIntake[]) ?? []);
    setProducts((p.data as Product[]) ?? []);
    setPayments((pm.data as SupplierPayment[]) ?? []);
    setReconciliations((rc.data as SupplierReconciliation[]) ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? '—';
  const grossOwedBy = (supplierId: string) =>
    intakes
      .filter((r) => r.supplier_id === supplierId)
      .reduce((sum, r) => sum + Number(r.amount_owed), 0);
  const paidTo = (supplierId: string) =>
    payments
      .filter((r) => r.supplier_id === supplierId)
      .reduce((sum, r) => sum + Number(r.amount), 0);
  const netOwedBy = (supplierId: string) => grossOwedBy(supplierId) - paidTo(supplierId);
  const lastConfirmed = (supplierId: string) =>
    reconciliations
      .filter((r) => r.supplier_id === supplierId && r.status === 'confirmed')
      .sort((a, b) => new Date(b.reconciled_at).getTime() - new Date(a.reconciled_at).getTime())[0];

  const q = search.trim().toLowerCase();
  const visibleSuppliers = suppliers.filter((s) => !q || s.name.toLowerCase().includes(q));
  const totalOwed = suppliers.reduce((sum, s) => sum + grossOwedBy(s.id) - paidTo(s.id), 0);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    const { error } = await supabase.from('suppliers').insert({ name: name.trim(), business_id: profile?.business_id });
    if (error) setStatus(`Error: ${error.message}`);
    else {
      setStatus('Supplier added.');
      setName('');
      refresh();
    }
  }

  async function handlePay(e: FormEvent, supplierId: string) {
    e.preventDefault();
    e.stopPropagation();
    setPayBusy(true);
    setStatus(null);
    const amount = Number(payAmt);
    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus('Enter a valid payment amount.');
      setPayBusy(false);
      return;
    }
    const { error } = await supabase.from('supplier_payments').insert([
      {
        supplier_id: supplierId,
        amount,
        note: payNote.trim() || null,
        paid_at: new Date().toISOString(),
        created_by: authUserId ?? undefined,
      },
    ]);
    setPayBusy(false);
    if (error) setStatus(`Payment not recorded: ${error.message}`);
    else {
      setStatus('Payment recorded and logged.');
      setPayAmt('');
      setPayNote('');
      refresh();
    }
  }

  async function handleConfirm(supplierId: string) {
    setStatus(null);
    const { error } = await supabase.from('supplier_reconciliations').insert([
      {
        supplier_id: supplierId,
        status: 'confirmed',
        note: null,
        reconciled_at: new Date().toISOString(),
        created_by: authUserId ?? undefined,
      },
    ]);
    if (error) setStatus(`Could not confirm: ${error.message}`);
    else {
      setStatus('Balance confirmed. The confirmation is on record and in the audit log.');
      refresh();
    }
  }

  return (
    <DashboardLayout>
      <BackButton />
      <h1 className="page-title mb-1">Suppliers</h1>
      <p className="page-sub mb-3">Ledger balances, payments and reconciliation — all derived, never hand-held.</p>

      <div className="grid gap-3 lg:grid-cols-2 max-w-5xl">
        <form onSubmit={handleAdd} className="card p-4 space-y-2 h-fit">
          <p className="text-sm text-gray-500">
            Net owed across all suppliers (intake owed minus payments recorded):{' '}
            <span className="font-semibold text-gray-900">
              {totalOwed > 0 ? formatGHS(totalOwed) : 'nothing — all settled'}
            </span>
          </p>
          <label className="label">Add a supplier</label>
          <input
            required value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Supplier name"
            className="input w-full"
          />
          {status && <p className="text-sm">{status}</p>}
          <button type="submit" className="btn btn-primary w-full">
            Add supplier
          </button>
        </form>

        <div className="card overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-500">Suppliers ({visibleSuppliers.length}{search ? ` of ${suppliers.length}` : ''})</p>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a supplier…"
              className="input w-full mt-2"
            />
          </div>
          {visibleSuppliers.length === 0 ? (
            <p className="p-4 text-gray-500 text-sm">{search ? 'No suppliers match that name.' : 'No suppliers yet.'}</p>
          ) : (
            <ul className="divide-y">
              {visibleSuppliers.map((s) => {
                const gross = grossOwedBy(s.id);
                const paid = paidTo(s.id);
                const net = netOwedBy(s.id);
                const confirmed = lastConfirmed(s.id);
                const isOpen = openSupplier === s.id;
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => setOpenSupplier(isOpen ? null : s.id)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 text-left"
                    >
                      <span className="font-medium">{s.name}</span>
                      <span className="flex items-center gap-2">
                        {confirmed && (
                          <span className="tag" title={`Balance confirmed ${new Date(confirmed.reconciled_at).toLocaleString()} by ${confirmed.created_by === authUserId ? 'you' : 'the owner'}`}>
                            reconciled
                          </span>
                        )}
                        <span className={`text-sm ${net > 0 ? 'font-medium text-gray-900' : net < 0 ? 'text-gray-400' : 'text-gray-400'}`}>
                          {net > 0 ? formatGHS(net) + ' owed' : net < 0 ? `${formatGHS(Math.abs(net))} in credit` : paid > 0 ? 'settled' : 'nothing owed'}
                        </span>
                      </span>
                    </button>
                    {isOpen && (
                      <div className="border-t bg-gray-50 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm mb-3">
                          <p>Owed (intake): <span className="font-medium">{formatGHS(gross)}</span></p>
                          <p>Paid: <span className="font-medium">{formatGHS(paid)}</span></p>
                          <p>Net balance: <span className="font-medium">{net > 0 ? formatGHS(net) : paid > 0 ? 'settled' : 'nothing owed'}</span></p>
                          {confirmed ? (
                            <p className="text-gray-500">Reconciled {new Date(confirmed.reconciled_at).toLocaleString()}</p>
                          ) : (
                            <p className="text-gray-400">Not reconciled yet</p>
                          )}
                        </div>

                        <form onSubmit={(e) => handlePay(e, s.id)} className="flex flex-wrap gap-2 items-end mb-3">
                          <label className="block w-full sm:w-36">
                            <span className="block text-[11px] text-gray-500 mb-0.5">Record a payment (GHS)</span>
                            <input type="number" min="0" step="any" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} className="input w-full" />
                          </label>
                          <label className="block flex-1 min-w-[10rem]">
                            <span className="block text-[11px] text-gray-500 mb-0.5">Note</span>
                            <input type="text" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="e.g. part payment" className="input w-full" />
                          </label>
                          <button type="submit" disabled={payBusy} className="btn btn-primary">
                            Record payment
                          </button>
                          {isOwner && (
                            <button
                              type="button"
                              onClick={() => handleConfirm(s.id)}
                              disabled={!!confirmed}
                              className="btn btn-outline"
                              title="Owner only"
                            >
                              {confirmed ? 'Balance confirmed' : (net <= 0 ? 'Confirm balance — settled' : 'Confirm balance owed')}
                            </button>
                          )}
                        </form>

                        {intakes.filter((r) => r.supplier_id === s.id).length === 0 && payments.filter((r) => r.supplier_id === s.id).length === 0 ? (
                          <p className="text-sm text-gray-500">No intake or payment history.</p>
                        ) : (
                          <ul className="divide-y">
                            {intakes
                              .filter((r) => r.supplier_id === s.id)
                              .map((r) => (
                                <li key={r.id} className="py-2 text-sm flex items-center justify-between">
                                  <div>
                                    <p className="font-medium">{productName(r.product_id)}</p>
                                    <p className="text-gray-500">{new Date(r.created_at).toLocaleDateString()}</p>
                                  </div>
                                  <div className="text-right">
                                    <p>{formatGHS(r.cost_price_total)}</p>
                                    {Number(r.amount_owed) > 0 ? (
                                      <p className="font-medium text-gray-800">owe {formatGHS(r.amount_owed)}</p>
                                    ) : (
                                      <p className="text-gray-400">paid in full</p>
                                    )}
                                  </div>
                                </li>
                              ))}
                            {payments
                              .filter((r) => r.supplier_id === s.id)
                              .map((r) => (
                                <li key={r.id} className="py-2 text-sm flex items-center justify-between">
                                  <div>
                                    <p className="font-medium text-gray-800">Payment {formatGHS(r.amount)}</p>
                                    <p className="text-gray-500">
                                      {new Date(r.paid_at).toLocaleString()}
                                      {r.note ? ` · ${r.note}` : ''}
                                    </p>
                                  </div>
                                </li>
                              ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}