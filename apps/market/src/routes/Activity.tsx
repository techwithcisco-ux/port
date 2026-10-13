import { useEffect, useMemo, useState } from 'react';
import { getActivity, type ActivityEvent, type ActivityKind } from '../lib/api';
import LoadError from '../components/LoadError';

const KIND_META: Record<ActivityKind, { label: string; dot: string; chip: string }> = {
  data: { label: 'Data change', dot: 'bg-blue-500', chip: 'bg-blue-500/10 text-blue-400' },
  auth: { label: 'Sign-in & security', dot: 'bg-amber-400', chip: 'bg-amber-400/10 text-amber-400' },
  order: { label: 'Customer order', dot: 'bg-emerald-400', chip: 'bg-emerald-400/10 text-emerald-400' },
  view: { label: 'Shop view', dot: 'bg-purple-400', chip: 'bg-purple-400/10 text-purple-400' },
};

const RANGES = [
  { label: '24h', hours: 24 },
  { label: '7d', hours: 24 * 7 },
  { label: '30d', hours: 24 * 30 },
];

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

export default function Activity() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [kind, setKind] = useState<'' | ActivityKind>('');
  const [businessId, setBusinessId] = useState('');
  const [rangeH, setRangeH] = useState(24 * 7);
  const [search, setSearch] = useState('');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getActivity({
      type: kind,
      business_id: businessId || undefined,
      since: new Date(Date.now() - rangeH * 3600 * 1000).toISOString(),
      limit: 200,
    })
      .then((rows) => { if (!cancelled) { setEvents(rows); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e instanceof Error ? e.message : 'Failed to load activity.'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [kind, businessId, rangeH, nonce]);

  const businesses = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of events) {
      if (e.business_id && e.business_name && !map.has(e.business_id)) map.set(e.business_id, e.business_name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [events]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) =>
      [e.action, e.user_name, e.business_name].some((v) => (v || '').toLowerCase().includes(q)),
    );
  }, [events, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { data: 0, auth: 0, order: 0, view: 0 };
    for (const e of events) c[e.kind] = (c[e.kind] || 0) + 1;
    return c;
  }, [events]);

  return (
    <div>
      <h1 className="page-title">Activity — everything, everywhere</h1>
      <p className="page-sub mt-1">Every user action, item change, order, and shop view across the platform, newest first.</p>

      {/* Summary chips */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(Object.keys(KIND_META) as ActivityKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind((prev) => (prev === k ? '' : k))}
            className={`rounded-2xl border p-3.5 text-left transition-all active:scale-[0.98] ${
              kind === k ? 'border-gray-400 bg-white shadow-sm' : 'border-gray-200/80 bg-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${KIND_META[k].dot}`} />
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{KIND_META[k].label}</span>
            </span>
            <span className="mt-1 block text-2xl font-bold tabular-nums text-gray-900">{counts[k] || 0}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search actions, users, businesses…"
          className="input flex-1"
        />
        <div className="flex gap-2">
          <select value={businessId} onChange={(e) => setBusinessId(e.target.value)} className="select flex-1 sm:flex-none" aria-label="Filter by business">
            <option value="">All businesses</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <div className="seg">
            {RANGES.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => setRangeH(r.hours)}
                className={`pill ${rangeH === r.hours ? 'pill-active' : 'text-gray-500'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="card mt-4 overflow-hidden">
        {loading ? (
          <p className="p-6 text-center text-sm text-gray-500">Loading activity…</p>
        ) : error ? (
          <div className="p-4"><LoadError message={error} onRetry={() => setNonce((n) => n + 1)} /></div>
        ) : visible.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500">No activity in this window yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visible.map((e) => (
              <li key={`${e.kind}-${e.id}`} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${KIND_META[e.kind].dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">{e.user_name || 'Someone'}</span>
                    {e.business_name && <span className="text-gray-500"> · {e.business_name}</span>}
                  </p>
                  <p className="mt-0.5 truncate text-[13px] text-gray-500">{e.action}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${KIND_META[e.kind].chip}`}>
                    {e.kind}
                  </span>
                  <span className="text-[11px] tabular-nums text-gray-400" title={new Date(e.at).toLocaleString()}>
                    {timeAgo(e.at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
