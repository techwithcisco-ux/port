import { db } from './db';
import { api } from './api';
import type { Product, ProductVariant, InventoryAllocation, Invoice, Debtor } from '@branchport/shared';

// Pushes every locally queued, not-yet-synced sale to the branchport API.
// Each sale's id is client-generated (uuid) so the first push is a plain
// insert. On resume/edit the POS re-uses the old row's id and rebuilds the
// values, which surfaces as a duplicate-key on the insert — we then PATCH
// the server row so a previously-synced sale doesn't keep its stale values
// (the old "duplicate = success" shortcut left the server diverged from the
// till after every invoice edit).
//
// The last failure reason is kept in module state (see getLastSyncError)
// so the till can SHOW staff why sales aren't syncing instead of failing
// silently. The classic cause: an expired/missing JWT — the API rejects
// every insert until staff sign in again.
let lastSyncError: string | null = null;
let lastSyncAt: string | null = null;

export function getLastSyncError(): string | null {
  return lastSyncError;
}

export function getLastSyncAt(): string | null {
  return lastSyncAt;
}

function shortSyncError(message: string): string {
  if (/not authenticated|session|token|jwt|401/i.test(message)) {
    return 'Session expired — sign out and sign back in with your phone + password.';
  }
  if (/network|fetch|failed to fetch|load failed|could not reach/i.test(message)) {
    return 'No connection — sales are safe on this device and will sync when you are back online.';
  }
  return message;
}

// Server-representable subset of a sale row (drops the local-only synced flag).
function saleRow(sale: Record<string, unknown>) {
  const { synced: _synced, ...rest } = sale;
  return rest;
}

// Mutable sale fields that an edited resume must push to the server.
const SALE_PATCH_FIELDS = [
  'product_id', 'variant_id', 'unit_type', 'quantity', 'unit_price', 'total_price',
  'sold_at', 'client_reported_at', 'customer_name', 'customer_phone',
  'cut_price', 'is_discounted',
] as const;

export async function pushQueuedSales(): Promise<{ pushed: number; failed: number }> {
  const queued = await db.sales.filter((s) => !s.synced).toArray();
  let pushed = 0;
  let failed = 0;

  for (const sale of queued) {
    const row = saleRow(sale as unknown as Record<string, unknown>);
    let error: { message: string; code?: string } | null = null;
    try {
      const res = await api.from('sales').insert(row);
      error = res.error;
    } catch (e) {
      error = { message: (e as Error).message || 'Network error' };
    }

    const isDuplicate = (error as { code?: string })?.code === '23505'
      || /duplicate key|unique constraint/i.test(error?.message ?? '');
    if (error && !isDuplicate) {
      failed += 1;
      lastSyncError = shortSyncError(error.message);
      continue;
    }

    // Duplicate: this row id already lives on the server (a resumed/edit
    // invoice re-used the id). Overwrite the mutable fields so the server
    // matches what the till actually sold.
    if (isDuplicate) {
      const patch: Record<string, unknown> = {};
      for (const f of SALE_PATCH_FIELDS) {
        if (f in row) patch[f] = row[f];
      }
      try {
        const res = await api.from('sales').update(patch).eq('id', sale.id);
        if (res.error) {
          failed += 1;
          lastSyncError = shortSyncError(res.error.message);
          continue;
        }
      } catch (e) {
        failed += 1;
        lastSyncError = shortSyncError((e as Error).message || 'Network error');
        continue;
      }
    }

    await db.sales.update(sale.id, { synced: true });
    pushed += 1;
  }

  lastSyncAt = new Date().toISOString();
  if (failed === 0) lastSyncError = null;

  return { pushed, failed };
}

// Ledger retry queue: invoices and debtors written while offline (or whose
// upsert failed) carry serverSynced=false locally. This re-attempts each one
// until the server confirms, so a network blip never permanently strands a
// credit sale's debtor record. Idempotent — upsert by id.
export async function pushLedger(): Promise<{ pushed: number; failed: number }> {
  let pushed = 0;
  let failed = 0;

  const pendingInvoices = await db.invoices
    .filter((i) => i.serverSynced !== true)
    .toArray();
  for (const inv of pendingInvoices) {
    const { serverSynced: _s, ...rest } = inv as unknown as Record<string, unknown>;
    try {
      const res = await api.from('invoices').upsert(rest);
      if (res.error) {
        failed += 1;
        lastSyncError = shortSyncError(res.error.message);
      } else {
        await db.invoices.update(inv.id, { serverSynced: true });
        pushed += 1;
      }
    } catch (e) {
      failed += 1;
      lastSyncError = shortSyncError((e as Error).message || 'Network error');
    }
  }

  const pendingDebtors = await db.debtors
    .filter((d) => d.serverSynced !== true)
    .toArray();
  for (const d of pendingDebtors) {
    const { serverSynced: _s, ...rest } = d as unknown as Record<string, unknown>;
    try {
      const res = await api.from('debtors').upsert(rest);
      if (res.error) {
        failed += 1;
        lastSyncError = shortSyncError(res.error.message);
      } else {
        await db.debtors.update(d.id, { serverSynced: true });
        pushed += 1;
      }
    } catch (e) {
      failed += 1;
      lastSyncError = shortSyncError((e as Error).message || 'Network error');
    }
  }

  if (failed === 0 && lastSyncError === null) lastSyncError = null;
  return { pushed, failed };
}

