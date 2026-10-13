// Branch health → the colour that fills a store's vessel.
//
// A shop's funnel colour is not decoration: it is a single readable score
// computed from four things an owner already cares about, each weighted so
// no one metric can fake a green shop. computeBranchHealth() returns the
// score, the colour it maps to, and the individual factors — the drill-down
// page shows those factors so the colour is always explainable, never magic.

import type { Branch, InventoryAllocation, Invoice, Product, Sale } from '@branchport/shared';
import { saleBaseUnits } from '@branchport/shared';

export interface HealthFactor {
  key: 'sales' | 'profit' | 'growth' | 'stock';
  label: string;
  /** 0-100 for this factor alone. */
  score: number;
  /** Weight in the composite (sums to 1). */
  weight: number;
  /** Plain-language reading of the raw number. */
  detail: string;
  /** Raw formatted value, e.g. "GHS 1,240". */
  value: string;
  /** True when this factor is pulling the score up. */
  good: boolean;
}

export interface BranchHealth {
  /** 0-100 composite. */
  score: number;
  /** The hex colour the vessel fills with. */
  color: string;
  grade: 'Thriving' | 'Steady' | 'Watch' | 'Struggling';
  factors: HealthFactor[];
  revenue: number;
  profit: number;
  margin: number;
  transactions: number;
  units: number;
  avgSale: number;
  prevRevenue: number;
  growthPct: number | null;
  stockValue: number;
  lowStock: number;
  owed: number;
}

/** Map a 0-100 score to a colour along red → amber → green.
 *  Pass alpha (0-1) for glows and washes that must match the fill exactly. */
export function healthColor(score: number, alpha?: number): string {
  const s = Math.max(0, Math.min(100, score));
  // 0 → red (hsl 4), 50 → amber (hsl 40), 100 → green (hsl 145).
  // Two segments so amber sits in the middle rather than muddy brown.
  let h: number;
  let sat: number;
  let light: number;
  if (s <= 50) {
    const t = s / 50;
    h = 4 + (40 - 4) * t;
    sat = 78 - 12 * t;
    light = 48 + 3 * t;
  } else {
    const t = (s - 50) / 50;
    h = 40 + (145 - 40) * t;
    sat = 66 + 8 * t;
    light = 51 - 6 * t;
  }
  const base = `${h.toFixed(0)} ${sat.toFixed(0)}% ${light.toFixed(0)}%`;
  return alpha === undefined ? `hsl(${base})` : `hsl(${base} / ${alpha})`;
}

function ghs(n: number): string {
  return `GHS ${Math.round(n).toLocaleString()}`;
}

function pct(n: number): string {
  return `${n >= 0 ? '' : '−'}${Math.abs(n).toFixed(0)}%`;
}

interface HealthInput {
  branch: Branch;
  branches: Branch[];
  products: Product[];
  allocations: InventoryAllocation[];
  invoices: Invoice[];
  /** Sales inside the current period. */
  sales: Sale[];
  /** Sales inside the immediately preceding window of equal length. */
  prevSales: Sale[];
  /** All sales, used for the all-time branch share. */
  allSales: Sale[];
  now?: Date;
}

