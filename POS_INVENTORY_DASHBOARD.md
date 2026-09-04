# BranchPort POS: Enhanced Inventory Dashboard

## What Was Implemented

A comprehensive inventory management dashboard for the POS system, modeled after the owner's analytics dashboard but tailored for staff branch operations. Staff can now toggle between the point-of-sale till and a detailed inventory analytics view.

---

## Key Features

### 1. **Inventory Calculation Engine** (`apps/pos/src/lib/inventory.ts`)

Utility functions for real-time inventory analytics:

- **getProductInventoryStatus()** - Complete metrics per product:
  - Allocated quantity (stock assigned to branch)
  - Sold quantity (units sold today)
  - Remaining quantity (allocated - sold)
  - Revenue today (actual sales)
  - Profit/loss (revenue - cost of goods sold)
  - Inventory value (remaining stock × cost price)
  - Potential revenue (remaining stock × retail price)
  - Stock health status (healthy/low-stock/sold-out)

- **getInventoryStats()** - Branch-level summary:
  - Total revenue today
  - Total units sold
  - Total inventory value (all stock at cost)
  - Total potential revenue (unsold stock value)

- **getTopProductsByRevenue()** - Sales leaders:
  - Products ranked by today's revenue
  - Units sold per product
  - Potential revenue from remaining stock

- **getUnsoldProducts()** - Opportunity tracking:
  - Products with inventory but zero sales today
  - Remaining quantity and potential revenue

- **Helper functions**:
  - `getRemainingStock()` - Live calculation (allocated - sold in retail units)
  - `getAllProductInventoryStatus()` - Full inventory catalog sorted by value

---

### 2. **Staff Inventory Dashboard** (`apps/pos/src/routes/Dashboard.tsx`)

A monochrome, responsive dashboard matching the owner's style:

#### Summary Statistics (4 Cards)
- **Revenue Today** - GHS total with units sold
- **Inventory Value** - Cost basis of allocated stock
- **Potential Revenue** - Revenue available from unsold stock
- **Active Products** - Total catalog items

#### Top Sellers Table
Shows today's best performers:
- Product name
- Units sold
- Actual revenue
- Potential revenue from remaining stock

#### Complete Inventory Status Table
Full branch inventory breakdown, sorted by inventory value:
- Product name and unit type
- Quantities: Allocated / Sold / Remaining
- Inventory value (cost-based)
- Stock health badges (Sold Out / Low Stock / Healthy)

#### Unsold Products Table
Highlights products not moving today:
- Product name
- Remaining quantity
- Potential revenue (if sold out)
- Motivates staff to cross-sell or promote

---

## Design & UX

**Monochrome, minimal aesthetic:**
- Gray-50 (light backgrounds) to gray-900 (text/buttons)
- No bright colors, no gradients
- Rounded-2xl cards with subtle shadows
- Tabular-nums for money/quantities (aligned columns)

**Navigation:**
- Sticky header with "Point of Sale" / "Inventory" toggle tabs
- Quick switch between till (/) and dashboard (/dashboard)
- Current tab highlighted (dark bg), inactive tab lighter

**Responsive:**
- 2-column grid on mobile for stat cards
- 4-column on larger screens
- Scrollable tables on small devices
- Max-width container on larger screens

---

## Data Flow

All calculations work **offline-first** from local Dexie cache:

1. **Products** - Synced on login via `pullLatestCatalog()`
2. **Allocations** - Branch's assigned stock
3. **Sales** - Local sales (queued + synced), branched filtered
4. **Calculations** - Derived in real-time from these three tables

No direct Supabase queries on the dashboard—everything is computed locally, making it work perfectly offline.

---

## Metrics Explained

### Inventory Value
**Formula:** Remaining stock × cost price per unit

Tells staff the financial value of unsold inventory. Based on cost (what was paid), not retail (what it would sell for).

### Potential Revenue
**Formula:** Remaining stock × retail price per unit

