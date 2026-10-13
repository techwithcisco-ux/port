import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import PageHeader from '../../components/PageHeader';
import BranchVessel from '../../components/BranchVessel';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { formatGHS } from '../../lib/utils';
import { productImageSrc } from '@branchport/shared';
import type {
  Branch, InventoryAllocation, Invoice, Product, Sale, AppUser,
} from '@branchport/shared';
import {
  computeBranchHealth,
  healthColor,
  type HealthFactor,
} from '../../lib/branchHealth';

// ── Period helpers (mirrors OwnerHome so the two pages agree) ──────────────
function startOfToday(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
}
function startOfWeek(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return d.toISOString();
}
function startOfMonth(): string {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.toISOString();
}
function periodStart(period: string): string {
  return period === 'today' ? startOfToday() : period === 'month' ? startOfMonth() : startOfWeek();
}
function prevStart(period: string): string {
  const from = periodStart(period);
  const span = Date.now() - Date.parse(from);
  if (!Number.isFinite(span) || span <= 0) return from;
  return new Date(Date.parse(from) - span).toISOString();
}

function pctLabel(n: number | null): string {
  if (n === null) return '—';
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(0)}%`;
}

/** One factor of the health score — this is what "explains the colour". */
function FactorRow({ factor }: { factor: HealthFactor }) {
  const barColor = healthColor(factor.score);
  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-gray-900">{factor.label}</p>
        <p className="text-sm font-bold tabular-nums" style={{ color: barColor }}>
          {factor.value}
        </p>
      </div>
      {/* Contribution bar — same colour scale as the vessel itself */}
      <div className="mt-2 h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-out"
          style={{
            width: `${Math.max(2, factor.score)}%`,
            background: `linear-gradient(90deg, ${healthColor(Math.max(0, factor.score - 20))}, ${barColor})`,
          }}
        />
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <p className="text-xs text-gray-500 leading-snug">{factor.detail}</p>
        <p className="text-[10px] font-medium text-gray-400 shrink-0">
          {Math.round(factor.weight * 100)}% of colour
        </p>
      </div>
    </div>
  );
}

export default function BranchDetail() {
  const { branchId } = useParams<{ branchId: string }>();
  const location = useLocation() as { state?: { period?: string } };
  const period = location.state?.period ?? 'week';
  const { profile } = useAuth();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [allocations, setAllocations] = useState<InventoryAllocation[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!navigator.onLine) { setLoading(false); return; }
      const [b, p, a, inv, u, s] = await Promise.allSettled([
        api.from('branches').select('*'),
        api.from('products').select('*').limit(2000),
        api.from('inventory_allocations').select('*').limit(2000),
        api.from('invoices').select('*').limit(2000),
        api.from('users').select('*').limit(2000),
        api.from('sales').select('*').gte('sold_at', new Date(Date.now() - 365 * 864e5).toISOString()).limit(2000),
      ]);
      if (cancelled) return;
      const ok = (r: PromiseSettledResult<any>) => (r.status === 'fulfilled' && !r.value.error ? r.value.data ?? [] : []);
      setBranches(ok(b));
      setProducts(ok(p));
      setAllocations(ok(a));
      setInvoices(ok(inv));
      setUsers(ok(u));
      setAllSales(ok(s));
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [profile?.business_id]);

  const branch = branches.find((b) => b.id === branchId) ?? null;

  const periodSales = useMemo(
    () => allSales.filter((s) => s.sold_at >= periodStart(period)),
    [allSales, period],
  );
  const prevSales = useMemo(
    () => allSales.filter((s) => s.sold_at >= prevStart(period) && s.sold_at < periodStart(period)),
    [allSales, period],
  );

  const health = useMemo(() => {
    if (!branch) return null;
    return computeBranchHealth({
      branch,
      branches,
      products,
      allocations,
      invoices,
      sales: periodSales,
      prevSales,
      allSales,
    });
  }, [branch, branches, products, allocations, invoices, periodSales, prevSales, allSales]);

  // Siblings — the same computation per branch, so the owner can see this
  // shop's colour in context without going back home.
  const siblings = useMemo(() => {
    if (!branch) return [];
    return branches
      .filter((b) => b.id !== branch.id)
      .map((b) => ({
        branch: b,
        health: computeBranchHealth({
          branch: b, branches, products, allocations, invoices,
          sales: periodSales.filter((s) => s.branch_id === b.id),
          prevSales, allSales,
        }),
      }))
      .sort((a, b) => b.health.score - a.health.score);
  }, [branch, branches, products, allocations, invoices, periodSales, prevSales, allSales]);

  const maxRevenue = Math.max(
    1,
    ...(health ? [health.revenue] : []),
    ...siblings.map((x) => x.health.revenue),
  );

  // Cost of one base unit, per product.
  const costOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) m.set(p.id, p.units_per_bulk > 0 ? p.bulk_cost_price / p.units_per_bulk : 0);
    return m;
  }, [products]);

  // Top products at THIS shop only.
  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; image?: string | null; revenue: number; units: number; profit: number }>();
    for (const s of periodSales) {
      if (s.branch_id !== branchId) continue;
      const p = products.find((x) => x.id === s.product_id);
      if (!p) continue;
      const cur = map.get(s.product_id) ?? { name: p.name, image: p.image, revenue: 0, units: 0, profit: 0 };
      cur.revenue += Number(s.total_price);
      cur.units += Number(s.quantity);
      cur.profit += Number(s.total_price) - Number(s.quantity) * (costOf.get(s.product_id) ?? 0);
      map.set(s.product_id, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  }, [periodSales, branchId, products, costOf]);

  // Lines that are low or out at THIS shop — the fourth colour factor.
  const stockLines = useMemo(() => {
    const out: { name: string; image?: string | null; remaining: number; allocated: number; status: 'Out' | 'Low' }[] = [];
    for (const p of products) {
      const alloc = allocations
        .filter((a) => a.product_id === p.id && a.branch_id === branchId)
        .reduce((sum, a) => sum + Number(a.retail_quantity_equivalent), 0);
      if (alloc <= 0) continue;
      const sold = allSales
        .filter((s) => s.product_id === p.id && s.branch_id === branchId)
        .reduce((sum, s) => sum + Number(s.quantity), 0);
      const remaining = Math.max(alloc - sold, 0);
      if (remaining === 0 || remaining <= alloc * 0.2) {
        out.push({
          name: p.name, image: p.image, remaining, allocated: alloc,
          status: remaining === 0 ? 'Out' : 'Low',
        });
      }
    }
    return out.sort((a, b) => a.remaining - b.remaining);
  }, [products, allocations, allSales, branchId]);

  // Unpaid invoices raised at THIS shop.
  const owedInvoices = useMemo(
    () => invoices
      .filter((i) => i.branch_id === branchId && i.status === 'pending')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 10),
    [invoices, branchId],
  );

  const team = useMemo(
    () => users.filter((u) => u.branch_id === branchId),
    [users, branchId],
  );

  const recentSales = useMemo(
    () => periodSales
      .filter((s) => s.branch_id === branchId)
      .sort((a, b) => b.sold_at.localeCompare(a.sold_at))
      .slice(0, 12),
    [periodSales, branchId],
  );

  if (loading) {
    return (
      <DashboardLayout>
        <PageHeader title="Shop" backTo="/owner" backLabel="Home" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      </DashboardLayout>
    );
  }

  if (!branch || !health) {
    return (
      <DashboardLayout>
        <PageHeader title="Shop not found" backTo="/owner" backLabel="Home" />
        <p className="text-sm text-gray-500">That shop no longer exists.</p>
      </DashboardLayout>
    );
  }

  const periodLabel = period === 'today' ? "Today" : period === 'month' ? "This month" : "This week";

  return (
    <DashboardLayout>
      <PageHeader
        title={branch.name}
        subtitle={`${periodLabel} · how this shop is doing`}
        backTo="/owner"
        backLabel="Home"
      />

      {/* ═══════ THE VESSEL + WHAT THE COLOUR IS MADE OF ═══════ */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Large vessel */}
          <BranchVessel
            fillPct={maxRevenue > 0 ? (health.revenue / maxRevenue) * 100 : 0}
            color={health.color}
            label={branch.name}
            value={formatGHS(health.revenue)}
            grade={health.grade}
            size={150}
          />

          {/* Score dial + colour legend */}
          <div className="flex-1 min-w-0 w-full">
            <div className="flex items-baseline gap-3">
              <p
                className="text-5xl font-black tabular-nums leading-none"
                style={{ color: health.color }}
              >
                {health.score}
              </p>
              <div>
                <p className="text-sm font-bold text-gray-900">{health.grade}</p>
                <p className="text-xs text-gray-500">out of 100</p>
              </div>
            </div>

            {/* The exact colour scale, so the owner can place this shop on it */}
            <div className="mt-4">
              <div
                className="h-3 w-full rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${healthColor(0)}, ${healthColor(35)}, ${healthColor(55)}, ${healthColor(75)}, ${healthColor(100)})`,
                }}
              />
              <div
                className="relative -mt-4 h-3"
                aria-hidden
              >
                <div
                  className="absolute top-0 h-3 w-1 rounded-full bg-gray-900 shadow"
                  style={{ left: `calc(${health.score}% - 2px)` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[10px] font-medium text-gray-400">
                <span>Struggling</span>
                <span>Watch</span>
                <span>Steady</span>
                <span>Thriving</span>
              </div>
            </div>

            <p className="mt-3 text-xs text-gray-500 leading-relaxed">
              This colour is built from four things: sales against your busiest shop, profit
              margin, momentum versus the last {period === 'month' ? 'month' : period === 'today' ? 'day' : 'week'},
              and stock on the shelf. Each one is broken out below.
            </p>
          </div>
        </div>

        {/* The four factors — literally the ingredients of the colour */}
        <div className="mt-5 pt-4 border-t border-gray-100">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">
            What this colour is made of
          </p>
          {health.factors.map((f) => (
            <FactorRow key={f.key} factor={f} />
          ))}
        </div>
      </div>

      {/* ═══════ HEADLINE NUMBERS ═══════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {[
          { label: 'Revenue', value: formatGHS(health.revenue), tone: 'ink' },
          { label: 'Profit', value: formatGHS(health.profit), tone: health.profit >= 0 ? 'good' : 'bad' },
          { label: 'Margin', value: `${health.margin.toFixed(1)}%`, tone: health.margin >= 20 ? 'good' : health.margin >= 5 ? 'warn' : 'bad' },
          { label: 'Sales', value: String(health.transactions), tone: 'ink' },
          { label: 'Avg. sale', value: formatGHS(health.avgSale), tone: 'ink' },
          { label: 'Momentum', value: pctLabel(health.growthPct), tone: (health.growthPct ?? 0) >= 0 ? 'good' : 'bad' },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{c.label}</p>
            <p
              className={`text-xl font-bold tabular-nums mt-1.5 ${
                c.tone === 'good' ? 'text-green-700' : c.tone === 'bad' ? 'text-red-700' : c.tone === 'warn' ? 'text-amber-700' : 'text-gray-900'
              }`}
            >
              {c.value}
            </p>
          </div>
        ))}
      </div>

      {/* ═══════ SIBLING SHOPS — context for the colour ═══════ */}
      {siblings.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Your other shops</h2>
          <p className="text-xs text-gray-400 mb-3">Same colour scale, same period</p>
          <div className="flex items-end justify-around gap-2 overflow-x-auto py-2">
            {siblings.map(({ branch: b, health: h }) => (
              <BranchVessel
                key={b.id}
                fillPct={maxRevenue > 0 ? (h.revenue / maxRevenue) * 100 : 0}
                color={h.color}
                label={b.name}
                value={formatGHS(h.revenue)}
                grade={h.grade}
                size={82}
              />
            ))}
          </div>
        </div>
      )}

      {/* ═══════ WHAT'S SELLING ═══════ */}
      {topProducts.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
          <h2 className="text-base font-semibold text-gray-900 mb-1">What's selling here</h2>
          <p className="text-xs text-gray-400 mb-3">{periodLabel}</p>
          <div className="space-y-2">
            {topProducts.map((p, i) => (
              <div key={p.name} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                <span className="text-sm w-6 text-center font-bold text-gray-400">{i + 1}</span>
                {p.image ? (
                  <img src={productImageSrc(p.image)} alt="" className="h-10 w-10 rounded-xl object-cover border border-gray-200" />
                ) : (
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-gray-100 text-lg">📦</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.units} units</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-gray-900">{formatGHS(p.revenue)}</p>
                  <p className={`text-xs font-medium tabular-nums ${p.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {p.profit >= 0 ? '+' : ''}{formatGHS(p.profit)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════ SHELF HEALTH — colour factor 4, itemised ═══════ */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Shelf health</h2>
        <p className="text-xs text-gray-400 mb-3">
          {stockLines.length === 0 ? 'Every carried line is stocked.' : `${stockLines.length} line${stockLines.length === 1 ? '' : 's'} low or out`}
        </p>
        {stockLines.length > 0 && (
          <div className="space-y-2">
            {stockLines.map((l) => (
              <div key={l.name} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                {l.image ? (
                  <img src={productImageSrc(l.image)} alt="" className="h-9 w-9 rounded-lg object-cover border border-gray-200" />
                ) : (
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-gray-100">📦</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{l.name}</p>
                  <p className="text-xs text-gray-500">{l.remaining} left of {l.allocated} allocated</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    l.status === 'Out' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {l.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════ MONEY OWED — colour never hides debt ═══════ */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="text-base font-semibold text-gray-900">Owed to you</h2>
          <p
            className="text-lg font-bold tabular-nums"
            style={{ color: health.owed > 0 ? 'var(--ghana-red)' : 'var(--ghana-green)' }}
          >
            {formatGHS(health.owed)}
          </p>
        </div>
        <p className="text-xs text-gray-400 mb-3">Credit sales raised at this shop</p>
        {owedInvoices.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing outstanding.</p>
        ) : (
          <div className="space-y-2">
            {owedInvoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{inv.customer_name || 'Walk-in'}</p>
                  <p className="text-xs text-gray-500">{inv.invoice_number}</p>
                </div>
                <p className="text-sm font-bold tabular-nums text-amber-700">{formatGHS(Number(inv.amount_owed))}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════ TEAM ═══════ */}
      {team.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Team at this shop</h2>
          <div className="flex flex-wrap gap-2">
            {team.map((u) => (
              <div key={u.id} className="flex items-center gap-2 rounded-full bg-gray-50 border border-gray-200 py-1.5 pl-1.5 pr-3.5">
                <span
                  className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold text-white"
                  style={{ background: 'var(--ghana-black)' }}
                >
                  {(u.name || '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="text-sm font-medium text-gray-900">{u.name}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{u.role}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════ RECENT SALES ═══════ */}
      {recentSales.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Recent sales</h2>
          <div className="space-y-1.5">
            {recentSales.map((s) => {
              const p = products.find((x) => x.id === s.product_id);
              const seller = users.find((u) => u.id === s.sold_by);
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-100 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p?.name ?? 'Item'}</p>
                    <p className="text-xs text-gray-500">
                      {s.quantity} × {formatGHS(Number(s.unit_price))}
                      {seller ? ` · ${seller.name}` : ''}
                      {s.is_discounted ? ' · discounted' : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold tabular-nums text-gray-900">{formatGHS(Number(s.total_price))}</p>
                    <p className="text-[10px] text-gray-400">
                      {new Date(s.sold_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
