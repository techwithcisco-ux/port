import { useEffect, useState } from 'react';
import BackButton from '../../components/BackButton';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import type { Sale, AuditEvent, Branch, InventoryAllocation, Product, AppUser } from '@branchport/shared';
import { formatGHS } from '../../lib/utils';

// Owner flags panel (requirements 4.2 / 4.5 and the Flags screen spec).
// Four read-only views. The quirk is intentional: every query here is
// owner-only under RLS, so a manager-role viewer gets denied data — the
// trust boundary is enforced by Postgres, not by hiding this route.

type TabKey = 'prices' | 'backdated' | 'actors' | 'frozen';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'prices', label: 'Price anomalies' },
  { key: 'backdated', label: 'Backdating' },
  { key: 'actors', label: 'Repeated overriders' },
  { key: 'frozen', label: 'Frozen allocations' },
];

const WINDOW_DAYS = 14;

export default function FlagsPanel() {
  const [tab, setTab] = useState<TabKey>('prices');
  const [search, setSearch] = useState('');
  const [flaggedSales, setFlaggedSales] = useState<Sale[]>([]);
  const [backdated, setBackdated] = useState<AuditEvent[]>([]);
  const [allocations, setAllocations] = useState<InventoryAllocation[]>([]);
  const [soldKeys, setSoldKeys] = useState<Set<string>>(new Set());
  const [branchAll, setBranchAll] = useState<Branch[]>([]);
  const [productAll, setProductAll] = useState<Product[]>([]);
  const [userAll, setUserAll] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    const since = new Date();
    since.setDate(since.getDate() - WINDOW_DAYS);
    const sinceIso = since.toISOString();

    Promise.all([
      supabase.from('sales').select('*').eq('price_flagged', true).order('sold_at', { ascending: false }).limit(100),
      supabase.from('flagged_backdated_events').select('*').order('occurred_at', { ascending: false }).limit(100),
      supabase.from('inventory_allocations').select('*').gte('allocated_at', sinceIso),
      supabase.from('sales').select('branch_id, product_id').gte('sold_at', sinceIso),
      supabase.from('branches').select('*'),
      supabase.from('products').select('*'),
      supabase.from('users').select('id, name'),
    ]).then(([fl, bd, al, sd, br, pr, us]) => {
      setFlaggedSales((fl.data as Sale[]) ?? []);
      setBackdated((bd.data as AuditEvent[]) ?? []);
      setAllocations((al.data as InventoryAllocation[]) ?? []);
      setSoldKeys(new Set(((sd.data as Array<{ branch_id: string; product_id: string }>) ?? []).map((s) => `${s.branch_id}:${s.product_id}`)));
      setBranchAll((br.data as Branch[]) ?? []);
      setProductAll((pr.data as Product[]) ?? []);
      setUserAll((us.data as Array<{ id: string; name: string }>) ?? []);
    });
  }, []);

  const branchName = (id: string) => branchAll.find((b) => b.id === id)?.name ?? '—';
  const productName = (id: string) => productAll.find((p) => p.id === id)?.name ?? '—';
  const userName = (id: string) => userAll.find((u) => u.id === id)?.name ?? id;

  const OVERRIDE_THRESHOLD = 3;
  const actorCounts = (() => {
    const map = new Map<string, number>();
    for (const s of flaggedSales) map.set(s.sold_by, (map.get(s.sold_by) ?? 0) + 1);
    return Array.from(map.entries())
      .filter(([, n]) => n >= OVERRIDE_THRESHOLD)
      .sort((a, b) => b[1] - a[1]);
  })();

  const frozenAllocations = allocations.filter((a) => !soldKeys.has(`${a.branch_id}:${a.product_id}`));

  const q = search.trim().toLowerCase();
  const matches = (row: Record<string, unknown>) => !q || JSON.stringify(row).toLowerCase().includes(q);
  const filteredFlagged = flaggedSales.filter((s) => matches(s as unknown as Record<string, unknown>));
  const filteredBackdated = backdated.filter((e) => matches(e as unknown as Record<string, unknown>));
  const filteredFrozen = frozenAllocations.filter((a) => matches(a as unknown as Record<string, unknown>));
  const filteredActors = actorCounts.filter(([id]) => userName(id).toLowerCase().includes(q));

  const gapMinutes = (e: AuditEvent) =>
    e.client_reported_at
      ? Math.round(
          (new Date(e.occurred_at).getTime() - new Date(e.client_reported_at).getTime()) / 60000
        )
      : null;

  return (
    <DashboardLayout>
      <BackButton />
      <h1 className="page-title mb-1">Flags</h1>
      <p className="page-sub mb-4">Pricing anomalies and backdating signatures, surfaced from the record.</p>

      <div className="seg mb-4 max-w-full overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`pill ${tab === t.key ? 'pill-active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter this tab… (product, branch, person, amount)"
        className="input w-full max-w-md mb-4"
      />

      {tab === 'prices' && (
        <div className="card overflow-x-auto">
          <p className="card-header">
            Retail sales priced outside the 5% consistency window (flag written by the DB trigger)
          </p>
          {filteredFlagged.length === 0 ? (
            <p className="p-6 text-gray-600 text-sm">No pricing anomalies on file.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left">
                <tr>
                  <th className="table-head">Time</th>
                  <th className="table-head">Branch</th>
                  <th className="table-head">Product</th>
                  <th className="table-head text-right">Qty</th>
                  <th className="table-head text-right">Unit charged</th>
                  <th className="table-head text-right">Total</th>
                  <th className="table-head">By</th>
                </tr>
              </thead>
              <tbody>
                {filteredFlagged.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-4 py-2">{new Date(s.sold_at).toLocaleString()}</td>
                    <td className="px-4 py-2">{branchName(s.branch_id)}</td>
                    <td className="px-4 py-2">{productName(s.product_id)}</td>
                    <td className="px-4 py-2 text-right">{s.quantity}</td>
                    <td className="px-4 py-2 text-right">{formatGHS(s.unit_price)}/{s.unit_type}</td>
                    <td className="px-4 py-2 text-right">{formatGHS(s.total_price)}</td>
                    <td className="px-4 py-2">{userName(s.sold_by)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'backdated' && (
        <div className="card overflow-x-auto">
          <p className="card-header">
            Server-vs-device clock gap over 10 min — offline sync has the same signature, so this stays for human judgment
          </p>
          {filteredBackdated.length === 0 ? (
            <p className="p-6 text-gray-600 text-sm">No timing mismatches recorded.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left">
                <tr>
                  <th className="table-head">Recorded</th>
                  <th className="table-head">Actor</th>
                  <th className="table-head">Entity</th>
                  <th className="table-head text-right">Gap (min)</th>
                </tr>
              </thead>
              <tbody>
                {filteredBackdated.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="px-4 py-2">{new Date(e.occurred_at).toLocaleString()}</td>
                    <td className="px-4 py-2">{userName(e.actor_user_id)}</td>
                    <td className="px-4 py-2">{e.entity_type}</td>
                    <td className="px-4 py-2 text-right">{e.client_reported_at ? gapMinutes(e) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'actors' && (
        <div className="card overflow-x-auto">
          <p className="card-header">
            Actors with {OVERRIDE_THRESHOLD}+ flagged sales — the threshold, not the person, decides
          </p>
          {filteredActors.length === 0 ? (
            <p className="p-6 text-gray-600 text-sm">Nobody is repeatedly pricing outside the window.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left">
                <tr>
                  <th className="table-head">Actor</th>
                  <th className="table-head text-right">Flagged sales</th>
                </tr>
              </thead>
              <tbody>
                {filteredActors.map(([id, n]) => (
                  <tr key={id} className="border-t">
                    <td className="px-4 py-2">{userName(id)}</td>
                    <td className="px-4 py-2 text-right font-medium">{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'frozen' && (
        <div className="card overflow-x-auto">
          <p className="card-header">
            Allocations in the last {WINDOW_DAYS} days with no matching sale recorded for that branch+product
          </p>
          {filteredFrozen.length === 0 ? (
            <p className="p-6 text-gray-600 text-sm">Everything allocated in the window looks accounted for.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left">
                <tr>
                  <th className="table-head">Allocated</th>
                  <th className="table-head">Branch</th>
                  <th className="table-head">Product</th>
                  <th className="table-head text-right">Bulk</th>
                  <th className="table-head text-right">Retail units</th>
                </tr>
              </thead>
              <tbody>
                {filteredFrozen.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="px-4 py-2">{new Date(a.allocated_at).toLocaleDateString()}</td>
                    <td className="px-4 py-2">{branchName(a.branch_id)}</td>
                    <td className="px-4 py-2">{productName(a.product_id)}</td>
                    <td className="px-4 py-2 text-right">{a.bulk_quantity}</td>
                    <td className="px-4 py-2 text-right">{a.retail_quantity_equivalent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}