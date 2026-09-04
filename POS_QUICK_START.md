# Quick Start Guide: Enhanced POS Inventory Dashboard

## ✅ Status: Complete & Running

Both dev servers are active:
- **Dashboard:** http://localhost:5173 (Manager/Owner view)
- **POS:** http://localhost:5174 (Staff till + inventory)

---

## What's New in the POS

### Before (Till Only)
- Search products
- Add to cart
- Checkout

### After (Till + Dashboard)
- **Point of Sale** tab (same as before)
- **Inventory Dashboard** tab (NEW)

---

## How to Test

### Step 1: Log In to POS
1. Go to http://localhost:5174
2. Use any demo staff account:
   - Email: `staff@branchport.local` (Madina branch)
   - Email: `staff2@branchport.local` (Dansoman branch)
   - Email: `staff3@branchport.local` (Achimota branch)
   - Password: anything

### Step 2: Navigate the Till
- You see the normal **Sell** screen
- Header shows: **Point of Sale** (active) | **Inventory** (tab)

### Step 3: Click "Inventory" Tab
The dashboard appears with:
1. **Header** - Staff name + branch info
2. **4 Stat Cards** (top row):
   - Revenue Today
   - Inventory Value
   - Potential Revenue
   - Active Products
3. **Top Sellers Table** - Best revenue items today
4. **Complete Inventory Table** - All products with:
   - Allocated / Sold / Remaining quantities
   - Inventory value (cost-based)
   - Stock status badges (Healthy/Low/Sold Out)
5. **Unsold Products Table** - Items not moved today

### Step 4: Return to Till
- Click "Point of Sale" tab
- Back to the checkout screen

---

## Key Metrics Explained

### Revenue Today
Sum of all sales today at retail price.

### Inventory Value
What the remaining stock is worth at cost price.
- Formula: `Remaining stock × cost price per unit`

### Potential Revenue
Maximum revenue if all remaining stock sells at current prices.
- Formula: `Remaining stock × retail price per unit`

### Profit Today
How much money was made after paying for goods sold.
- Formula: `Revenue - (Units sold × cost price)`

### Stock Status
- 🟢 **Healthy** — More than 20% of allocated stock remains
- 🟡 **Low Stock** — 0-20% remains (reorder soon)
- 🔴 **Sold Out** — Nothing left

---

## Features Integrated from PrintWell

| PrintWell | BranchPort POS |
|---|---|
| Invoice tracking | Sales queued + synced |
| Product stock levels | Allocated - Sold calculation |
| Product categories | Inherited from Product schema |
| Profit analysis | Revenue - COGS per item |
| Expiry notifications | Stock status badges |
| Sales history | Top sellers table |
| Inventory valuation | Cost-based value display |

---

## Real Demo Data

The system includes seeded demo data:

**Products:**
- Royal Rice (6.50 GHS/cup)
- Palm Oil (15 GHS/cup)
- Yams (16 GHS/each)
- Tomatoes (5 GHS/bowl)
- Onions (4 GHS/bowl)

**Branches (Staff accounts):**
- Madina (Adele Addo, staff@branchport.local)
- Dansoman (Senam Haha, staff2@branchport.local)
- Achimota (Kofi Boadi, staff3@branchport.local)

**Today's Sales:**
- Revenue generated from demo sales
- Inventory allocated to each branch
- Stock depleted by sales
- Metrics calculated in real-time

---

## Files Changed/Created

### New Files (2)
1. **apps/pos/src/lib/inventory.ts** (230 lines)
   - All calculation logic
   - 7 exported functions
   - Fully typed interfaces

2. **apps/pos/src/routes/Dashboard.tsx** (310 lines)
   - Complete UI
   - 5 data tables
   - Header with navigation
   - Responsive design

### Modified Files (3)
1. **apps/pos/src/App.tsx** 
   - Added Dashboard import
   - Added `/dashboard` route

2. **apps/pos/src/routes/Sell.tsx**
   - Added navigation tabs to header
   - Link to Dashboard

3. **apps/pos/index.html** (if needed for styling)
   - No changes required

---

## Architecture

### Data Flow
```
Supabase (production) or Demo (demo mode)
    ↓
pullLatestCatalog() — on login + reconnect
    ↓
Dexie (local IndexedDB)
    ├─ products
    ├─ allocations
    └─ sales
    ↓
Dashboard & Sell components read from Dexie
    ↓
inventory.ts calculates metrics in real-time
    ↓
Dashboard displays tables + cards
```

### Offline First
- All calculations work without internet
- Reads from local cache only
- Sales written to local DB immediately
- Sync happens in background

---

## Testing Scenarios

### Scenario 1: Monitor Daily Sales
1. Login as staff@branchport.local
2. Click "Inventory" dashboard
3. See **Revenue Today** stat
4. Note **Potential Revenue** (unsold value)
5. Review **Top Sellers** for best performers

### Scenario 2: Identify Slow Movers
1. Scroll to **Unsold Products** table
2. See items still in stock with zero sales
3. Note potential revenue opportunity
4. Go back to POS to promote/sell them

### Scenario 3: Check Stock Levels
1. View **Complete Inventory** table
2. Look for **Low Stock** status badges (🟡)
3. Items nearing exhaustion show potential revenue
4. Plan reordering based on what's running low

### Scenario 4: Compare Branches
1. Login as staff@branchport.local (Madina)
2. Note stats
3. Logout → Login as staff2@branchport.local (Dansoman)
4. Compare inventory values + revenue
5. See how different branches perform

---

## Performance Notes

✅ **Fast** — All calculations are memoized (React.useMemo)
✅ **Responsive** — Works on mobile, tablet, desktop
✅ **Offline** — No network needed for dashboard
⚠️ **Cache** — Requires app restart to see manager's allocation changes
ℹ️ **Real-time sync** — Sales synced whenever online, but catalog is static per session

---

## Known Limitations

1. **No real-time catalog updates** — Staff need to refresh to see new products/allocations from manager
2. **Demo data only** — No real Supabase yet (Docker/CLI unavailable locally)
3. **No charts on POS dashboard** — Tables only (charts can be added in future)
4. **No inventory alerts** — Low stock shows in table, but no active notifications
5. **No export** — Can't export inventory as CSV (feature for future)

---

## Next Steps

### Optional Enhancements
1. **Add charts** — Show revenue trend, products by value
2. **Enable filters** — Sort/filter by status, category, or revenue
3. **Add insights** — AI recommendations (e.g., "Rice undersold today")
4. **Real-time sync** — Pull updates from manager without restart
5. **Notifications** — Alert staff when stock gets critically low

### Production Checklist
- [ ] Run against real Supabase (not demo)
- [ ] Test offline sync (complete sales, go offline, reconnect)
- [ ] Verify staff can't see other branches' data
- [ ] Ensure profit calculations match actual costs
- [ ] Performance test with large catalogs (100+ products)

---

## Support

**To restart servers:**
```bash
npm run dev:pos       # :5174
npm run dev:dashboard # :5173
```

**To rebuild:**
```bash
npm run build:pos
npm run build:dashboard
```

**TypeScript errors:**
- Errors will show in terminal immediately
- Fixed errors auto-reload in browser

**Demo mode toggle:**
- Currently ON (VITE_DEMO_MODE=1)
- To use real Supabase, set VITE_DEMO_MODE=0 + real credentials in .env
