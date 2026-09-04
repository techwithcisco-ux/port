import { useEffect, useMemo, useState } from 'react';
import BackButton from '../../components/BackButton';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { humanizeEvent, humanizeDiff, structuredFields, searchMatches, NameCtx } from '../../lib/humanize';
import type { AuditEvent } from '@branchport/shared';
import { AdinkraAudit, AdinkraHistory, IconShield, IconSearch, IconFilter } from '../../components/Icons';

// Owner's window into the append-only audit log. Reads are owner-only at
// the RLS layer; a manager cannot query this table at all regardless of
// what this component does.
//
// Reviewing hundreds of raw JSON rows is exactly the friction the product
// exists to remove, so the default view here is a plain-language sentence
// per event (humanizeEvent), filters narrowed to the need, and a free-text
// search box covering EVERY field — entity, action, actor, and the
// contents of both before/after states. The raw JSON stays one click away
// for the owner who wants the full picture.
export default function AuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [names, setNames] = useState<{ users: Array<{ id: string; name: string }>; products: Array<{ id: string; name: string }>; branches: Array<{ id: string; name: string }>; suppliers: Array<{ id: string; name: string }> }>({ users: [], products: [], branches: [], suppliers: [] });
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState('all');
  const [actorFilter, setActorFilter] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rawOpen, setRawOpen] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('users').select('id, name'),
      supabase.from('products').select('id, name'),
      supabase.from('branches').select('id, name'),
      supabase.from('suppliers').select('id, name'),
    ]).then(([u, p, b, s]) => {
      setNames({
        users: (u.data as Array<{ id: string; name: string }>) ?? [],
        products: (p.data as Array<{ id: string; name: string }>) ?? [],
        branches: (b.data as Array<{ id: string; name: string }>) ?? [],
        suppliers: (s.data as Array<{ id: string; name: string }>) ?? [],
      });
    });
  }, []);

  useEffect(() => {
    let query = supabase
      .from('audit_events')
      .select('*')
      .order('occurred_at', { ascending: false });

    if (entityFilter !== 'all') query = query.eq('entity_type', entityFilter);
    if (actorFilter !== 'all') query = query.eq('actor_user_id', actorFilter);
    if (from) query = query.gte('occurred_at', new Date(new Date(from).setHours(0, 0, 0, 0)).toISOString());
    if (to) query = query.lte('occurred_at', new Date(new Date(to).setHours(23, 59, 59, 999)).toISOString());

    setLoading(true);
    query.then(({ data, error }) => {
      if (error) console.error(error.message);
      setEvents((data as AuditEvent[]) ?? []);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityFilter, actorFilter, from, to]);

  const ctx: NameCtx = {
    product: (id) => names.products.find((x) => x.id === id)?.name ?? '—',
    branch: (id) => names.branches.find((x) => x.id === id)?.name ?? '—',
    supplier: (id) => names.suppliers.find((x) => x.id === id)?.name ?? '—',
    user: (id) => names.users.find((x) => x.id === id)?.name ?? id,
  };

  // Search sweeps every field of every loaded event, including inside the
  // JSON states. Works in concert with the server-side filters above.
  const visibleEvents = useMemo(() => {
    if (!search.trim()) return events;
    return events.filter((e) => searchMatches(e, search, ctx));
  }, [events, search, ctx]);

  const timingMismatch = (e: AuditEvent) =>
    e.client_reported_at &&
    Math.abs(new Date(e.occurred_at).getTime() - new Date(e.client_reported_at).getTime()) > 10 * 60 * 1000;

  useEffect(() => {
    setExpanded(null);
    setRawOpen(null);
  }, [entityFilter, actorFilter, from, to, search]);

  return (
    <DashboardLayout>
      <BackButton />

      {/* Distinctive audit header — serious, authoritative tone */}
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-xl bg-gray-900 flex items-center justify-center">
          <AdinkraAudit size={20} className="text-white" />
        </div>
        <div>
          <h1 className="page-title mb-0">Audit trail</h1>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-1 flex items-center gap-2">
        <AdinkraHistory size={14} className="text-gray-400 shrink-0" />
        Every action, every actor, every branch — nothing is erased, nothing is rewritten.
      </p>
      <p className="text-[11px] text-gray-400 mb-6 font-mono">
        Append-only log · Corrections are new rows · Timestamps are immutable
      </p>

      {/* Filters — icon-first, compact */}
      <div className="card p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <IconFilter size={14} className="text-gray-400" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filters</span>
        </div>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[16rem]">
            <label className="label">Search everything</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <IconSearch size={16} />
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Product, person, branch, amount…"
                className="input w-full pl-9"
              />
            </div>
          </div>
          <div>
            <label className="label">Entity</label>
            <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className="select">
              <option value="all">All types</option>
              <option value="sales">Sales</option>
              <option value="invoices">Invoices</option>
              <option value="inventory_intake">Inventory intake</option>
              <option value="inventory_allocations">Stock allocations</option>
              <option value="products">Products</option>
              <option value="product_variants">Product variants</option>
              <option value="branches">Branches</option>
              <option value="suppliers">Suppliers</option>
              <option value="supplier_payments">Supplier payments</option>
              <option value="supplier_reconciliations">Balance confirmations</option>
              <option value="expenses">Expenses</option>
              <option value="expense_payments">Expense payments</option>
              <option value="debtors">Debtors</option>
              <option value="creditors">Creditors</option>
              <option value="users">Staff & Managers</option>
            </select>
          </div>
          <div>
            <label className="label">Actor</label>
            <select value={actorFilter} onChange={(e) => setActorFilter(e.target.value)} className="select">
              <option value="all">Everyone</option>
              {names.users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="select" />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="select" />
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <p className="p-6 text-gray-500 text-sm">Loading…</p>
        ) : visibleEvents.length === 0 ? (
          <p className="p-6 text-gray-500 text-sm">No events match the current filters or search.</p>
        ) : (
          <ul className="divide-y">
            {visibleEvents.map((e) => {
              const diff = humanizeDiff(e);
              const isOpen = expanded === e.id;
              return (
                <li key={e.id} className="px-4 py-3">
                  <button onClick={() => setExpanded(isOpen ? null : e.id)} className="w-full text-left flex items-start justify-between gap-4 hover:bg-gray-50 rounded -m-1 p-1">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800">
                        {humanizeEvent(e, ctx)}
                        {timingMismatch(e) && (
                          <span className="ml-2 tag tag-warn">timing mismatch</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(e.occurred_at).toLocaleString()} · {ctx.user(e.actor_user_id)} · {e.action_type}
                      </p>
                    </div>
                    {e.before_state || e.after_state ? (
                      <span className="text-gray-400 text-xs shrink-0 mt-1">{isOpen ? '▲' : '▼'}</span>
                    ) : null}
                  </button>

                  {isOpen && (
                    <div className="mt-2 bg-gray-50 border rounded-lg p-3">
                      {diff.length > 0 && (
                        <div className="mb-3">
                          <p className="text-xs text-gray-400 mb-1">Changed fields</p>
                          <table className="text-xs w-full">
                            <tbody>
                              {diff.map(([k, before, after]) => (
                                <tr key={k} className="border-t first:border-t-0">
                                  <td className="py-1 pr-3 font-medium">{k}</td>
                                  <td className="py-1 pr-3 text-gray-500 line-through">{before}</td>
                                  <td className="py-1 text-gray-900">→ {after}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {(e.before_state || e.after_state) && (
                        <div>
                          <p className="text-xs text-gray-400 mb-1">Record contents</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                            {structuredFields(e.entity_type, e.before_state, e.after_state, ctx).map((f) => (
                              <div key={f.label} className="text-xs flex justify-between gap-2">
                                <span className="text-gray-500 shrink-0">{f.label}</span>
                                <span className="text-gray-900 text-right font-medium">{f.value}</span>
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => setRawOpen(rawOpen === e.id ? null : e.id)}
                            className="mt-2 text-[11px] text-gray-500 underline underline-offset-2 hover:text-gray-800"
                          >
                            {rawOpen === e.id ? 'Hide raw JSON' : 'Show raw JSON'}
                          </button>
                          {rawOpen === e.id && (
                            <pre className="mt-1 text-xs bg-white border rounded p-2 overflow-x-auto">
                              {JSON.stringify(
                                { before_state: e.before_state ?? null, after_state: e.after_state ?? null },
                                null,
                                2
                              )}
                            </pre>
                          )}
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
    </DashboardLayout>
  );
}