import { useEffect, useMemo, useState } from 'react';
import BackButton from '../../components/BackButton';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatGHS } from '../../lib/utils';
import type { Expense, ExpensePayment } from '@branchport/shared';
import { EXPENSE_CATEGORY_LABELS } from '@branchport/shared';

type ExpenseCategory = keyof typeof EXPENSE_CATEGORY_LABELS;
type Frequency = 'daily' | 'weekly' | 'monthly' | 'one_off';

const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  one_off: 'One-off',
};

const CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  daily_tax: '🏛️',
  susu: '💰',
  rent: '🏠',
  utilities: '⚡',
  transport: '🚚',
  staff_wages: '👷',
  maintenance: '🔧',
  packaging: '📦',
  advertising: '📣',
  misc: '📋',
};

function ExpenseCard({
  expense,
  payments,
  onPay,
}: {
  expense: Expense;
  payments: ExpensePayment[];
  onPay: (expenseId: string) => void;
}) {
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const lastPayment = payments.sort((a, b) => b.paid_at.localeCompare(a.paid_at))[0];
  const isOverdue = expense.frequency === 'daily' && lastPayment
    ? (Date.now() - new Date(lastPayment.paid_at).getTime()) > 2 * 24 * 60 * 60 * 1000
    : false;

  return (
    <div className={`bg-white border rounded-xl p-4 ${isOverdue ? 'border-red-300 bg-red-50/30' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{CATEGORY_ICONS[expense.category] ?? '📋'}</span>
          <div>
            <p className="text-sm font-medium text-gray-900">{expense.description}</p>
            <p className="text-xs text-gray-500">
              {EXPENSE_CATEGORY_LABELS[expense.category]} · {FREQUENCY_LABELS[expense.frequency]}
            </p>
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          isOverdue ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
        }`}>
          {expense.frequency}
        </span>
      </div>

      <div className="flex items-end justify-between mt-3">
        <div>
          <p className="text-lg font-bold tabular-nums text-gray-900">{formatGHS(expense.amount)}</p>
          <p className="text-xs text-gray-500">
            {payments.length} payment{payments.length !== 1 ? 's' : ''} · Total: {formatGHS(totalPaid)}
          </p>
        </div>
        <button
          onClick={() => onPay(expense.id)}
          className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 transition-colors"
        >
          Pay now
        </button>
      </div>

      {lastPayment && (
        <p className="text-[11px] text-gray-400 mt-2">
          Last paid: {new Date(lastPayment.paid_at).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

export default function Expenses() {
  const { profile } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<ExpensePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>('daily_tax');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('daily');
  const [status, setStatus] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [e, p] = await Promise.allSettled([
        supabase.from('expenses').select('*'),
        supabase.from('expense_payments').select('*'),
      ]);
      setExpenses((e.status === 'fulfilled' ? e.value.data : null as any) ?? []);
      setPayments((p.status === 'fulfilled' ? p.value.data : null as any) ?? []);
    } catch (err) {
      console.error('Failed to load expenses:', err);
    }
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !description.trim() || !amount) return;
    setStatus(null);

    const { error } = await supabase.from('expenses').insert({
      business_id: profile.business_id,
      branch_id: profile.branch_id ?? null,
      category,
      description: description.trim(),
      amount: Number(amount),
      frequency,
      start_date: new Date().toISOString(),
      end_date: null,
      created_by: profile.id,
    });

    if (error) {
      setStatus(`Error: ${error.message}`);
    } else {
      setStatus('Expense created.');
      setDescription('');
      setAmount('');
      setShowForm(false);
      void loadData();
    }
  }

  async function handlePay(expenseId: string) {
    if (!profile) return;
    const expense = expenses.find((e) => e.id === expenseId);
    if (!expense) return;

    const { error } = await supabase.from('expense_payments').insert({
      expense_id: expenseId,
      business_id: expense.business_id,
      amount: expense.amount,
      note: `${expense.description} — paid`,
      created_by: profile.id,
    });

    if (!error) {
      setStatus(`Paid ${formatGHS(expense.amount)} for ${expense.description}`);
      void loadData();
    }
  }

  const filtered = useMemo(() => {
    if (filterCat === 'all') return expenses;
    return expenses.filter((e) => e.category === filterCat);
  }, [expenses, filterCat]);

  const summary = useMemo(() => {
    const totalExpenses = expenses.reduce((s, e) => {
      const ep = payments.filter((p) => p.expense_id === e.id);
      return s + ep.reduce((ps, p) => ps + p.amount, 0);
    }, 0);
    const today = new Date().toISOString().slice(0, 10);
    const todayPaid = payments
      .filter((p) => p.paid_at.slice(0, 10) === today)
      .reduce((s, p) => s + p.amount, 0);
    return { totalExpenses, todayPaid, expenseCount: expenses.length };
  }, [expenses, payments]);

  return (
    <DashboardLayout>
      <BackButton />
      <div>
        <div>
          <h1 className="page-title">Expenses</h1>
          <p className="page-sub">Track daily susu, tax, rent, transport and other recurring costs.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn btn-primary"
        >
          {showForm ? 'Cancel' : '+ New expense'}
        </button>
      </div>

      {status && (
        <div className="mb-4 px-4 py-2 bg-green-50 text-green-800 rounded-lg text-sm">{status}</div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-3 mb-3 max-w-3xl">
        <div className="card p-5">
          <p className="stat-label">Total paid</p>
          <p className="stat-value">{loading ? '…' : formatGHS(summary.totalExpenses)}</p>
        </div>
        <div className="card p-5">
          <p className="stat-label">Today</p>
          <p className="stat-value">{loading ? '…' : formatGHS(summary.todayPaid)}</p>
        </div>
        <div className="card p-5">
          <p className="stat-label">Active expenses</p>
          <p className="stat-value">{loading ? '…' : summary.expenseCount}</p>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="card p-4 max-w-md space-y-2 mb-3">
          <div>
            <label className="label">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              className="select w-full"
            >
              {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{CATEGORY_ICONS[k as ExpenseCategory]} {v}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Daily market levy"
              required
              className="input w-full"
            />
          </div>

          <div>
            <label className="label">Amount (GHS)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="input w-full"
            />
          </div>

          <div>
            <label className="label">Frequency</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {(Object.entries(FREQUENCY_LABELS) as [Frequency, string][]).map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFrequency(k)}
                  className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                    frequency === k
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {status && <p className="text-sm text-red-600">{status}</p>}

          <button type="submit" className="btn btn-primary w-full">
            Create expense
          </button>
        </form>
      )}

      {/* Category filter */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        <button
          onClick={() => setFilterCat('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
            filterCat === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          All ({expenses.length})
        </button>
        {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => {
          const count = expenses.filter((e) => e.category === k).length;
          if (count === 0) return null;
          return (
            <button
              key={k}
              onClick={() => setFilterCat(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                filterCat === k ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {v} ({count})
            </button>
          );
        })}
      </div>

      {/* Expense cards */}
      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 text-sm">No expenses recorded yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((exp) => (
            <ExpenseCard
              key={exp.id}
              expense={exp}
              payments={payments.filter((p) => p.expense_id === exp.id)}
              onPay={handlePay}
            />
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
