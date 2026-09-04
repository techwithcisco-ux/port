// ── Feature Configuration ────────────────────────────────────────────────
// Every accounting/financial feature in BranchPort is toggleable.
// The owner controls which features are visible across the platform.
// Each feature has: key, label, description, default enabled state per role.
// Config is persisted to localStorage and optionally synced to the DB.

export type FeatureKey =
  // Owner accounting features
  | 'owner_balance_sheet'
  | 'owner_trading_account'
  | 'owner_profit_loss'
  | 'owner_cash_flow'
  | 'owner_equity_statement'
  // Manager accounting features
  | 'manager_profit_loss'
  | 'manager_sales_report'
  | 'manager_expenses'
  | 'manager_ledger'
  // Inventory / stock features
  | 'stock_balance_overview'
  | 'stock_balance_per_branch'
  | 'stock_balance_per_item'
  // POS features
  | 'pos_balance_sheet'
  | 'pos_profit_display'
  | 'pos_invoice_history'
  | 'posCalculator'
  // Owner oversight features
  | 'owner_market_intelligence'
  | 'owner_audit_log'
  | 'owner_flags'
  | 'owner_managers';

export interface FeatureDef {
  key: FeatureKey;
  label: string;
  description: string;
  section: 'owner_accounting' | 'manager_accounting' | 'inventory' | 'pos' | 'owner_oversight';
  /** Default enabled state for each role */
  defaults: { owner: boolean; manager: boolean; staff: boolean };
}

export const ALL_FEATURES: FeatureDef[] = [
  // ── Owner accounting ──
  {
    key: 'owner_balance_sheet',
    label: 'Balance Sheet',
    description: 'Professional balance sheet showing assets, liabilities, and equity at a point in time.',
    section: 'owner_accounting',
    defaults: { owner: true, manager: false, staff: false },
  },
  {
    key: 'owner_trading_account',
    label: 'Trading Account',
    description: 'Opening stock, purchases, closing stock, and gross profit for the trading period.',
    section: 'owner_accounting',
    defaults: { owner: true, manager: false, staff: false },
  },
  {
    key: 'owner_profit_loss',
    label: 'Profit & Loss Account',
    description: 'Full professional P&L statement with revenue, COGS, expenses, and net profit.',
    section: 'owner_accounting',
    defaults: { owner: true, manager: true, staff: false },
  },
  {
    key: 'owner_cash_flow',
    label: 'Cash Flow Statement',
    description: 'Cash inflows and outflows from operations, investing, and financing.',
    section: 'owner_accounting',
    defaults: { owner: true, manager: false, staff: false },
  },
  {
    key: 'owner_equity_statement',
    label: 'Equity Statement',
    description: 'Changes in owner equity over the period including retained earnings.',
    section: 'owner_accounting',
    defaults: { owner: true, manager: false, staff: false },
  },

  // ── Manager accounting ──
  {
    key: 'manager_profit_loss',
    label: 'P&L Statement',
    description: 'Profit & Loss statement for the manager view.',
    section: 'manager_accounting',
    defaults: { owner: true, manager: true, staff: false },
  },
  {
    key: 'manager_sales_report',
    label: 'Sales Report',
    description: 'Detailed sales report with filters, charts, and CSV export.',
    section: 'manager_accounting',
    defaults: { owner: true, manager: true, staff: false },
  },
  {
    key: 'manager_expenses',
    label: 'Expenses Tracker',
    description: 'Track recurring expenses like daily tax, susu, rent, utilities.',
    section: 'manager_accounting',
    defaults: { owner: true, manager: true, staff: false },
  },
  {
    key: 'manager_ledger',
    label: 'Debtors & Creditors Ledger',
    description: 'Track money owed to you and money you owe.',
    section: 'manager_accounting',
    defaults: { owner: true, manager: true, staff: false },
  },

  // ── Inventory / stock ──
  {
    key: 'stock_balance_overview',
    label: 'Stock Balance Overview',
    description: 'Combined stock quantities and cost values across all branches.',
    section: 'inventory',
    defaults: { owner: true, manager: true, staff: false },
  },
  {
    key: 'stock_balance_per_branch',
    label: 'Stock by Branch',
    description: 'Drill down into stock quantities and costs per individual branch.',
    section: 'inventory',
    defaults: { owner: true, manager: true, staff: false },
  },
  {
    key: 'stock_balance_per_item',
    label: 'Stock by Item',
    description: 'See quantity and cost balance of each item across all branches, with per-branch breakdown.',
    section: 'inventory',
    defaults: { owner: true, manager: true, staff: false },
  },

  // ── POS ──
  {
    key: 'pos_balance_sheet',
    label: 'POS Balance Sheet',
    description: 'Professional balance sheet for each individual POS terminal / branch.',
    section: 'pos',
    defaults: { owner: true, manager: true, staff: true },
  },
  {
    key: 'pos_profit_display',
    label: 'Show Profit at POS',
    description: 'Display cost price and profit margin on the POS till for owner/manager.',
    section: 'pos',
    defaults: { owner: true, manager: true, staff: false },
  },
  {
    key: 'pos_invoice_history',
    label: 'Invoice History',
    description: 'View past invoices at the POS terminal.',
    section: 'pos',
    defaults: { owner: true, manager: true, staff: true },
  },
  {
    key: 'posCalculator',
    label: 'POS Calculator',
    description: 'Built-in calculator on the POS sell screen.',
    section: 'pos',
    defaults: { owner: true, manager: true, staff: true },
  },

  // ── Owner oversight ──
  {
    key: 'owner_market_intelligence',
    label: 'Market Intelligence',
    description: 'Cross-market analytics, commodity tracking, price intelligence.',
    section: 'owner_oversight',
    defaults: { owner: true, manager: false, staff: false },
  },
  {
    key: 'owner_audit_log',
    label: 'Audit Log',
    description: 'Every action, every actor, every branch — unfiltered.',
    section: 'owner_oversight',
    defaults: { owner: true, manager: false, staff: false },
  },
  {
    key: 'owner_flags',
    label: 'Pricing Flags',
    description: 'Pricing anomalies and possible backdating, surfaced automatically.',
    section: 'owner_oversight',
    defaults: { owner: true, manager: false, staff: false },
  },
  {
    key: 'owner_managers',
    label: 'Assign Managers',
    description: 'Manage manager assignments across branches.',
    section: 'owner_oversight',
    defaults: { owner: true, manager: false, staff: false },
  },
];

