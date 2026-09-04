import { useEffect, useState, FormEvent } from 'react';
import BackButton from '../../components/BackButton';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { createUser, generatePOSActivationLink, deleteUser, updateUser, getUserPassword } from '@branchport/shared';
import type { Branch, AppUser } from '@branchport/shared';

interface CreatedStaff {
  name: string;
  phone: string;
  userId: string;
  activationUrl: string;
  branch_id: string;
}

export default function Team() {
  const { profile } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [staff, setStaff] = useState<AppUser[]>([]);
  const [branchId, setBranchId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedStaff | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showBranch, setShowBranch] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [branchBusy, setBranchBusy] = useState(false);
  const [branchMsg, setBranchMsg] = useState<string | null>(null);

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

  async function refresh() {
    const [b, u] = await Promise.all([
      supabase.from('branches').select('*'),
      supabase.from('users').select('*').eq('role', 'staff'),
    ]);
    setBranches((b.data as Branch[]) ?? []);
    setStaff((u.data as AppUser[]) ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  const branchNameOf = (id: string | null) => branches.find((b) => b.id === id)?.name ?? '—';

  async function handleAddBranch(e: FormEvent) {
    e.preventDefault();
    const clean = branchName.trim();
    if (!clean) return;
    setBranchBusy(true);
    setBranchMsg(null);
    const { error } = await supabase.from('branches').insert([
      { business_id: profile?.business_id, name: clean },
    ]);
    setBranchBusy(false);
    if (error) {
      setBranchMsg(`Could not add the branch: ${error.message}`);
      return;
    }
    setBranchMsg('Branch added and logged. Pick it in the invite form below.');
    setBranchName('');
    setShowBranch(false);
    refresh();
  }

  async function handleCreateStaff(e: FormEvent) {
    e.preventDefault();
    if (!branchId || !name.trim() || !phone.trim()) return;
    setBusy(true);
    setError(null);
    setCreated(null);

    const result = createUser({
      name: name.trim(),
      phone: phone.trim(),
      role: 'staff',
      branch_id: branchId,
      business_id: profile?.business_id ?? 'biz-001',
    });

    setBusy(false);

    if (!result.user) {
      setError('A user with this phone number already exists in your business.');
      return;
    }

    // Generate a POS activation link for the new staff member
    const linkResult = generatePOSActivationLink(result.user.id);
    if ('error' in linkResult) {
      setError(linkResult.error);
      return;
    }

    // Show password in the created panel
    const pw = getUserPassword(result.user.id);

    setCreated({
      name: result.user.name,
      phone: phone.trim(),
      userId: result.user.id,
      activationUrl: linkResult.url,
      branch_id: branchId,
    });

    // Also store password for display
    if (pw) {
      setVisiblePasswords((prev) => ({ ...prev, [result.user.id]: pw }));
    }

    // Auto-open WhatsApp to share the activation link immediately
    setTimeout(() => {
      openWhatsApp(phone.trim(), result.user.name, linkResult.url);
    }, 300);

    setName('');
    setPhone('');
    refresh();
  }

  async function copyActivationLink() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.activationUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // clipboard unavailable — user can read it
    }
  }

  function openWhatsApp(phone: string, name: string, activationUrl: string) {
    const cleanPhone = phone.replace(/\s+/g, '').replace(/[^+\d]/g, '');
    // Normalize: if it starts with 0, assume Ghana (+233)
    const fullPhone = cleanPhone.startsWith('+') ? cleanPhone.slice(1) : cleanPhone.startsWith('0') ? '233' + cleanPhone.slice(1) : cleanPhone;
    const msg = [
      `Hi ${name}, you've been added to BranchPort POS!`,
      '',
      'Tap the link below to activate your POS access:',
      activationUrl,
      '',
      'After activating, sign in with your phone number — no password needed.',
    ].join('\n');
    // Open WhatsApp directly to this person's number
    const waUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  }

  // ── Edit staff ──
  function startEdit(s: AppUser) {
    setEditingId(s.id);
    setEditName(s.name);
    setEditPhone(s.phone ?? '');
    setEditBranchId(s.branch_id ?? '');
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit() {
    if (!editingId || !editName.trim() || !editPhone.trim()) return;
    setEditBusy(true);
    setEditError(null);
    const result = updateUser(editingId, {
      name: editName.trim(),
      phone: editPhone.trim(),
      branch_id: editBranchId || null,
    });
    setEditBusy(false);
    if (result.error) {
      setEditError(result.error);
      return;
    }
    setEditingId(null);
    refresh();
  }

  // ── Delete staff ──
  function confirmDelete(s: AppUser) {
    setDeletingId(s.id);
  }

  function cancelDelete() {
    setDeletingId(null);
  }

  async function handleDelete() {
    if (!deletingId) return;
    deleteUser(deletingId);
    setDeletingId(null);
    refresh();
  }

  // ── Show password ──
  function togglePassword(userId: string) {
    if (visiblePasswords[userId]) {
      setVisiblePasswords((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    } else {
      const pw = getUserPassword(userId);
      if (pw) setVisiblePasswords((prev) => ({ ...prev, [userId]: pw }));
    }
  }

  // ── Resend activation link ──
  const [resendUrl, setResendUrl] = useState<string | null>(null);
  const [resendName, setResendName] = useState('');
  const [resendCopied, setResendCopied] = useState(false);

  function handleResend(s: AppUser) {
    const linkResult = generatePOSActivationLink(s.id);
    if ('url' in linkResult) {
      setResendUrl(linkResult.url);
      setResendName(s.name);
      setResendCopied(false);
    }
  }

  async function copyResendLink() {
    if (!resendUrl) return;
    try {
      await navigator.clipboard.writeText(resendUrl);
      setResendCopied(true);
      setTimeout(() => setResendCopied(false), 2000);
    } catch { /* */ }
  }

  function closeResend() {
    setResendUrl(null);
    setResendName('');
  }

  return (
    <DashboardLayout>
      <BackButton />
      <h1 className="page-title mb-1">Staff management</h1>
      <p className="page-sub mb-3">
        Create staff accounts with a phone number. After creating an account,
        send the activation link — the staff member taps it to activate their
        POS access, then signs in with their phone number only.
      </p>

      <div className="grid gap-3 lg:grid-cols-2 max-w-5xl">
        <form onSubmit={handleCreateStaff} className="card p-4 space-y-2 h-fit">
          <p className="text-sm text-gray-500">
            Enter the staff member's name and phone number, pick their branch.
            The system generates a unique POS activation link for them.
          </p>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">Branch</label>
              <button
                type="button"
                onClick={() => setShowBranch((s) => !s)}
                className="text-xs font-medium text-gray-500 hover:text-gray-900"
              >
                {showBranch ? 'Cancel' : '+ New branch'}
              </button>
            </div>
            <select
              required
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="select w-full"
            >
              <option value="" disabled>Select branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {showBranch && (
              <form onSubmit={handleAddBranch} className="mt-2 rounded-lg bg-gray-50 border border-gray-200 p-2 flex gap-2">
                <input
                  autoFocus
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="Branch name, e.g. Tema"
                  className="input flex-1 text-sm"
                />
                <button type="submit" disabled={branchBusy || !branchName.trim()} className="btn btn-primary px-3 py-1.5 text-xs">
                  {branchBusy ? 'Adding…' : 'Add branch'}
                </button>
              </form>
            )}
            {branchMsg && <p className="text-xs mt-1.5 text-gray-500">{branchMsg}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Full name</label>
              <input required value={name} onChange={(e) => setName(e.target.value)} className="input w-full" placeholder="Adele Addo" />
            </div>
            <div>
              <label className="label">Phone number</label>
              <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="input w-full" placeholder="e.g. +233 20 555 6666" />
            </div>
          </div>

          {error && <p className="text-sm text-red-800">{error}</p>}

          <button
            type="submit"
            disabled={busy || branches.length === 0}
            className="btn btn-primary w-full"
          >
            {busy ? 'Creating account…' : 'Create staff account'}
          </button>


        </form>

        {/* ── Existing staff list ─────────────────── */}
        <div className="card overflow-hidden h-fit">
          <p className="card-header">Staff accounts ({staff.length})</p>
          {staff.length === 0 ? (
            <p className="p-4 text-gray-500 text-sm">No staff accounts yet. Create one to get started.</p>
          ) : (
            <ul className="divide-y">
              {staff.map((s) => {
                const isEditing = editingId === s.id;
                const isDeleting = deletingId === s.id;
                const pw = visiblePasswords[s.id] ?? null;

                return (
                  <li key={s.id} className="px-5 py-4">
                    {isEditing ? (
                      /* ── Edit mode ── */
                      <div className="space-y-2">
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
                            {branches.map((b) => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                          </select>
                        </div>
                        {editError && <p className="text-xs text-red-600">{editError}</p>}
                        <div className="flex gap-2">
                          <button onClick={saveEdit} disabled={editBusy} className="btn btn-primary btn-sm flex-1">
                            {editBusy ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={cancelEdit} className="btn btn-outline btn-sm">Cancel</button>
                        </div>
                      </div>
                    ) : isDeleting ? (
                      /* ── Delete confirmation ── */
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-sm font-medium text-red-800 mb-2">
                          Delete {s.name}'s account?
                        </p>
                        <p className="text-xs text-red-600 mb-3">This cannot be undone.</p>
                        <div className="flex gap-2">
                          <button onClick={handleDelete} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-xs font-medium">
                            Yes, delete
                          </button>
                          <button onClick={cancelDelete} className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── Normal view ── */
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="font-medium truncate">{s.name}</p>
                            {s.pos_activated ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">POS Active</span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Pending</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            <button
                              onClick={() => handleResend(s)}
                              className="text-[11px] px-2 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium"
                              title="Resend activation link"
                            >
                              🔗 Link
                            </button>
                            <button
                              onClick={() => startEdit(s)}
                              className="text-[11px] px-2 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              onClick={() => confirmDelete(s)}
                              className="text-[11px] px-2 py-1 rounded-md bg-red-50 text-red-600 hover:bg-red-100 font-medium"
                            >
                              🗑 Delete
                            </button>
                          </div>
                        </div>
                        <p className="text-sm text-gray-500">{s.phone || '—'}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Branch: {branchNameOf(s.branch_id)}</p>

                        {/* Password row */}
                        <div className="flex items-center gap-2 mt-2 bg-gray-50 rounded-lg px-3 py-2">
                          <span className="text-xs text-gray-400">Password:</span>
                          <code className="flex-1 text-sm font-mono font-semibold text-gray-700 select-all">
                            {pw ?? '••••••••'}
                          </code>
                          <button
                            onClick={() => togglePassword(s.id)}
                            className="text-[11px] font-medium text-gray-500 hover:text-gray-800 underline"
                          >
                            {pw ? 'Hide' : 'Show'}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ── Created / Resend link modal ── */}
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

            {/* Password (only on initial create) */}
            {created && (
              <div className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-[10px] text-gray-400 mb-1">Password</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono font-bold text-gray-900 select-all">
                    {visiblePasswords[created.userId] ?? '••••••••'}
                  </code>
                  <button onClick={() => togglePassword(created.userId)} className="text-[11px] font-medium text-gray-500 hover:text-gray-800 underline">
                    {visiblePasswords[created.userId] ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            )}

            {/* Activation link */}
            <div className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-[10px] text-gray-400 mb-1">Activation link</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] font-mono text-gray-700 truncate select-all">
                  {created?.activationUrl ?? resendUrl}
                </code>
                <button
                  onClick={() => {
                    const url = created?.activationUrl ?? resendUrl ?? '';
                    navigator.clipboard.writeText(url).then(() => {
                      if (created) setLinkCopied(true);
                      else setResendCopied(true);
                      setTimeout(() => { setLinkCopied(false); setResendCopied(false); }, 2000);
                    });
                  }}
                  className="text-[11px] font-medium text-gray-500 hover:text-gray-800 underline shrink-0"
                >
                  {(created && linkCopied) || (!created && resendCopied) ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {/* WhatsApp button — opens directly to the person */}
            <button
              onClick={() => {
                const phone = created?.phone ?? '';
                const name = created?.name ?? resendName;
                const url = created?.activationUrl ?? resendUrl ?? '';
                openWhatsApp(phone, name, url);
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1da851] transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Send via WhatsApp
            </button>

            <button
              onClick={() => { setCreated(null); closeResend(); }}
              className="w-full text-center text-xs text-gray-400 hover:text-gray-600 py-1"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="mt-8 max-w-5xl rounded-2xl border border-gray-200/80 bg-gray-50 p-4">
        <p className="text-sm font-medium text-gray-700 mb-2">How it works</p>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
          <li>Enter the staff member's name and phone number, pick their branch.</li>
          <li>A unique POS activation link is generated — this confirms they belong to your POS system.</li>
          <li>Tap "Send via WhatsApp" to send them the link — they tap it to activate, then sign in with their phone number.</li>
          <li>No passwords needed — the phone number is their login. Same phone on any device = same POS access.</li>
          <li>All sales they record on the POS are attributed to them and synced when online.</li>
        </ul>
      </div>
    </DashboardLayout>
  );
}
