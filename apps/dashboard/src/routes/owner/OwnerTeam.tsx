import { useEffect, useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Branch, AppUser } from '@branchport/shared';

interface CreatedStaff {
  name: string;
  phone: string;
  userId: string;
  activationUrl: string;
  branch_id: string;
}

export default function OwnerTeam() {
  const { profile } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [staff, setStaff] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Add staff state
  const [showAdd, setShowAdd] = useState(false);
  const [branchId, setBranchId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedStaff | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editBranchId, setEditBranchId] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Password visibility
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, string>>({});

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Resend link modal
  const [resendUrl, setResendUrl] = useState<string | null>(null);
  const [resendName, setResendName] = useState('');
  const [resendCopied, setResendCopied] = useState(false);

  async function refresh() {
    const [b, u] = await Promise.all([
      supabase.from('branches').select('*'),
      supabase.from('users').select('*').eq('role', 'staff'),
    ]);
    setBranches((b.data as Branch[]) ?? []);
    setStaff((u.data as AppUser[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  const branchNameOf = (id: string | null) => branches.find((b) => b.id === id)?.name ?? '—';

  // ── Add staff ──
  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!branchId || !name.trim() || !phone.trim()) return;
    if (!profile?.business_id) return;
    setBusy(true);
    setError(null);
    setCreated(null);

    // Generate a random password for the staff member
    const pw = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
    const cleanPhone = phone.trim().replace(/\s+/g, '').replace(/[^+\d]/g, '');
    const email = `${cleanPhone}@branchport.app`;

    // 1. Create Supabase auth user
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email,
      password: pw,
      options: { data: { name: name.trim(), phone: cleanPhone, role: 'staff' } },
    });

    if (authErr) {
      setBusy(false);
      if (authErr.message.includes('already registered')) {
        setError('A user with this phone number already exists.');
      } else {
        setError(`Auth error: ${authErr.message}`);
      }
      return;
    }

    if (!authData.user) {
      setBusy(false);
      setError('Failed to create user.');
      return;
    }
    const newUserId = authData.user.id;

    // 2. Create user record via RPC
    const { error: rpcErr } = await supabase.rpc('provision_staff_user', {
      p_auth_user_id: newUserId,
      p_business_id: profile.business_id,
      p_branch_id: branchId,
      p_name: name.trim(),
      p_phone: cleanPhone,
    });

    if (rpcErr) {
      console.warn('provision_staff_user RPC failed:', rpcErr.message);
    }

    setBusy(false);
    const activationUrl = `${window.location.origin}/login?phone=${encodeURIComponent(cleanPhone)}&password=${encodeURIComponent(pw)}`;

    setCreated({
      name: name.trim(),
      phone: cleanPhone,
      userId: newUserId,
      activationUrl,
      branch_id: branchId,
    });
    setVisiblePasswords((prev) => ({ ...prev, [newUserId]: pw }));

    // Auto-open WhatsApp
    setTimeout(() => openWhatsApp(cleanPhone, name.trim(), activationUrl), 300);

    setName('');
    setPhone('');
    refresh();
  }

  function openWhatsApp(phone: string, name: string, url: string) {
    const clean = phone.replace(/s+/g, '').replace(/[^+\d]/g, '');
    const full = clean.startsWith('+') ? clean.slice(1) : clean.startsWith('0') ? '233' + clean.slice(1) : clean;
    const msg = `Hi ${name}, you've been added to BranchPort POS!\n\nTap the link to activate your POS access:\n${url}\n\nAfter activating, sign in with your phone number — no password needed.`;
    window.open(`https://wa.me/${full}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  }

  function copyLink(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  // ── Edit ──
  function startEdit(s: AppUser) {
    setEditingId(s.id);
    setEditName(s.name);
    setEditPhone(s.phone ?? '');
    setEditBranchId(s.branch_id ?? '');
    setEditError(null);
  }

  async function saveEdit() {
    if (!editingId || !editName.trim() || !editPhone.trim()) return;
    setEditBusy(true);
    setEditError(null);
    const { error } = await supabase.from('users').update({
      name: editName.trim(),
      phone: editPhone.trim(),
      branch_id: editBranchId || null,
    }).eq('id', editingId);
    setEditBusy(false);
    if (error) { setEditError(error.message); return; }
    setEditingId(null);
    refresh();
  }

  // ── Delete ──
  function confirmDelete(s: AppUser) { setDeletingId(s.id); }
  function cancelDelete() { setDeletingId(null); }
  async function handleDelete() {
    if (!deletingId) return;
    await supabase.from('users').delete().eq('id', deletingId);
    setDeletingId(null);
    refresh();
  }

  // ── Password toggle ──
  function togglePassword(userId: string) {
    setVisiblePasswords((prev) => {
      const n = { ...prev };
      if (n[userId]) delete n[userId];
      return n;
    });
  }

  // ── Resend link ──
  function handleResend(s: AppUser) {
    const cleanPhone = (s.phone ?? '').replace(/\s+/g, '').replace(/[^+\d]/g, '');
    const url = `${window.location.origin}/login?phone=${encodeURIComponent(cleanPhone)}&password=contact-admin`;
    setResendUrl(url);
    setResendName(s.name);
    setResendCopied(false);
  }
  function closeResend() { setResendUrl(null); setResendName(''); }

  if (loading) {
    return <DashboardLayout><p className="text-gray-500 py-8">Loading team…</p></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="mb-3">
        <h1 className="page-title">Team</h1>
        <p className="page-sub mt-1">Your staff members — connected to branches. Stock allocated to a branch shows on that staff member's POS.</p>
      </div>

      {/* ── Quick actions ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <Link
          to="/owner/managers"
          className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center gap-3 hover:border-gray-900 transition-all"
        >
          <span className="text-3xl">👔</span>
          <div>
            <p className="text-sm font-semibold text-gray-900">Assign Managers</p>
            <p className="text-xs text-gray-500 mt-0.5">Give manager access to trusted people</p>
          </div>
        </Link>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
        <div className="card p-4">
          <p className="stat-label">Staff members</p>
          <p className="stat-value">{staff.length}</p>
        </div>
        <div className="card p-4">
          <p className="stat-label">Branches</p>
          <p className="stat-value">{branches.length}</p>
        </div>
        <div className="card p-4">
          <p className="stat-label">Activated</p>
          <p className="stat-value">{staff.filter((s) => s.pos_activated).length}</p>
        </div>
      </div>

      {/* ── Add Staff button ── */}
      {!showAdd ? (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full card p-4 flex items-center gap-3 hover:border-gray-900 transition-all mb-3"
        >
          <span className="h-10 w-10 rounded-xl bg-gray-900 text-white grid place-items-center text-lg">+</span>
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-900">Add staff member</p>
            <p className="text-xs text-gray-500">Create account and send activation link</p>
          </div>
        </button>
      ) : (
        <form onSubmit={handleAdd} className="card p-4 space-y-2 mb-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-gray-900">New staff member</p>
            <button type="button" onClick={() => { setShowAdd(false); setError(null); }} className="text-xs text-gray-400 hover:text-gray-600">✕ Cancel</button>
          </div>
          <div>
            <label className="label">Branch *</label>
            <select required value={branchId} onChange={(e) => setBranchId(e.target.value)} className="select w-full">
              <option value="" disabled>Select branch</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {branches.length === 0 && <p className="text-xs text-amber-600 mt-1">No branches yet — <Link to="/owner/stores" className="underline">create one first</Link></p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Full name *</label>
              <input required value={name} onChange={(e) => setName(e.target.value)} className="input w-full" placeholder="Adele Addo" />
            </div>
            <div>
              <label className="label">Phone number *</label>
              <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="input w-full" placeholder="+233 20 555 6666" />
            </div>
          </div>
          {error && <p className="text-sm text-red-800">{error}</p>}
          <button type="submit" disabled={busy || branches.length === 0} className="btn btn-primary w-full">
            {busy ? 'Creating…' : 'Create & send activation link'}
          </button>
        </form>
      )}

      {/* ── Staff list ── */}
      <div className="card overflow-hidden mb-3">
        <div className="card-header flex items-center justify-between">
          <span>Staff ({staff.length})</span>
          <Link to="/manager/staff" className="text-xs text-gray-500 hover:text-gray-900">Advanced view →</Link>
        </div>
        {staff.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <p className="text-3xl mb-2">👥</p>
            <p className="text-sm">No staff yet. Tap "+ Add staff member" above.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {staff.map((s) => {
              const isEditing = editingId === s.id;
              const isDeleting = deletingId === s.id;
              const pw = visiblePasswords[s.id] ?? null;

              return (
                <li key={s.id} className="px-5 py-4">
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="label">Name</label>
                          <input value={editName} onChange={(e) => setEditName(e.target.value)} className="input w-full" />
                        </div>
                        <div>
                          <label className="label">Phone</label>
                          <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="input w-full" />
                        </div>
                        <div>
                          <label className="label">Branch</label>
                          <select value={editBranchId} onChange={(e) => setEditBranchId(e.target.value)} className="select w-full">
                            <option value="">No branch</option>
                            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                          </select>
                        </div>
                      </div>
                      {editError && <p className="text-xs text-red-600">{editError}</p>}
                      <div className="flex gap-2">
                        <button onClick={saveEdit} disabled={editBusy} className="btn btn-primary btn-sm flex-1">{editBusy ? 'Saving…' : 'Save'}</button>
                        <button onClick={() => setEditingId(null)} className="btn btn-outline btn-sm">Cancel</button>
                      </div>
                    </div>
                  ) : isDeleting ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm font-medium text-red-800 mb-1">Delete {s.name}'s account?</p>
                      <p className="text-xs text-red-600 mb-3">This cannot be undone.</p>
                      <div className="flex gap-2">
                        <button onClick={handleDelete} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-xs font-medium">Yes, delete</button>
                        <button onClick={cancelDelete} className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="font-medium truncate">{s.name}</p>
                          {s.pos_activated ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Active</span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Pending</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button onClick={() => handleResend(s)} className="text-[11px] px-2 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium" title="Resend link">🔗</button>
                          <button onClick={() => startEdit(s)} className="text-[11px] px-2 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium">✏️</button>
                          <button onClick={() => confirmDelete(s)} className="text-[11px] px-2 py-1 rounded-md bg-red-50 text-red-600 hover:bg-red-100 font-medium">🗑</button>
                        </div>
                      </div>
                      <p className="text-sm text-gray-500">{s.phone || '—'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">🏪 {branchNameOf(s.branch_id)}</p>
                      {pw && (
                        <div className="flex items-center gap-2 mt-2 bg-gray-50 rounded-lg px-3 py-1.5">
                          <span className="text-[10px] text-gray-400">Password:</span>
                          <code className="flex-1 text-xs font-mono font-semibold text-gray-700 select-all">{pw}</code>
                          <button onClick={() => togglePassword(s.id)} className="text-[10px] font-medium text-gray-500 hover:text-gray-800 underline">
                            {pw ? 'Hide' : 'Show'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── How it works ── */}
      <div className="rounded-2xl border border-gray-200/80 bg-gray-50 p-5">
        <p className="text-sm font-medium text-gray-700 mb-2">How it works</p>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
          <li>Create a staff member and assign them to a branch.</li>
          <li>WhatsApp opens automatically with the activation link — send it to them.</li>
          <li>They tap the link → account activated → they sign in with their phone number.</li>
          <li>Stock you allocate to their branch shows on their POS automatically.</li>
          <li>Use 🔗 to resend the link, ✏️ to edit, 🗑 to delete.</li>
        </ul>
      </div>

      {/* ── Resend modal ── */}
      {(created || resendUrl) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setCreated(null); closeResend(); }} />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-sm w-full p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">
                {created ? `Account created for ${created.name}` : `Activation link for ${resendName}`}
              </h3>
              <button onClick={() => { setCreated(null); closeResend(); }} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            {created && (
              <div className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-[10px] text-gray-400 mb-1">Password</p>
                <code className="text-sm font-mono font-bold text-gray-900 select-all">{visiblePasswords[created.userId] ?? '••••••••'}</code>
              </div>
            )}
            <div className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-[10px] text-gray-400 mb-1">Activation link</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] font-mono text-gray-700 truncate select-all">{created?.activationUrl ?? resendUrl}</code>
                <button onClick={() => { navigator.clipboard.writeText(created?.activationUrl ?? resendUrl ?? ''); setLinkCopied(true); setResendCopied(true); setTimeout(() => { setLinkCopied(false); setResendCopied(false); }, 2000); }} className="text-[11px] font-medium text-gray-500 hover:text-gray-800 underline shrink-0">
                  {(created && linkCopied) || (!created && resendCopied) ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <button
              onClick={() => openWhatsApp(created?.phone ?? '', created?.name ?? resendName, created?.activationUrl ?? resendUrl ?? '')}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1da851] transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Send via WhatsApp
            </button>
            <button onClick={() => { setCreated(null); closeResend(); }} className="w-full text-center text-xs text-gray-400 hover:text-gray-600 py-1">Close</button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
