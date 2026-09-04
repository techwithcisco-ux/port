// Mirrors supabase/migrations/0001_schema.sql. Keep in sync by hand until
// the project is wired up to generate these from the live schema
// (`supabase gen types typescript`).

export type UserRole = 'owner' | 'manager' | 'staff';
export type SaleUnitType = 'bulk' | 'retail';

// ── Business form (retail model) ───────────────────────────────────────────

export type BusinessForm = 'retail' | 'wholesale' | 'both' | 'depo';

export const BUSINESS_FORM_LABELS: Record<BusinessForm, string> = {
  retail: 'Retail',
  wholesale: 'Wholesale',
  both: 'Both (Retail & Wholesale)',
  depo: 'Depo',
};

// ── Business types (owner selects during onboarding) ─────────────────────────

export type BusinessType =
  | 'grocery'
  | 'supermarket'
  | 'pharmacy'
  | 'electronics'
  | 'clothing'
  | 'hardware'
  | 'stationery'
  | 'provisions'
  | 'drinks'
  | 'bakery'
  | 'butchery'
  | 'cosmetics'
  | 'phone_accessories'
  | 'auto_parts'
  | 'building_materials'
  | 'agricultural'
  | 'fuel_station'
  | 'restaurant'
  | 'hair_salon'
  | 'tailoring'
  | 'printing'
  | 'welding'
  | 'plumbing'
  | 'furniture'
  | 'jewelry'
  | 'books'
  | 'sports'
  | 'toys'
  | 'baby_products'
  | 'pet_shop'
  | 'garden'
  | 'medical_supplies'
  | 'frozen_foods'
  | 'seafood'
  | 'spices'
  | 'beverages'
  | 'ice_cream'
  | 'laundry'
  | 'other';

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  grocery: 'Grocery / Provision Store',
  supermarket: 'Supermarket / Mini Market',
  pharmacy: 'Pharmacy / Chemist',
  electronics: 'Electronics / Gadgets',
  clothing: 'Clothing / Fashion',
  hardware: 'Hardware / Tools',
  stationery: 'Stationery / Office Supplies',
  provisions: 'Provisions / Bulk Foods',
  drinks: 'Drinks / Beverages',
  bakery: 'Bakery / Pastries',
  butchery: 'Butchery / Meat',
  cosmetics: 'Cosmetics / Beauty',
  phone_accessories: 'Phone Accessories',
  auto_parts: 'Auto Parts / Mechanics',
  building_materials: 'Building Materials',
  agricultural: 'Agricultural / Farm Supplies',
  fuel_station: 'Fuel Station',
  restaurant: 'Restaurant / Food Joint',
  hair_salon: 'Hair Salon / Barbershop',
  tailoring: 'Tailoring / Fashion Design',
  printing: 'Printing / Photography',
  welding: 'Welding / Metalwork',
  plumbing: 'Plumbing / Sanitary',
  furniture: 'Furniture / Upholstery',
  jewelry: 'Jewelry / Watches',
  books: 'Books / Media',
  sports: 'Sports / Fitness',
  toys: 'Toys / Games',
  baby_products: 'Baby Products / Maternity',
  pet_shop: 'Pet Shop / Supplies',
  garden: 'Garden / Landscaping',
  medical_supplies: 'Medical Supplies / Equipment',
  frozen_foods: 'Frozen Foods / Ice',
  seafood: 'Seafood / Fish',
  spices: 'Spices / Seasonings',
  beverages: 'Beverages / Juices',
  ice_cream: 'Ice Cream / Desserts',
  laundry: 'Laundry / Dry Cleaning',
  other: 'Other',
};

export interface Business {
  id: string;
  name: string;
  business_form?: BusinessForm;
  business_type?: BusinessType;
  business_categories?: BusinessType[];
  owner_user_id: string | null;
  created_at: string;
}

export interface Branch {
  id: string;
  business_id: string;
  name: string;
  created_at: string;
}

export interface AppUser {
  id: string;
  business_id: string;
  branch_id: string | null;
  role: UserRole;
  name: string;
  phone?: string | null;
  // Owner-generated password, stored as a simple base64 encoding in demo
  // mode (sufficient for the in-memory mock). In production this would be
  // a proper bcrypt/scrypt hash via Supabase Auth.
  password_hash?: string | null;
  // POS activation — phone-number-based auth. The owner generates a
  // unique activation link when onboarding a staff member. Opening that
  // link confirms "you are connecting to this owner's POS system" and
  // flips pos_activated to true. After activation the staff member logs
  // in with their phone number only (no password needed).
  pos_activated?: boolean;
  pos_activation_token?: string | null;
  created_at: string;
}

