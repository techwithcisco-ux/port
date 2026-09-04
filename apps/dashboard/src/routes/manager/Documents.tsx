import { useEffect, useMemo, useState } from 'react';
import BackButton from '../../components/BackButton';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { formatGHS, startOfWeek, startOfMonth } from '../../lib/utils';
import type { Invoice } from '@branchport/shared';

type Tab = 'receipts' | 'invoices';

const PERIODS: Array<{ key: string; label: string; from: () => string }> = [
  { key: 'today', label: 'Today', from: () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); } },
  { key: 'week', label: 'This Week', from: startOfWeek },
  { key: 'month', label: 'This Month', from: startOfMonth },
  { key: 'all', label: 'All Time', from: () => '2000-01-01T00:00:00.000Z' },
];

function ReceiptPrintView({ invoice }: { invoice: Invoice }) {
  const items = (invoice.items ?? []) as Array<{ product_name: string; quantity: number; unit_price: number; total: number; variant_name?: string }>;
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-md mx-auto print:shadow-none print:border-0">
      {/* Header */}
      <div className="text-center mb-6 border-b border-dashed border-gray-300 pb-4">
        <p className="text-lg font-bold text-gray-900">BranchPort</p>
        <p className="text-xs text-gray-500 mt-1">Sales Receipt</p>
        <p className="text-xs text-gray-400 mt-0.5">{invoice.invoice_number}</p>
      </div>

      {/* Date & customer */}
      <div className="flex justify-between text-xs text-gray-500 mb-4">
        <span>{new Date(invoice.created_at).toLocaleString()}</span>
        {invoice.customer_name && <span>{invoice.customer_name}</span>}
      </div>

      {/* Items */}
      <div className="space-y-2 mb-4">
        {items.map((item, i) => (
          <div key={i} className="flex justify-between text-sm">
            <div className="flex-1">
              <span className="text-gray-900">{item.product_name}</span>
              {item.variant_name && <span className="text-gray-400 text-xs"> ({item.variant_name})</span>}
              <span className="text-gray-400 text-xs"> × {item.quantity}</span>
            </div>
            <span className="font-medium tabular-nums ml-3">{formatGHS(item.total)}</span>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="border-t border-dashed border-gray-300 pt-3 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Subtotal</span>
          <span className="tabular-nums">{formatGHS(invoice.subtotal)}</span>
        </div>
        {invoice.tax_amount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Tax ({invoice.tax_rate}%)</span>
            <span className="tabular-nums">{formatGHS(invoice.tax_amount)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-200">
          <span>Total</span>
          <span className="tabular-nums">{formatGHS(invoice.grand_total)}</span>
        </div>
      </div>

      {/* Payment */}
      <div className="mt-4 bg-gray-50 rounded-xl p-3 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Paid</span>
          <span className="font-medium text-green-600 tabular-nums">{formatGHS(invoice.amount_paid)}</span>
        </div>
        {invoice.amount_owed > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Owed</span>
            <span className="font-medium text-amber-600 tabular-nums">{formatGHS(invoice.amount_owed)}</span>
          </div>
        )}
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Method</span>
          <span className="text-gray-600 capitalize">{invoice.payment_mode}</span>
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-xs text-gray-400 mt-6 border-t border-dashed border-gray-300 pt-3">
        Thank you for your purchase! 🙏
      </p>
    </div>
  );
}

export default function Documents() {
  const [tab, setTab] = useState<Tab>('receipts');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadInvoices();
  }, [period]);

  async function loadInvoices() {
    setLoading(true);
    try {
      const found = PERIODS.find((p) => p.key === period);
      const from = found ? found.from() : '';
      let q = supabase.from('invoices').select('*').order('created_at', { ascending: false });
      if (from) q = q.gte('created_at', from);
      const { data } = await q;
      setInvoices((data as Invoice[]) ?? []);
    } catch (err) {
      console.error('Failed to load invoices:', err);
    }
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return invoices;
    const s = search.toLowerCase();
    return invoices.filter(
      (inv) =>
        inv.invoice_number.toLowerCase().includes(s) ||
        (inv.customer_name ?? '').toLowerCase().includes(s) ||
        inv.payment_mode.toLowerCase().includes(s)
    );
  }, [invoices, search]);

  const selected = invoices.find((i) => i.id === selectedId);

  const summary = useMemo(() => ({
    total: invoices.length,
    completed: invoices.filter((i) => i.status === 'completed').length,
    pending: invoices.filter((i) => i.status === 'pending').length,
    revenue: invoices.reduce((s, i) => s + Number(i.grand_total), 0),
  }), [invoices]);

  function handlePrint() {
    window.print();
  }

  return (
    <DashboardLayout>
      <BackButton />
      <div className="no-print">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="page-title">📄 Documents</h1>
            <p className="page-sub">Sales receipts and invoices — view, print, or share.</p>
          </div>
        </div>

        {/* Period tabs */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                period === p.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <p className="text-xs font-medium text-gray-500 uppercase">Total</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{summary.total}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
            <p className="text-xs font-medium text-green-600 uppercase">Completed</p>
            <p className="text-2xl font-bold text-green-700 mt-1">{summary.completed}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-xs font-medium text-amber-600 uppercase">Pending</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{summary.pending}</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
            <p className="text-xs font-medium text-blue-600 uppercase">Revenue</p>
            <p className="text-2xl font-bold text-blue-700 mt-1">{formatGHS(summary.revenue)}</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by receipt number, customer name..."
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:border-gray-900"
          />
        </div>
      </div>

      {/* Selected receipt — print view */}
      {selected && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4 no-print">
            <button
              onClick={() => setSelectedId(null)}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
            >
              ← Back to list
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800"
            >
              🖨️ Print Receipt
            </button>
          </div>
          <ReceiptPrintView invoice={selected} />
        </div>
      )}

      {/* Receipt list */}
      {!selected && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {loading ? (
            <p className="p-6 text-gray-500 text-sm">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-gray-500 text-sm">No receipts found.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtered.map((inv) => (
                <button
                  key={inv.id}
                  onClick={() => setSelectedId(inv.id)}
                  className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{inv.invoice_number}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        inv.status === 'completed' ? 'bg-green-100 text-green-700' :
                        inv.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {inv.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {inv.customer_name || 'Walk-in customer'} · {new Date(inv.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm font-bold tabular-nums text-gray-900">{formatGHS(inv.grand_total)}</p>
                    <p className="text-[11px] text-gray-400 capitalize">{inv.payment_mode}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
