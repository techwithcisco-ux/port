import { db } from './db';
import { supabase } from './supabase';
import type { Product, ProductVariant, InventoryAllocation } from '@branchport/shared';

// Pushes every locally queued, not-yet-synced sale to Supabase. Each
// sale's id is client-generated (uuid, see requirements Section 5) so
// this is a plain insert, not an upsert — there is no edit path for a
// sale once created (append-only rule, requirements 4.1), so a retried
// push after a partial failure is safe: either the row already exists
// (insert fails harmlessly on the duplicate key, treat as success) or
// it doesn't yet (insert succeeds).
export async function pushQueuedSales(): Promise<{ pushed: number; failed: number }> {
  const queued = await db.sales.filter((s) => !s.synced).toArray();
  let pushed = 0;
  let failed = 0;

  for (const sale of queued) {
    const { synced: _synced, ...saleRow } = sale;
    const { error } = await supabase.from('sales').insert(saleRow);

    if (error && error.code !== '23505' /* unique_violation = already synced */) {
      failed += 1;
      continue;
    }
    await db.sales.update(sale.id, { synced: true });
    pushed += 1;
  }

  return { pushed, failed };
}

// Pulls the latest product catalog (with their variants) and this branch's
// current stock allocation so the sell screen has fresh data to work from
// offline. Call on login and whenever the app comes back online.
export async function pullLatestCatalog(branchId: string): Promise<void> {
  const { data: products } = await supabase.from('products').select('*');
  const { data: variantRows } = await supabase.from('product_variants').select('*');

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

  const { data: allocations } = await supabase
    .from('inventory_allocations')
    .select('*')
    .eq('branch_id', branchId);
  if (allocations) await db.allocations.bulkPut(allocations as InventoryAllocation[]);
}

// Wires the push/pull cycle to the browser's online/offline events, plus
// a periodic retry while online (covers the case where connectivity is
// flaky rather than cleanly on/off). Call this once from App.tsx after
// the user is authenticated and their branch_id is known.
export function startSyncLoop(branchId: string): () => void {
  const trySync = () => {
    if (navigator.onLine) {
      pushQueuedSales();
      pullLatestCatalog(branchId);
    }
  };

  window.addEventListener('online', trySync);
  const interval = setInterval(trySync, 30_000);
  trySync();

  return () => {
    window.removeEventListener('online', trySync);
    clearInterval(interval);
  };
}