export interface ManagerAssignment {
  id: string;
  business_id: string;
  owner_user_id: string;
  manager_user_id: string;
  branch_id: string | null; // null = all branches, specific id = single branch
  assigned_at: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  price: number;
  // How many of the base (first) variant one of these equals — the stock
  // conversion factor, e.g. a bag of sugar that holds 24 cups has 24.
  base_units: number;
  sort_order: number;
  created_at: string;
}

export interface Product {
  id: string;
  business_id: string;
  name: string;
  bulk_unit_name: string;
  retail_unit_name: string;
  units_per_bulk: number;
  bulk_cost_price: number;
  bulk_sell_price: number;
  retail_sell_price: number;
  created_at: string;
  // The full variant list (0011). When absent (legacy products, or a
  // catalog row that hasn't pulled its variants yet) consumers fall back
  // to the synthetic retail/bulk variants via getProductVariants().
  variants?: ProductVariant[];
}

export interface Supplier {
  id: string;
  business_id: string;
  name: string;
  created_at: string;
}

export interface InventoryIntake {
  id: string;
  business_id: string;
  supplier_id: string;
  product_id: string;
  bulk_quantity: number;
  cost_price_total: number;
  amount_paid: number;
  amount_owed: number; // generated column
  created_at: string;
  created_by: string;
}

export interface InventoryAllocation {
  id: string;
  product_id: string;
  branch_id: string;
  bulk_quantity: number;
  retail_quantity_equivalent: number;
  allocated_at: string;
  allocated_by: string;
}

export interface Sale {
  id: string; // client-generated UUID, see requirements Section 5
  branch_id: string;
  product_id: string;
  unit_type: SaleUnitType;
  quantity: number;
  unit_price: number;
  total_price: number;
  sold_by: string;
  sold_at: string;
  client_reported_at: string;
  price_flagged: boolean;
  // Optional customer captured at the till (0009 migration). Not required —
  // informal-market cash sales can be anonymous. Travels with each sale row.
  customer_name?: string | null;
  customer_phone?: string | null;
  // The variant sold (0011). Null for legacy sales that predate variants.
  variant_id?: string | null;
  // Cut price / discount (new). When present, the customer pays this per unit
  // instead of unit_price. original_unit_price holds the list price for display.
  cut_price?: number | null;
  is_discounted?: boolean | null;
}

export type ReconciliationStatus = 'confirmed' | 'disputed';

// One recorded payment against a supplier. Payments are never folded into
// the intake rows (those are immutable); the running balance is always
// derived as sum(intake.amount_owed) - sum(supplier_payments).
export interface SupplierPayment {
  id: string;
  business_id: string;
  supplier_id: string;
  amount: number;
  note: string | null;
  paid_at: string;
  created_by: string;
}

// A statement that a supplier has reconciled (confirmed) the amount they
// owe. A first-class row so "has everyone actually confirmed?" is data.
export interface SupplierReconciliation {
  id: string;
  business_id: string;
  supplier_id: string;
  status: ReconciliationStatus;
  note: string | null;
  reconciled_at: string;
  created_by: string;
}

export interface AuditEvent {
  id: string;
  business_id: string;
  actor_user_id: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  occurred_at: string;
  client_reported_at: string | null;
}

// Local-only type used by the POS offline queue (packages/shared is
// imported by apps/pos for this). Not a database table.
export interface QueuedSale extends Sale {
  synced: boolean;
}

// ── Invoice (POS pending/completed invoices) ────────────────────────────────

export type InvoiceStatus = 'pending' | 'completed' | 'cancelled';

export interface InvoiceItem {
  product_id: string;
  product_name: string;
  variant_id: string | null;
  variant_name: string;
  quantity: number;
  unit_price: number; // the price the customer actually pays (cut price if discounted)
  original_unit_price?: number; // list price before discount (for display)
  is_discounted?: boolean;
  total: number;
}

export type PaymentMode = 'full' | 'partial' | 'credit';

