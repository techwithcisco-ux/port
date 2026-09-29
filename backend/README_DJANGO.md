# BranchPort — Python/Django edition (legacy alternative build)

Zero-config local run, SQLite by default. Full Python UI (server-rendered),
Django admin, append-only sales + audit trail, role-gated owner/manager/staff.

> Legacy reference build. The live platform is the JS stack in `apps/`
> (Express API + Postgres, deployed via `render.yaml`) — this folder is
> not part of that deployment.

## Run

```bash
cd backend
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py runserver
```

Open http://127.0.0.1:8000

Demo logins (password `password123`):
- owner phone `0540000000` → owner overview, audit log, flags, balance sheet
- manager phone `0540000009` → manager home, intake/allocation/suppliers, P&L
- staff `0540000001` (Madina) / `0540000002` (Dansoman) / `0540000003` (Achimota) → POS till

Or create your own business at `/signup/`.

## What was fixed from the JS codebase

1. **Startup crash**: the original hosted-DB client setup in the JS apps
   threw on import when its env vars were missing (fresh clone = white
   screen). The JS apps have since been rewritten API-only (JWT auth via
   `apps/api`), which removes that failure mode entirely; the Django
   build never had it.
2. **Unsold-products bug**: `apps/pos/src/lib/inventory.ts getUnsoldProducts()` filtered
   `remaining > 0 && potentialRevenue === 0` — impossible when stock remains, so the table was
   always empty. Fixed to `remaining > 0 && revenueToday === 0`.
3. **Missing demo mode**: old docs promised `VITE_DEMO_MODE` + a demo
   dataset that never existed in the JS code. The Django `seed_demo`
   command provides a real zero-config demo (JS stack: create users via
   signup instead).

## Trust model (ported from Postgres RLS/triggers)

- `Sale`, `InventoryIntake`, `InventoryAllocation`: immutable (no edit views; `SaleAdmin` blocks change/delete).
- `AuditEvent`: append-only, written only by `core/signals.py` on insert (like the `security definer` trigger). Admin is read-only.
- `Sale.sold_by` = logged-in user; zero-price guard in `Sale.clean()`; price-flag (>20% deviation) + backdate (>1h gap) detection in `core/analytics.py detect_flags()`.
- Role gating: `role_required("owner")` etc. on every view; staff sees only own branch at POS.

## Layout

- `branchport/` — Django project config
- `core/models.py` — Business/Branch/AppUser/Product/Variant/Supplier/Intake/Allocation/Sale/Audit/Invoice/Expense/Debtor/Creditor
- `core/analytics.py` — port of `calculateBusinessAnalytics` + POS inventory math + flags
- `core/views.py` + `core/urls.py` + `core/templates/core/` — full Python UI
- `core/management/commands/seed_demo.py` — demo dataset
- `/admin/` — Django admin included