Motivational metric—if all remaining stock is sold at current prices, how much revenue is possible.

### Profit/Loss Today
**Formula:** Revenue - (Units sold × cost price per unit)

Shows profitability: revenue minus cost of goods sold. Identifies which products are most profitable.

### Stock Status
- **Healthy** — Remaining stock > 20% of allocated
- **Low Stock** — 0 < Remaining ≤ 20% of allocated
- **Sold Out** — Remaining = 0

Alerts staff to reorder or promote slower-moving items.

---

## Integration with PrintWell Logic

Features borrowed from the reference desktop app:

| PrintWell Feature | BranchPort Implementation |
|---|---|
| Stock tracking | Allocated - Sold calculation |
| Expiry alerts | Status badges (low stock indicator) |
| Product categories | Inherited from Product schema |
| Revenue reports | Top sellers table + stats |
| Profit analysis | Revenue - COGS per product |
| Inventory valuation | Cost-based value calculation |
| Invoice history | Unsold products (opportunity tracking) |

---

## Navigation

### Sell Screen (`/`)
- Header with navigation tabs
- Product search
- Cart & checkout
- **Link to Dashboard** via "Inventory" tab

### Inventory Dashboard (`/dashboard`)
- Staff name + branch identifier
- 4 summary stat cards
- Top sellers (today's revenue leaders)
- Complete inventory table (all products)
- Unsold products (no sales yet)
- **Link to POS** via "Point of Sale" tab

Both screens are part of the same SyncBoundary, so data stays fresh.

---

## Technical Notes

### Offline Sync
- Inventory data reads from local Dexie cache
- Catalog pulled on login + reconnect via `pullLatestCatalog()`
- No real-time updates from manager changes—requires app restart or manual refresh
- Sales written locally are immediately visible in dashboard metrics

### Performance
- All calculations are memoized in React (`useMemo`)
- Queries are indexed in Dexie for fast retrieval
- Charts/tables only update when underlying data changes

### Type Safety
- Full TypeScript: all functions return strongly-typed interfaces
- Shared types from `@branchport/shared` (Product, QueuedSale, etc.)

---

## Files Modified/Created

### New Files
- `apps/pos/src/lib/inventory.ts` — Calculation utilities (230 lines)
- `apps/pos/src/routes/Dashboard.tsx` — Inventory UI (310 lines)

### Modified Files
- `apps/pos/src/App.tsx` — Added Dashboard route + import
- `apps/pos/src/routes/Sell.tsx` — Added navigation tabs to header

---

## Future Enhancements

**Optional additions:**
1. **Charts** — Bar/line charts (daily revenue trend, products by value)
2. **Alerts** — Notifications for low stock or high potential revenue
3. **Insights** — AI-powered recommendations ("Rice undersold, increase promotion")
4. **Filters** — Sort/filter by status, category, or revenue range
5. **Export** — CSV export of inventory snapshot for manager review
6. **Sync Status** — Show unsynced sales count + last sync time
7. **Customer Insights** — Names/repeat customers from queued sales

---

## Testing Checklist

- ✅ **Builds:** Both POS and Dashboard compile without errors
- ✅ **Navigation:** Tabs switch between `/` and `/dashboard`
- ✅ **Offline:** Dashboard works without internet (demo mode or cached data)
- ⚠️ **Live Data:** Requires POS dev server running + synced demo/real data

**To test locally:**
```bash
npm run dev:pos  # Runs on http://localhost:5174
# Login: staff@branchport.local (any password)
# Toggle between "Point of Sale" and "Inventory" tabs
```

---

## Summary

The POS now has two faces:

1. **Till** — Fast checkout, search products, ring sales, accept payments
2. **Dashboard** — Analytics, inventory health, sales leaders, profit tracking

Staff can monitor their branch's performance in real-time while still selling. Managers can review details on the owner dashboard. Both systems share the same audit trail and offline-first architecture.