// Pulls the latest product catalog (with their variants), this branch's
// stock allocations, AND this branch's recent sales + ledger so the sell
// screen and stock math see the WHOLE branch — not just this device's
// sales. Call on login and whenever the app comes back online.
export async function pullLatestCatalog(branchId: string): Promise<void> {
  const { data: products } = await api.from('products').select('*').limit(2000);
  const { data: variantRows } = await api.from('product_variants').select('*').limit(2000);

  const variantsByProduct = new Map<string, ProductVariant[]>();
  for (const v of (variantRows as ProductVariant[] | null) ?? []) {
    const list = variantsByProduct.get(v.product_id) ?? [];
    list.push(v);
    variantsByProduct.set(v.product_id, list);
  }
  const enriched = ((products as Product[] | null) ?? []).map((p) => ({
    ...p,
    variants: (variantsByProduct.get(p.id) ?? []).sort((a, b) => a.sort_order - b.sort_order),
  }));
  if (enriched.length > 0) await db.products.bulkPut(enriched);

  const { data: allocations } = await api
    .from('inventory_allocations')
    .select('*')
    .eq('branch_id', branchId)
    .limit(2000);
  if (allocations) await db.allocations.bulkPut(allocations as InventoryAllocation[]);

  // Branch sales, last 30 days, newest first. Merged into db.sales by id —
  // rows this device already has (unsynced) are simply overwritten once the
  // push above confirms them, and rows sold on a sibling till arrive here so
  // stockFor() reflects the whole branch. synced:true stops them re-queuing.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: salesRows } = await api
    .from('sales')
    .select('*')
    .eq('branch_id', branchId)
    .gte('sold_at', since)
    .order('sold_at', { ascending: false })
    .limit(2000);
  if (salesRows && Array.isArray(salesRows) && salesRows.length > 0) {
    const syncedRows = (salesRows as Record<string, unknown>[]).map((s) => ({
      ...s,
      synced: true,
    }));
    await db.sales.bulkPut(syncedRows as never);
  }

  // Ledger: invoices + debtors for this branch (skips rows with local
  // pending changes so a retry isn't clobbered by an older server copy).
  const { data: invoiceRows } = await api
    .from('invoices')
    .select('*')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (invoiceRows && Array.isArray(invoiceRows) && invoiceRows.length > 0) {
    const localPending = new Set(
      (await db.invoices.filter((i) => i.serverSynced !== true).toArray()).map((i) => i.id),
    );
    const toPut = (invoiceRows as Invoice[])
      .filter((i) => !localPending.has(i.id))
      .map((i) => ({ ...i, serverSynced: true }));
    if (toPut.length > 0) await db.invoices.bulkPut(toPut as never);
  }

  const { data: debtorRows } = await api
    .from('debtors')
    .select('*')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (debtorRows && Array.isArray(debtorRows) && debtorRows.length > 0) {
    const localPending = new Set(
      (await db.debtors.filter((d) => d.serverSynced !== true).toArray()).map((d) => d.id),
    );
    const toPut = (debtorRows as Debtor[])
      .filter((d) => !localPending.has(d.id))
      .map((d) => ({ ...d, serverSynced: true }));
    if (toPut.length > 0) await db.debtors.bulkPut(toPut as never);
  }

  // Expenses + payments (business-wide, branch_id filter where present).
  const { data: expenseRows } = await api
    .from('expenses')
    .select('*')
    .eq('branch_id', branchId)
    .limit(500);
  if (expenseRows && Array.isArray(expenseRows) && expenseRows.length > 0) {
    await db.expenses.bulkPut(expenseRows as never);
  }
  const { data: expensePayRows } = await api.from('expense_payments').select('*').limit(1000);
  if (expensePayRows && Array.isArray(expensePayRows) && expensePayRows.length > 0) {
    await db.expense_payments.bulkPut(expensePayRows as never);
  }

  // Creditors (supplier bills) — business-scoped, small table.
  const { data: creditorRows } = await api.from('creditors').select('*').limit(500);
  if (creditorRows && Array.isArray(creditorRows) && creditorRows.length > 0) {
    await db.creditors.bulkPut(creditorRows as never);
  }
  const { data: creditorPayRows } = await api.from('creditor_payments').select('*').limit(1000);
  if (creditorPayRows && Array.isArray(creditorPayRows) && creditorPayRows.length > 0) {
    await db.creditor_payments.bulkPut(creditorPayRows as never);
  }
}

// Full sync pass: push outbound queues first (so this device's fresh sales
// and ledger edits reach the server), then pull the branch-wide read model.
export async function syncNow(branchId: string): Promise<void> {
  if (!navigator.onLine) return;
  await pushQueuedSales();
  await pushLedger();
  await pullLatestCatalog(branchId);
}

// Wires the push/pull cycle to the browser's online/offline events, plus
// a periodic retry while online (covers the case where connectivity is
// flaky rather than cleanly on/off). Call this once from App.tsx after
// the user is authenticated and their branch_id is known.
export function startSyncLoop(branchId: string): () => void {
  const trySync = () => {
    void syncNow(branchId);
  };

  window.addEventListener('online', trySync);
  const interval = setInterval(trySync, 30_000);
  trySync();

  return () => {
    window.removeEventListener('online', trySync);
    clearInterval(interval);
  };
}
