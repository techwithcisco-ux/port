import type { AuditEvent } from '@branchport/shared';
import { formatGHS } from './utils';

// Turns raw audit_events rows into sentences an owner can read without
// a JSON viewer. The raw before/after states stay one click away in the
// UI; the human summary is the default view (this file exists because
// reviewing rows like the one in the feedback means an old lady or man
// should NOT have to read `{ "unit_price": 15, ... }`).

export interface NameCtx {
  product(id: string): string;
  branch(id: string): string;
  supplier(id: string): string;
  user(id: string): string;
}

function fmtQty(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '');
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export function humanizeEvent(e: AuditEvent, ctx: NameCtx): string {
  const actor = ctx.user(e.actor_user_id);
  const after = (e.after_state ?? {}) as Record<string, unknown>;
  const before = (e.before_state ?? {}) as Record<string, unknown>;

  switch (e.entity_type) {
    case 'sales': {
      const unit = String(after.unit_type ?? 'unit');
      const line = `${actor} sold ${fmtQty(after.quantity)} ${unit} of ${ctx.product(String(after.product_id))} at ${ctx.branch(String(after.branch_id))} for ${formatGHS(Number(after.total_price))}`;
      return after.price_flagged ? `${line} — PRICE FLAGGED` : line;
    }
    case 'inventory_intake': {
      const cost = Number(after.cost_price_total ?? before.cost_price_total ?? 0);
      const paid = Number(after.amount_paid ?? before.amount_paid ?? 0);
      const owed = Number(after.amount_owed ?? cost - paid);
      return `${actor} recorded ${fmtQty(after.bulk_quantity)} ${ctx.product(String(after.product_id))} from ${ctx.supplier(String(after.supplier_id))} — cost ${formatGHS(cost)}, paid ${formatGHS(paid)}, owed ${formatGHS(owed)}`;
    }
    case 'inventory_allocations': {
      return `${actor} allocated ${fmtQty(after.bulk_quantity)} of ${ctx.product(String(after.product_id))} to ${ctx.branch(String(after.branch_id))} (${fmtQty(after.retail_quantity_equivalent)} retail units)`;
    }
    case 'supplier_payments': {
      return `${actor} recorded a payment of ${formatGHS(Number(after.amount ?? before.amount ?? 0))} to ${ctx.supplier(String(after.supplier_id))}${after.note ? ` — ${String(after.note)}` : ''}`;
    }
    case 'supplier_reconciliations': {
      const status = String(after.status ?? 'confirmed');
      const line = status === 'disputed' ? 'disputed' : 'confirmed';
      return `${actor} ${line} ${ctx.supplier(String(after.supplier_id))}'s balance${after.note ? ` — ${String(after.note)}` : ''}`;
    }
    case 'products':
    case 'suppliers': {
      const name = String(after.name ?? before.name ?? '');
      const noun = e.entity_type === 'products' ? 'product' : 'supplier';
      const verb = e.action_type === 'update' ? 'updated' : 'added';
      return `${actor} ${verb} ${noun}${name ? ` ${name}` : ''}`;
    }
    case 'users': {
      const name = String(after.name ?? before.name ?? '');
      if (e.action_type === 'self_assign_manager') {
        return `${actor} assigned themselves as manager — full POS and stock access enabled`;
      }
      const verb = e.action_type === 'update' ? 'updated' : 'invited';
      return `${actor} ${verb} staff member${name ? ` ${name}` : ''}`;
    }
    case 'invoices': {
      const invNum = String(after.invoice_number ?? '');
      const total = Number(after.grand_total ?? 0);
      const status = String(after.status ?? 'completed');
      if (e.action_type === 'insert') {
        return `${actor} created invoice ${invNum} for ${formatGHS(total)} [${status}]`;
      }
      return `${actor} ${e.action_type} invoice ${invNum}`;
    }
    case 'expenses': {
      const desc = String(after.description ?? before.description ?? '');
      const amt = Number(after.amount ?? before.amount ?? 0);
      if (e.action_type === 'insert') {
        return `${actor} added expense: ${desc} — ${formatGHS(amt)}`;
      }
      return `${actor} ${e.action_type} expense: ${desc}`;
    }
    case 'expense_payments': {
      const amt = Number(after.amount ?? 0);
      return `${actor} paid ${formatGHS(amt)} toward an expense`;
    }
    case 'debtors': {
      const name = String(after.customer_name ?? '');
      const amt = Number(after.original_amount ?? 0);
      return `${actor} recorded debtor ${name} — ${formatGHS(amt)}`;
    }
    case 'creditors': {
      const name = String(after.supplier_name ?? '');
      const amt = Number(after.original_amount ?? 0);
      return `${actor} recorded creditor ${name} — ${formatGHS(amt)}`;
    }
    case 'branches': {
      const name = String(after.name ?? before.name ?? '');
      const verb = e.action_type === 'update' ? 'updated' : 'created';
      return `${actor} ${verb} branch: ${name}`;
    }
    default: {
      const verb = e.action_type === 'update' ? 'updated' : 'created';
      return `${actor} ${verb} ${e.entity_type.replace(/_/g, ' ')}`;
    }
  }
}

