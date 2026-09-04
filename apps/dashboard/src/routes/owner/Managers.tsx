import { useEffect, useState, useCallback } from 'react';
import BackButton from '../../components/BackButton';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Branch } from '@branchport/shared';

interface AssignedManager {
  manager_user_id: string;
  manager_name: string;
  manager_phone: string | null;
  branch_id: string | null;
  assigned_at: string;
}

export default function Managers() {
  const { profile } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [assignedManagers, setAssignedManagers] = useState<AssignedManager[]>([]);

  // --- Create new manager form ---
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [newBranch, setNewBranch] = useState('');
  const [newError, setNewError] = useState<string | null>(null);
  const [newLoading, setNewLoading] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  // --- Assign existing member form ---
  const [existingPhone, setExistingPhone] = useState('');
  const [existingBranch, setExistingBranch] = useState('');
  const [existingError, setExistingError] = useState<string | null>(null);
  const [existingSuccess, setExistingSuccess] = useState(false);
  const [existingLoading, setExistingLoading] = useState(false);

  // --- Self-assign state ---
  const [selfAssignLoading, setSelfAssignLoading] = useState(false);
  const [selfAssignError, setSelfAssignError] = useState<string | null>(null);
  const [selfAssignSuccess, setSelfAssignSuccess] = useState(false);

  const isSelfAssigned = assignedManagers.some((a) => a.manager_user_id === profile?.id);

  // Load branches and assigned managers
  const loadData = useCallback(async () => {
    if (!profile?.business_id) return;

    const [branchesRes, managersRes] = await Promise.allSettled([
      supabase.from('branches').select('*').eq('business_id', profile.business_id),
      supabase.from('users').select('*').eq('business_id', profile.business_id).eq('role', 'manager'),
    ]);

    if (branchesRes.status === 'fulfilled' && branchesRes.value.data) {
      setBranches(branchesRes.value.data as Branch[]);
    }

    if (managersRes.status === 'fulfilled' && managersRes.value.data) {
      const rows = managersRes.value.data as any[];
      setAssignedManagers(
        rows.map((r) => ({
          manager_user_id: r.id,
          manager_name: r.name,
          manager_phone: r.phone,
          branch_id: r.branch_id,
          assigned_at: r.created_at,
        }))
      );
    }
  }, [profile?.business_id, profile?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Generate a random password
  function genPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  async function handleCreateManager() {
    setNewError(null);
    setGeneratedPassword(null);
    if (!newPhone.trim() || !newName.trim()) {
      setNewError('Phone and name are required.');
      return;
    }
    if (!profile?.business_id) {
      setNewError('Business not set up yet.');
      return;
    }
    setNewLoading(true);

    try {
      const password = genPassword();
      const cleanPhone = newPhone.replace(/\s+/g, '').replace(/[^+\d]/g, '');
      const email = `${cleanPhone}@branchport.app`;

      // Create auth user
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name: newName.trim(), phone: cleanPhone },
          emailRedirectTo: window.location.origin,
        },
      });

      if (authErr) {
        setNewLoading(false);
        setNewError(authErr.message.includes('already') ? 'This phone is already registered.' : authErr.message);
        return;
      }

      if (!authData.user) {
        setNewLoading(false);
        setNewError('Failed to create account.');
        return;
      }

      // Create user record
      const { error: userErr } = await supabase.from('users').insert({
        id: authData.user.id,
        business_id: profile.business_id,
        branch_id: newBranch || null,
        role: 'manager',
        name: newName.trim(),
        phone: cleanPhone,
      });

      if (userErr) {
        console.error('Failed to create manager user record:', userErr.message);
      }

      setNewLoading(false);
      setGeneratedPassword(password);
      setNewPhone('');
      setNewName('');
      setNewBranch('');
      loadData();
    } catch (err) {
      setNewLoading(false);
      setNewError('Something went wrong. Please try again.');
      console.error(err);
    }
  }

  async function handleAssignExisting() {
    setExistingError(null);
    setExistingSuccess(false);
    if (!existingPhone.trim()) {
      setExistingError('Phone number is required.');
      return;
    }
    if (!profile?.business_id) {
      setExistingError('Business not set up yet.');
      return;
    }
    setExistingLoading(true);

    try {
      const cleanPhone = existingPhone.replace(/\s+/g, '').replace(/[^+\d]/g, '');

      // Find user by phone
      const { data: userData, error: userErr } = await supabase
        .from('users')
        .select('*')
        .eq('phone', cleanPhone)
        .eq('business_id', profile.business_id)
        .single();

      if (userErr || !userData) {
        setExistingLoading(false);
        setExistingError('No user found with this phone number in your business.');
        return;
      }

      // Update role to manager
      const { error: updateErr } = await supabase
        .from('users')
        .update({ role: 'manager', branch_id: existingBranch || userData.branch_id })
        .eq('id', userData.id);

      if (updateErr) {
        setExistingLoading(false);
        setExistingError('Failed to assign manager role.');
        return;
      }

      setExistingLoading(false);
      setExistingSuccess(true);
      setExistingPhone('');
      setExistingBranch('');
      loadData();
      setTimeout(() => setExistingSuccess(false), 3000);
    } catch (err) {
      setExistingLoading(false);
      setExistingError('Something went wrong.');
      console.error(err);
    }
  }

  async function handleSelfAssign() {
    setSelfAssignError(null);
    setSelfAssignSuccess(false);
    if (!profile?.id || !profile?.business_id) {
      setSelfAssignError('Profile not loaded yet.');
      return;
    }
    setSelfAssignLoading(true);

    try {
      const { error } = await supabase
        .from('users')
        .update({ role: 'manager' })
        .eq('id', profile.id);

      if (error) {
        setSelfAssignLoading(false);
        setSelfAssignError('Failed to assign: ' + error.message);
        return;
      }

      setSelfAssignLoading(false);
      setSelfAssignSuccess(true);
      loadData();
      setTimeout(() => setSelfAssignSuccess(false), 3000);
    } catch (err) {
      setSelfAssignLoading(false);
      setSelfAssignError('Something went wrong.');
    }
  }

  async function handleRemove(managerId: string) {
    try {
      await supabase
        .from('users')
        .update({ role: 'staff' })
        .eq('id', managerId);
      loadData();
    } catch (err) {
      console.error('Failed to remove manager:', err);
    }
  }

  const branchNameOf = (id: string | null) => branches.find((b) => b.id === id)?.name ?? 'All branches';

  return (
    <DashboardLayout>
      <BackButton />
      <h1 className="page-title mb-1">Assign managers</h1>
      <p className="page-sub mb-6">
        Add team members as managers so they can run the dashboard, POS and supplier ledger on your behalf.
      </p>

      {/* ── Self-assign card ── */}
      {!isSelfAssigned && (
        <div className="card p-5 border-l-4 border-l-purple-500 mb-6 max-w-5xl bg-purple-50/50">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">Run the store yourself?</p>
              <p className="text-xs text-gray-500 mt-1">
                Assign yourself as a manager to get full access to the POS, stock allocation, and all manager features.
              </p>
            </div>
            <button
              onClick={handleSelfAssign}
              disabled={selfAssignLoading}
              className="btn btn-primary shrink-0"
            >
              {selfAssignLoading ? 'Assigning…' : 'Self-assign as manager'}
            </button>
          </div>
          {selfAssignError && <p className="text-sm text-red-800 mt-2">{selfAssignError}</p>}
          {selfAssignSuccess && <p className="text-sm text-green-800 mt-2">✓ You are now also a manager! Full access enabled.</p>}
        </div>
      )}

      {isSelfAssigned && (
        <div className="card p-4 border-l-4 border-l-green-500 mb-6 max-w-5xl bg-green-50/50">
          <p className="text-sm font-medium text-green-800">✓ You are assigned as a manager — you have full access to all features.</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2 max-w-5xl">
        {/* ── Create new manager ─────────────────────── */}
        <div className="card p-6 space-y-4 h-fit">
          <p className="text-sm font-medium text-gray-700">Create a new manager</p>
          <p className="text-sm text-gray-500">
            Creates an account with an auto-generated password. Show the password to the manager once — they'll need it to log in.
          </p>

          {newError && <p className="text-sm text-red-800">{newError}</p>}

          {generatedPassword && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 space-y-2">
              <p className="text-sm font-medium text-green-900">Account created!</p>
              <p className="text-xs text-green-700">Share this password with the manager. It won't be shown again.</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white px-3 py-2 rounded border border-green-200 text-sm font-mono text-green-900">
                  {generatedPassword}
                </code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(generatedPassword)}
                  className="btn btn-outline text-xs px-2 py-1"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="label">Full name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Manager's full name"
              disabled={newLoading}
              className="input w-full"
            />
          </div>

          <div>
            <label className="label">Phone number</label>
            <input
              type="tel"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="054 354 7819"
              disabled={newLoading}
              className="input w-full"
            />
          </div>

          {branches.length > 0 && (
            <div>
              <label className="label">Assign to branch (optional)</label>
              <select
                value={newBranch}
                onChange={(e) => setNewBranch(e.target.value)}
                disabled={newLoading}
                className="select w-full"
              >
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handleCreateManager}
            disabled={newLoading}
            className="btn btn-primary w-full"
          >
            {newLoading ? 'Creating…' : 'Create manager account'}
          </button>
        </div>

        {/* ── Assign existing member ─────────────────── */}
        <div className="card p-6 space-y-4 h-fit">
          <p className="text-sm font-medium text-gray-700">Add an existing member</p>
          <p className="text-sm text-gray-500">
            The person must already have a BranchPort account — find them by phone number.
          </p>

          {existingError && <p className="text-sm text-red-800">{existingError}</p>}
          {existingSuccess && <p className="text-sm text-green-800">Manager assigned successfully!</p>}

          <div>
            <label className="label">Phone number</label>
            <input
              type="tel"
              value={existingPhone}
              onChange={(e) => setExistingPhone(e.target.value)}
              placeholder="054 354 7819"
              disabled={existingLoading}
              className="input w-full"
            />
          </div>

          {branches.length > 0 && (
            <div>
              <label className="label">Assign to branch (optional)</label>
              <select
                value={existingBranch}
                onChange={(e) => setExistingBranch(e.target.value)}
                disabled={existingLoading}
                className="select w-full"
              >
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handleAssignExisting}
            disabled={existingLoading}
            className="btn btn-primary w-full"
          >
            {existingLoading ? 'Assigning…' : 'Assign as manager'}
          </button>
        </div>

        {/* ── Assigned managers list ─────────────────── */}
        <div className="card overflow-hidden h-fit lg:col-span-2">
          <p className="card-header">Your managers ({assignedManagers.length})</p>
          {assignedManagers.length === 0 ? (
            <p className="p-6 text-gray-500 text-sm">No managers assigned yet. Create or add one to get started.</p>
          ) : (
            <ul className="divide-y">
              {assignedManagers.map((manager) => {
                const isSelf = manager.manager_user_id === profile?.id;
                return (
                  <li key={manager.manager_user_id} className="px-5 py-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{manager.manager_name}</p>
                        {isSelf && (
                          <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-semibold">
                            You (owner)
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">{manager.manager_phone || '—'}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Branch: {branchNameOf(manager.branch_id)} · Assigned {new Date(manager.assigned_at).toLocaleDateString()}
                      </p>
                    </div>
                    {!isSelf && (
                      <button
                        onClick={() => handleRemove(manager.manager_user_id)}
                        className="btn btn-outline shrink-0"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-8 max-w-5xl rounded-2xl border border-gray-200/80 bg-gray-50 p-6">
        <p className="text-sm font-medium text-gray-700 mb-2">How it works</p>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
          <li>You can assign yourself as a manager to get full POS and stock allocation access.</li>
          <li>Managers you assign can access the same dashboard features as you — every branch, live.</li>
          <li>Assign different managers to different branches for store-level control.</li>
          <li>All changes they make are reflected instantly, and the audit log keeps the owner's record.</li>
          <li>You keep full visibility and can remove them any time.</li>
        </ul>
      </div>
    </DashboardLayout>
  );
}