export function computeBranchHealth(input: HealthInput): BranchHealth {
  const { branch, branches, products, allocations, invoices, sales, prevSales, allSales } = input;
  const now = input.now ?? new Date();

  const costOf = new Map<string, number>();
  for (const p of products) {
    costOf.set(p.id, p.units_per_bulk > 0 ? p.bulk_cost_price / p.units_per_bulk : 0);
  }

  const mine = sales.filter((s) => s.branch_id === branch.id);
  const revenue = mine.reduce((sum, s) => sum + Number(s.total_price), 0);
  const profit = mine.reduce(
    (sum, s) => sum + (Number(s.total_price) - Number(s.quantity) * (costOf.get(s.product_id) ?? 0)),
    0,
  );
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const transactions = mine.length;
  const units = mine.reduce((sum, s) => sum + Number(s.quantity) * saleBaseUnits(products.find((p) => p.id === s.product_id) ?? ({} as Product), s), 0);
  const avgSale = transactions > 0 ? revenue / transactions : 0;

  const prevMine = prevSales.filter((s) => s.branch_id === branch.id);
  const prevRevenue = prevMine.reduce((sum, s) => sum + Number(s.total_price), 0);
  const growthPct = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;

  // Stock: value of what this branch still holds, and how many lines ran dry.
  let stockValue = 0;
  let lowStock = 0;
  for (const p of products) {
    const alloc = allocations
      .filter((a) => a.product_id === p.id && a.branch_id === branch.id)
      .reduce((sum, a) => sum + Number(a.retail_quantity_equivalent), 0);
    const sold = allSales
      .filter((s) => s.product_id === p.id && s.branch_id === branch.id)
      .reduce((sum, s) => sum + Number(s.quantity) * saleBaseUnits(p, s), 0);
    const remaining = Math.max(alloc - sold, 0);
    stockValue += remaining * (costOf.get(p.id) ?? 0);
    if (alloc > 0 && (remaining === 0 || remaining <= alloc * 0.2)) lowStock++;
  }

  const owed = invoices
    .filter((i) => i.branch_id === branch.id && i.status === 'pending')
    .reduce((sum, i) => sum + Number(i.amount_owed), 0);

  // ── Factor 1: Sales — this branch's share of the best branch's revenue.
  // A brand-new single-shop business should not read as failing, so below a
  // meaningful absolute floor the score is driven by margin instead.
  const bestRevenue = Math.max(
    0,
    ...branches.map((b) => sales.filter((s) => s.branch_id === b.id).reduce((sum, s) => sum + Number(s.total_price), 0)),
  );
  const salesScore =
    bestRevenue < 50
      ? Math.min(100, transactions * 10) // almost no data yet — don't punish
      : Math.round((revenue / bestRevenue) * 100);

  // ── Factor 2: Profit margin — 30%+ is excellent, 0% or less is a loss.
  const profitScore = Math.round(Math.max(0, Math.min(100, (margin / 30) * 100)));

  // ── Factor 3: Growth vs the previous window. No history = neutral 60.
  const growthScore =
    growthPct === null ? 60 : Math.round(Math.max(0, Math.min(100, 50 + growthPct)));

  // ── Factor 4: Stock health — share of carried lines that are NOT low/out.
  const carried = products.filter((p) =>
    allocations.some((a) => a.product_id === p.id && a.branch_id === branch.id),
  ).length;
  const stockScore = carried === 0 ? 60 : Math.round(((carried - lowStock) / carried) * 100);

  const factors: HealthFactor[] = [
    {
      key: 'sales',
      label: 'Sales vs best shop',
      score: salesScore,
      weight: 0.3,
      detail:
        bestRevenue < 50
          ? 'Not enough sales anywhere yet — this eases off once trade picks up.'
          : `Trading at ${pct(bestRevenue > 0 ? (revenue / bestRevenue) * 100 : 0)} of the busiest shop.`,
      value: ghs(revenue),
      good: salesScore >= 60,
    },
    {
      key: 'profit',
      label: 'Profit margin',
      score: profitScore,
      weight: 0.3,
      detail:
        margin >= 25
          ? `Healthy ${margin.toFixed(0)}% margin — keep this mix.`
          : margin >= 10
            ? `Thinnish ${margin.toFixed(0)}% margin — costs are eating the sales.`
            : margin > 0
              ? `Only ${margin.toFixed(0)}% margin — barely covering cost.`
              : 'This shop is selling at a loss.',
      value: `${margin.toFixed(1)}%`,
      good: profitScore >= 60,
    },
    {
      key: 'growth',
      label: 'Momentum',
      score: growthScore,
      weight: 0.2,
      detail:
        growthPct === null
          ? 'No earlier period to compare against yet.'
          : growthPct >= 0
            ? `Up ${growthPct.toFixed(0)}% on the previous period.`
            : `Down ${Math.abs(growthPct).toFixed(0)}% on the previous period.`,
      value: growthPct === null ? '—' : pct(growthPct),
      good: growthScore >= 60,
    },
    {
      key: 'stock',
      label: 'Stock on the shelf',
      score: stockScore,
      weight: 0.2,
      detail:
        carried === 0
          ? 'No stock allocated to this shop yet.'
          : lowStock === 0
            ? `All ${carried} carried lines are stocked.`
            : `${lowStock} of ${carried} lines are low or out of stock.`,
      value: lowStock === 0 ? 'Full' : `${lowStock} low`,
      good: stockScore >= 60,
    },
  ];

  const score = Math.round(
    factors.reduce((sum, f) => sum + f.score * f.weight, 0),
  );

  const grade: BranchHealth['grade'] =
    score >= 75 ? 'Thriving' : score >= 55 ? 'Steady' : score >= 35 ? 'Watch' : 'Struggling';

  return {
    score,
    color: healthColor(score),
    grade,
    factors,
    revenue,
    profit,
    margin,
    transactions,
    units,
    avgSale,
    prevRevenue,
    growthPct,
    stockValue,
    lowStock,
    owed,
  };
}