export function humanizeDiff(e: AuditEvent): Array<[string, string, string]> {
  if (e.action_type !== 'update') return [];
  const before = (e.before_state ?? {}) as Record<string, unknown>;
  const after = (e.after_state ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: Array<[string, string, string]> = [];
  for (const k of keys) {
    if (k === 'id' || k === 'created_at' || k === 'occurred_at') continue;
    const b = JSON.stringify(before[k]);
    const a = JSON.stringify(after[k]);
    if (b !== a) out.push([k, String(before[k] ?? '—'), String(after[k] ?? '—')]);
  }
  return out;
}

export function searchMatches(e: AuditEvent, q: string, ctx: NameCtx): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    e.entity_type,
    e.action_type,
    e.entity_id,
    ctx.user(e.actor_user_id),
    humanizeEvent(e, ctx),
    JSON.stringify(e.before_state ?? {}),
    JSON.stringify(e.after_state ?? {}),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

const MONEY_FIELDS = new Set([
  'unit_price',
  'total_price',
  'cost_price_total',
  'amount_paid',
  'amount_owed',
  'amount',
  'bulk_cost_price',
  'bulk_sell_price',
  'retail_sell_price',
]);

const ID_FIELDS: Record<string, keyof NameCtx> = {
  product_id: 'product',
  branch_id: 'branch',
  supplier_id: 'supplier',
  sold_by: 'user',
  created_by: 'user',
  allocated_by: 'user',
  actor_user_id: 'user',
};

const QTY_FIELDS = new Set(['quantity', 'bulk_quantity', 'units_per_bulk']);
const RETAIL_QTY_FIELDS = new Set(['retail_quantity_equivalent']);

// "Every log data structured" — the contextual, field-by-field view of a
// single record. Turns a raw before/after state (which is what the DB
// stores) into readable labeled pairs: ids become business names, prices
// become GHS, quantities keep their units. Used wherever a log row was
// previously dumped as raw JSON (audit log expansion, agent evidence).
export function structuredFields(
  entityType: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  ctx: NameCtx
): Array<{ label: string; value: string }> {
  const present = (o: Record<string, unknown> | null, k: string): unknown =>
    o && k in o ? o[k] : null;

  const fmt = (tag: string, k: string): string | null => {
    const current = present(after, k) ?? present(before, k);
    if (current === null || current === undefined || current === '') return null;
    const s = typeof current === 'object' ? JSON.stringify(current) : String(current);
    if (MONEY_FIELDS.has(k)) {
      const n = Number(current);
      return Number.isFinite(n) ? formatGHS(n) : s;
    }
    if (k === 'units_per_bulk') return `${fmtQty(current)} per bulk unit`;
    if (QTY_FIELDS.has(k)) return `${fmtQty(current)}`;
    if (RETAIL_QTY_FIELDS.has(k)) return `${fmtQty(current)} retail units`;
    if (k === 'price_flagged') return current === true ? 'Yes' : 'No';
    if (k === 'status') return s;
    if (k === 'unit_type') return s === 'retail' ? 'retail (cup/bowl/each)' : s === 'bulk' ? 'bulk (bag/gallon/box)' : s;
    if (ID_FIELDS[k]) {
      const name = ctx[ID_FIELDS[k]](String(current));
      return name === '—' && s === current ? s : name;
    }
    if (/_(at|by)$/.test(k) || k === 'sold_at' || k === 'paid_at' || k === 'allocated_at' || k === 'reconciled_at' || k === 'occurred_at' || k === 'created_at' || k === 'client_reported_at') {
      const d = new Date(String(current));
      return isNaN(d.getTime()) ? s : d.toLocaleString();
    }
    return s;
  };

  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const out: Array<{ label: string; value: string }> = [];
  const labels: Record<string, string> = {
    name: 'Name', amount: 'Amount', note: 'Note', status: 'Status',
    bulk_unit_name: 'Bulk unit', retail_unit_name: 'Retail unit',
    bulk_cost_price: 'Cost (bulk)', bulk_sell_price: 'Sell (bulk)', retail_sell_price: 'Sell (retail)',
    units_per_bulk: 'Units per bulk', product_id: 'Product', branch_id: 'Branch',
    supplier_id: 'Supplier', sold_by: 'Sold by', created_by: 'Recorded by', allocated_by: 'Allocated by',
    quantity: 'Quantity', bulk_quantity: 'Bulk quantity', retail_quantity_equivalent: 'Retail equivalent',
    unit_type: 'Unit', unit_price: 'Unit price', total_price: 'Total',
    cost_price_total: 'Cost total', amount_paid: 'Paid', amount_owed: 'Owed',
    price_flagged: 'Price flagged', role: 'Role', business_id: 'Business',
    sold_at: 'Sold at', paid_at: 'Paid at', allocated_at: 'Allocated at', reconciled_at: 'Reconciled at',
    occurred_at: 'Recorded at', created_at: 'Created', client_reported_at: 'Claimed at', gap_minutes: 'Clock gap (min)',
  };

  for (const k of keys) {
    if (k === 'id' || k === 'entity_id') continue;
    const v = fmt(entityType, k);
    if (v === null) continue;
    out.push({ label: labels[k] ?? k.replace(/_/g, ' '), value: v });
  }

  return out;
}