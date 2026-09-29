# Quick Start Guide: Enhanced POS Inventory Dashboard

## What's in the POS

Two screens for staff, one login:

- **Point of Sale** — search products, cart, checkout with optional
  customer name/phone
- **Inventory Dashboard** — revenue today, top sellers, complete
  stock table (allocated/sold/remaining/value), unsold items

The POS is offline-first: it caches the product catalog in Dexie
(IndexedDB), writes sales locally, and syncs in the background
whenever the API is reachable.

---

## How to Test

### Step 0: Get the backend running

The POS needs the API and a Postgres database (there is no demo
mode):

```bash
# From the repo root
npm install
createdb branchport
psql postgresql://localhost/branchport -f apps/api/schema.sql
DATABASE_URL=postgresql://localhost/branchport npm run dev:api   # :8080
npm run dev:dashboard   # :5173
npm run dev:pos         # :5174
```

### Step 1: Create users (once)

1. Open http://localhost:5173 and **sign up** the owner (creates the
   business + owner account).
2. From inside the dashboard, create a branch and a **staff** user
   for it. The dashboard generates a POS activation link.
3. Open that activation link (it points at the POS) to activate the
   staff account.

### Step 2: Log in to the POS

Go to http://localhost:5174 and log in with the staff member's
**phone number** (no password). You land on the Sell screen.

### Step 3: Explore the Inventory tab

Click **Inventory** in the header. The dashboard shows:

1. **Header** — staff name + branch
2. **4 stat cards** — Revenue Today, Inventory Value, Potential
   Revenue, Active Products
3. **Top Sellers table** — best revenue items today
4. **Complete Inventory table** — every product with
   allocated/sold/remaining, inventory value, and status badges
   (Healthy / Low Stock / Sold Out)
5. **Unsold Products table** — items with stock but no sales today

### Step 4: Sell something and watch the numbers move

Ring up a sale on the Point of Sale tab, then flip back to Inventory
— revenue, units sold, and remaining stock update instantly (metrics
run locally on the Dexie cache).

---

## Key Metrics Explained

### Revenue Today
Sum of all sales today.

### Inventory Value
What the remaining stock is worth at cost price.
- Formula: `Remaining stock × cost price per unit`

### Potential Revenue
Maximum revenue if all remaining stock sells at current prices.
- Formula: `Remaining stock × retail price per unit`

### Profit Today
How much money was made after paying for goods sold.
- Formula: `Revenue − (Units sold × cost price)`

### Stock Status
- 🟢 **Healthy** — more than 20% of allocated stock remains
- 🟡 **Low Stock** — 0–20% remains (reorder soon)
- 🔴 **Sold Out** — nothing left

---

## Architecture

### Data flow

```
BranchPort API (apps/api + Postgres)
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
inventory.ts calculates metrics in real time
    ↓
Dashboard displays tables + cards
```

### Offline first

- All calculations work without internet
- Reads from the local cache only
- Sales are written locally immediately
- Sync happens in the background when the API is reachable

---

## Testing Scenarios

### Scenario 1: Monitor daily sales
1. Log in as any staff user
2. Open the Inventory dashboard
3. Check **Revenue Today** and **Potential Revenue**
4. Review **Top Sellers**

### Scenario 2: Identify slow movers
1. Scroll to **Unsold Products**
2. See items in stock with zero sales today
3. Note the potential revenue opportunity
4. Go back to the POS to promote them

### Scenario 3: Check stock levels
1. View the **Complete Inventory** table
2. Look for **Low Stock** badges (🟡)
3. Plan reordering around what's running low

### Scenario 4: Compare branches
1. Log in as a staff user for branch A
2. Note the stats
3. Log out → activate/log in as a staff user for branch B
4. Compare inventory values + revenue

---

## Known Limitations

1. **Catalog refresh** — new products/allocations from the manager
   need a catalog re-pull (app restart or reconnect)
2. **Backend required** — apps/api + Postgres must be running for
   login and sync
3. **No charts on the POS dashboard** — tables only
4. **No inventory alerts** — low stock is a visual badge only
5. **No export** — inventory can't be downloaded as CSV yet

---

## Support

**To restart servers:**
```bash
npm run dev:api        # :8080
npm run dev:pos        # :5174
npm run dev:dashboard  # :5173
```

**To rebuild:**
```bash
npm run build:pos
npm run build:dashboard
```

**TypeScript errors:**
- Errors show in the terminal immediately
- Fixed errors auto-reload in the browser

**Production:** see `DEPLOY.md` for the Render Blueprint deployment
(Postgres + API + all three frontends).