// ── Config state ────────────────────────────────────────────────────────

export type FeatureConfig = Partial<Record<FeatureKey, boolean>>;

const CONFIG_STORAGE_KEY = 'branchport-feature-config-v1';

/** Get defaults for a role. */
export function getDefaultConfig(role: 'owner' | 'manager' | 'staff'): FeatureConfig {
  const config: FeatureConfig = {};
  for (const f of ALL_FEATURES) {
    config[f.key] = f.defaults[role];
  }
  return config;
}

/** Load config from localStorage. Falls back to role defaults. */
export function loadFeatureConfig(role: 'owner' | 'manager' | 'staff'): FeatureConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as FeatureConfig;
      // Merge with defaults so new features get their default value
      const defaults = getDefaultConfig(role);
      return { ...defaults, ...stored };
    }
  } catch { /* corrupt storage — use defaults */ }
  return getDefaultConfig(role);
}

/** Save config to localStorage. */
export function saveFeatureConfig(config: FeatureConfig): void {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch { /* quota exceeded */ }
}

/** Check if a feature is enabled. */
export function isFeatureEnabled(config: FeatureConfig, key: FeatureKey): boolean {
  return config[key] ?? false;
}

/** Get all features for a given section. */
export function getFeaturesBySection(section: FeatureDef['section']): FeatureDef[] {
  return ALL_FEATURES.filter((f) => f.section === section);
}

/** Section labels for the settings UI. */
export const SECTION_LABELS: Record<FeatureDef['section'], string> = {
  owner_accounting: 'Owner Accounting',
  manager_accounting: 'Manager Accounting',
  inventory: 'Inventory & Stock',
  pos: 'Point of Sale',
  owner_oversight: 'Owner Oversight',
};
