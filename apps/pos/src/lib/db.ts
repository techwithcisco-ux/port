import Dexie, { Table } from 'dexie';
import type {
  InventoryAllocation,
  Product,
  QueuedSale,
  Invoice,
  Expense,
  ExpensePayment,
  Debtor,
  DebtorPayment,
  Creditor,
  CreditorPayment,
} from '@branchport/shared';

// Local-first storage for the POS. Per requirements.txt Section 5:
// a sale is written here immediately (instant UI feedback, works with
// zero connectivity), then synced out via sync.ts when a connection is
// available. `synced` distinguishes rows still in the outbound queue
// from ones already confirmed on the server.
class BranchPortLocalDB extends Dexie {
  sales!: Table<QueuedSale, string>;
  // Cached read models so the sell screen and stock view work offline
  // too, not just sale creation. Synced down on login / reconnect —
  // see sync.ts pullLatestCatalog().
  products!: Table<Product, string>;
  allocations!: Table<InventoryAllocation, string>;
  invoices!: Table<Invoice, string>;
  expenses!: Table<Expense, string>;
  expense_payments!: Table<ExpensePayment, string>;
  debtors!: Table<Debtor, string>;
  debtor_payments!: Table<DebtorPayment, string>;
  creditors!: Table<Creditor, string>;
  creditor_payments!: Table<CreditorPayment, string>;

  constructor() {
    super('branchport-pos');
    this.version(3).stores({
      sales: 'id, synced, branch_id, sold_at',
      products: 'id, business_id',
      allocations: 'id, branch_id, product_id',
      invoices: 'id, branch_id, status, created_at, invoice_number, customer_phone',
      expenses: 'id, business_id, branch_id, category, frequency',
      expense_payments: 'id, expense_id, paid_at',
      debtors: 'id, business_id, branch_id, status, customer_phone, invoice_id',
      debtor_payments: 'id, debtor_id, paid_at',
      creditors: 'id, business_id, status, supplier_id',
      creditor_payments: 'id, creditor_id, paid_at',
    });
  }
}

export const db = new BranchPortLocalDB();
