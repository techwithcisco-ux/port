// Allowlist + scoping rules for the generic /api/:table gateway.
// Business scoping is enforced server-side from the JWT — clients cannot
// escape their business even by omitting filters.

export const TABLES = new Set([
  'businesses',
  'branches',
  'users',
  'products',
  'product_variants',
  'suppliers',
  'inventory_intake',
  'inventory_allocations',
  'sales',
  'supplier_payments',
  'supplier_reconciliations',
  'audit_events',
  'query_log',
  'expenses',
  'expense_payments',
  'invoices',
  'debtors',
  'debtor_payments',
  'creditors',
  'creditor_payments',
  'flagged_backdated_events',
]);

// Tables the API writes an audit_events row for on mutation.
export const AUDITED = new Set([
  'products',
  'product_variants',
  'suppliers',
  'inventory_intake',
  'inventory_allocations',
  'sales',
  'supplier_payments',
  'supplier_reconciliations',
  'branches',
  'users',
  'invoices',
  'expenses',
  'debtors',
  'creditors',
]);

// Columns allowed inHonda generic filters — everything else is rejected to
// keep the gateway from becoming arbitrary SQL.
const FILTERABLE = new Set([
  'id', 'business_id', 'branch_id', 'product_id', 'supplier_id',
  'role', 'phone', 'pos_activation_token', 'entity_type', 'actor_user_id',
  'status', 'sold_at', 'created_at', 'occurred_at', 'paid_at',
  'reconciled_at', 'allocated_at', 'category', 'frequency',
  'invoice_id', 'debtor_id', 'creditor_id', 'expense_id',
  'customer_phone', 'invoice_number', 'name',
]);

export function assertTable(t) {
  if (!TABLES.has(t)) {
    const e = new Error('Unknown table: ' + t);
    e.status = 400;
    throw e;
  }
}

export function assertColumn(c) {
  if (!FILTERABLE.has(c)) {
    const e = new Error('Filtering by column not allowed: ' + c);
    e.status = 400;
    throw e;
  }
}

// Minimum role required to write each table. Reads are scoped below;
// audit_events + query_log have extra rules in index.js.
export const WRITE_ROLES = {
  businesses: ['owner'],
  branches: ['manager', 'owner'],
  users: ['manager', 'owner'],
  products: ['manager', 'owner'],
  product_variants: ['manager', 'owner'],
  suppliers: ['manager', 'owner'],
  inventory_intake: ['manager', 'owner'],
  inventory_allocations: ['manager', 'owner'],
  sales: ['staff', 'manager', 'owner'],
  supplier_payments: ['manager', 'owner'],
  supplier_reconciliations: ['owner'],
  audit_events: [], // never via gateway (API writes internally)
  query_log: ['owner'],
  expenses: ['manager', 'owner'],
  expense_payments: ['manager', 'owner'],
  invoices: ['staff', 'manager', 'owner'],
  debtors: ['manager', 'owner'],
  debtor_payments: ['manager', 'owner'],
  creditors: ['manager', 'owner'],
  creditor_payments: ['manager', 'owner'],
  flagged_backdated_events: ['manager', 'owner'],
};