export interface Invoice {
  id: string;
  invoice_number: string; // e.g. BP-202608-0001
  branch_id: string;
  created_by: string; // user id of staff who created it
  customer_name: string | null;
  customer_phone: string | null;
  items: InvoiceItem[];
  subtotal: number;
  tax_rate: number; // percentage e.g. 15 for 15%
  tax_amount: number;
  grand_total: number;
  payment_mode: PaymentMode; // full, partial, or credit
  amount_paid: number;       // how much the customer paid today
  amount_owed: number;       // grand_total - amount_paid (> 0 for partial/credit)
  status: InvoiceStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

// ── Market Intelligence types ──────────────────────────────────────────────

export interface ShopProfile {
  business_id: string;
  business_name: string;
  business_type: BusinessType;
  owner_name: string;
  branch_count: number;
  product_count: number;
  total_revenue_30d: number;
  total_sales_30d: number;
  top_product: string;
  top_product_revenue: number;
  region?: string;
  joined_at: string;
}

export interface CommodityItem {
  product_name: string;
  avg_price: number;
  min_price: number;
  max_price: number;
  total_sold_30d: number;
  total_revenue_30d: number;
  shop_count: number; // how many shops sell this
  price_trend: 'rising' | 'falling' | 'stable';
  trend_pct: number; // percentage change
  category: string;
}

export interface MarketReport {
  id: string;
  title: string;
  summary: string;
  generated_at: string;
  period: 'daily' | 'weekly' | 'monthly';
  top_commodities: string[];
  rising_items: string[];
  declining_items: string[];
  avg_basket_size: number;
  total_market_volume: number;
  total_market_revenue: number;
  shop_count: number;
}

export interface PriceMovement {
  product_name: string;
  current_price: number;
  prev_price_7d: number;
  prev_price_30d: number;
  change_7d_pct: number;
  change_30d_pct: number;
  volatility: 'low' | 'medium' | 'high';
}

// ── Accounting types ─────────────────────────────────────────────────────

/** Recurring expense categories common in Ghana retail. */
export type ExpenseCategory =
  | 'daily_tax'        // daily market/government levy
  | 'susu'             // daily susu collector
  | 'rent'             // shop rent
  | 'utilities'        // electricity, water
  | 'transport'        // delivery / transport costs
  | 'staff_wages'      // wages beyond salary
  | 'maintenance'      // shop repairs, equipment
  | 'packaging'        // bags, boxes, wrapping
  | 'advertising'      // marketing costs
  | 'misc';            // catch-all

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  daily_tax: 'Daily Tax / Levy',
  susu: 'Susu Collection',
  rent: 'Shop Rent',
  utilities: 'Utilities (Electric / Water)',
  transport: 'Transport / Delivery',
  staff_wages: 'Staff Wages',
  maintenance: 'Maintenance / Repairs',
  packaging: 'Packaging / Bags',
  advertising: 'Advertising / Marketing',
  misc: 'Miscellaneous',
};

export type ExpenseFrequency = 'daily' | 'weekly' | 'monthly' | 'one_off';

export interface Expense {
  id: string;
  business_id: string;
  branch_id: string | null; // null = business-wide
  category: ExpenseCategory;
  description: string;
  amount: number;
  frequency: ExpenseFrequency;
  start_date: string;       // ISO date
  end_date: string | null;  // null = ongoing
  created_by: string;
  created_at: string;
}

/** A single payment occurrence of a recurring or one-off expense. */
export interface ExpensePayment {
  id: string;
  expense_id: string;
  business_id: string;
  amount: number;
  paid_at: string;
  note: string;
  created_by: string;
}

export type DebtorCreditorStatus = 'pending' | 'partial' | 'settled';

export interface Debtor {
  id: string;
  business_id: string;
  branch_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  invoice_id: string | null; // linked POS invoice if partial payment
  original_amount: number;   // total debt amount
  amount_paid: number;       // how much they've paid so far
  amount_owed: number;       // original_amount - amount_paid
  status: DebtorCreditorStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface DebtorPayment {
  id: string;
  debtor_id: string;
  amount: number;
  note: string;
  paid_at: string;
  created_by: string;
}

export interface Creditor {
  id: string;
  business_id: string;
  supplier_name: string;
  supplier_phone: string | null;
  supplier_id: string | null; // linked supplier if known
  original_amount: number;
  amount_paid: number;
  amount_owed: number;
  status: DebtorCreditorStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CreditorPayment {
  id: string;
  creditor_id: string;
  amount: number;
  note: string;
  paid_at: string;
  created_by: string;
}