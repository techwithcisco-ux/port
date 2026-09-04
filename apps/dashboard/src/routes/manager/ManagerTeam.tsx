import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import type { Branch } from '@branchport/shared';

export default function ManagerTeam() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from('branches').select('*');
      if (!error) setBranches((data as Branch[]) ?? []);
      setLoading(false);
    }
    void load();
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
        <p className="text-gray-500 py-8">Loading team…</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Team</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your staff.</p>
      </div>

      {/* Staff invite */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Invite Staff</h2>
        <p className="text-sm text-gray-500 mb-4">Add new staff members to your branches.</p>
        <Link
          to="/manager/staff"
          className="inline-block px-6 py-3 rounded-xl bg-gray-900 text-white font-medium"
        >
          Go to Staff Invites →
        </Link>
      </div>

      {/* Branches */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Your Branches</h2>
        {branches.length === 0 ? (
          <p className="text-sm text-gray-400">No branches set up yet.</p>
        ) : (
          <div className="space-y-3">
            {branches.map((b) => (
              <div key={b.id} className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
                <span className="text-2xl">🏪</span>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{b.name}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
