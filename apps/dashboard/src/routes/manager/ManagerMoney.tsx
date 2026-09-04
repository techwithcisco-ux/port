import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { startOfMonth } from '../../lib/utils';

type MoneyTab = 'overview' | 'sales' | 'expenses' | 'debts';

export default function ManagerMoney() {
  const [tab, setTab] = useState<MoneyTab>('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

  return (
    <DashboardLayout>
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-gray-900">Money</h1>
        <p className="text-sm text-gray-500 mt-1">Sales, expenses, profit, and debts.</p>
      </div>

      {/* Tab selector */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {([
          { key: 'overview', label: 'Overview' },
          { key: 'sales', label: 'Sales Report' },
          { key: 'expenses', label: 'Expenses' },
          { key: 'debts', label: 'Debts' },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Link
            to="/manager/sales-report"
            className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all"
          >
            <span className="text-2xl block mb-2">📊</span>
            <span className="text-sm font-medium text-gray-900">Sales Report</span>
          </Link>
          <Link
            to="/manager/profit-loss"
            className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all"
          >
            <span className="text-2xl block mb-2">💰</span>
            <span className="text-sm font-medium text-gray-900">Profit & Loss</span>
          </Link>
          <Link
            to="/manager/expenses"
            className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all"
          >
            <span className="text-2xl block mb-2">💸</span>
            <span className="text-sm font-medium text-gray-900">Expenses</span>
          </Link>
          <Link
            to="/manager/ledger"
            className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all"
          >
            <span className="text-2xl block mb-2">📝</span>
            <span className="text-sm font-medium text-gray-900">Debtors & Creditors</span>
          </Link>
          <Link
            to="/manager/documents"
            className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all"
          >
            <span className="text-2xl block mb-2">📄</span>
            <span className="text-sm font-medium text-gray-900">Documents</span>
          </Link>
          <Link
            to="/manager/reconciliation"
            className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all"
          >
            <span className="text-2xl block mb-2">🔄</span>
            <span className="text-sm font-medium text-gray-900">Reconciliation</span>
          </Link>
          <Link
            to="/manager/suppliers"
            className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:border-gray-900 transition-all"
          >
            <span className="text-2xl block mb-2">🏭</span>
            <span className="text-sm font-medium text-gray-900">Suppliers</span>
          </Link>
        </div>
      )}

      {tab === 'sales' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Sales Report</h2>
          <p className="text-sm text-gray-500 mb-4">Detailed sales data by date, product, and staff.</p>
          <Link
            to="/manager/sales-report"
            className="inline-block px-6 py-3 rounded-xl bg-gray-900 text-white font-medium"
          >
            View Full Sales Report →
          </Link>
        </div>
      )}

      {tab === 'expenses' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Expenses</h2>
          <p className="text-sm text-gray-500 mb-4">Track and manage business expenses.</p>
          <Link
            to="/manager/expenses"
            className="inline-block px-6 py-3 rounded-xl bg-gray-900 text-white font-medium"
          >
            Manage Expenses →
          </Link>
        </div>
      )}

      {tab === 'debts' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Debtors & Creditors</h2>
          <p className="text-sm text-gray-500 mb-4">Who owes you and who you owe.</p>
          <Link
            to="/manager/ledger"
            className="inline-block px-6 py-3 rounded-xl bg-gray-900 text-white font-medium"
          >
            View Ledger →
          </Link>
        </div>
      )}
    </DashboardLayout>
  );
}
