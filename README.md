# BranchPort

Multi-branch retail monitoring and audit platform for informal-market
retailers in Ghana. See `branchport-requirements.txt` and
`branchport-system-architecture.md` (delivered alongside this codebase)
for the full spec — this repo is the coded foundation for it.

## Structure

```
branchport/
  supabase/migrations/   Postgres schema, RLS policies, audit trigger,
                          pricing-consistency trigger, follow-up fixes.
                          Run these against a Supabase project in order
                          (0001 -> 0010).
  supabase/functions/     Staff invite edge function (invite-staff).
  packages/shared/        Shared types + the in-memory demo dataset
                          (packages/shared/src/demo.ts).
  apps/dashboard/         Management dashboard (manager view + owner view
                          in one role-gated app). React + Vite + Tailwind.
  apps/pos/               Branch POS. React + Vite + Tailwind, offline-
                          first via Dexie (IndexedDB) + a sync queue.
  scripts/vercel-build.mjs  Builds both apps into one Vercel deployment
                          (dashboard at /, POS at /pos/).
```

## Why it's built this way

The core trust mechanism is in the database, not the app code:

- `audit_events` is written ONLY by a `security definer` trigger
  function that fires on every insert/update to the core tables. No
  client — including the manager dashboard — can write to it directly,
  because there is no INSERT policy granting that to anyone.
- RLS policies grant INSERT but never UPDATE/DELETE on `sales`,
  `inventory_intake`, `inventory_allocations` for manager/staff roles.
  There is no in-place editing anywhere in the system by design.
- The owner role is the only role with a SELECT policy on
  `audit_events`. The manager dashboard and owner dashboard are the
  SAME app (`apps/dashboard`) — what differs is which queries the
  logged-in user's role is allowed to run, enforced by Postgres, not
  by hiding buttons in the UI.

## Run it locally (no backend needed)

**Demo mode is ON by default** (any `VITE_DEMO_MODE` value except `0`).
In demo mode both apps run against a seeded in-memory dataset
(`packages/shared/src/demo.ts`): three branches, five products, three
suppliers, sales across the last 30 days, real price anomalies,
device/server clock gaps, a recorded price edit — and the demo users.
Everything works with zero infrastructure and zero env vars.

```bash
npm install
npm run dev:dashboard   # http://localhost:5173
npm run dev:pos         # http://localhost:5174
```

Sign in with any demo account and **any password**:

```
owner@branchport.local    → owner view (analytics, audit log and flags)
manager@branchport.local  → manager view
staff@branchport.local    → POS till (Madina)
staff2@branchport.local   → POS till (Dansoman)
staff3@branchport.local   → POS till (Achimota)
```

## Go live with a real Supabase project

1. Create a Supabase project.
2. Run the SQL files in `supabase/migrations/` in order, via the
   Supabase SQL editor or `supabase db push` if you're using the CLI.
3. In BOTH apps set `VITE_DEMO_MODE=0` and add real credentials. Copy
   `.env.example` to `.env` in each app and fill in:
   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (dashboard + POS)
   - `VITE_POS_URL` on the dashboard — the deployed POS URL that staff
     are pointed at from the Staff notice screen
4. Deploy the staff-invite edge function (used by the Staff invites
   screen):
   ```
   supabase functions deploy invite-staff --no-verify-jwt
   ```
   Set the `INVITE_REDIRECT_TO` secret to your POS URL so magic links
   land on the right app.
5. Remember: `.env` files are git-ignored — never commit real keys.

## Deploy to GitHub

The repo root is `branchport/` (the workspace's other folders are not
part of the product and are not tracked).

```bash
cd branchport
git init
git add .
git commit -m "BranchPort: dashboard + POS, demo mode, Vercel-ready"
git branch -M main
git remote add origin https://github.com/techwithcisco-ux/branchpoint.git
git push -u origin main
```

`.gitignore` already excludes `node_modules/`, `dist/`, `.vercel/`,
`.env` and other local files — no secrets or build artifacts are
committed. (If you ever see a real key inside a committed file, rotate
it immediately.)

## Deploy to Vercel (one project, both apps)

Everything is already wired up — importing the repo is enough:

- `vercel.json` at the root sets the framework to none and the build
  command to `node scripts/vercel-build.mjs`.
- The build compiles both apps and writes a Build Output API v3 bundle
  (`.vercel/output`): the **dashboard at `/`** and the **POS at
  `/pos/`**, with SPA fallbacks for both.

Steps:

1. Push the repo to GitHub (above).
2. On Vercel: **Add New → Project → import the repo**.
3. Framework preset: **Other** (the `vercel.json` takes over anyway).
4. Deploy. That's it — demo mode needs no env vars.

Resulting URLs (example): `https://<your-app>.vercel.app/` for the
dashboard and `https://<your-app>.vercel.app/pos/` for the POS. If you
use the real-backend path, add the `VITE_*` env vars listed above in
the project settings instead of the local `.env` files.

> Running the two apps as separate Vercel projects is also possible
> (root directory `apps/dashboard` or `apps/pos`), but then the POS
> base path should be `/` — the single-project setup above is the
> recommended path.

## What's built vs. what's left

Built (functional, not stubs):

- Full schema + RLS + triggers (migrations `0001`–`0009`) — including
  the zero-price guard, `sold_by = auth.uid()` attribution, supplier
  payments/reconciliations, branches + learning columns, and POS
  customer columns.
- Auth context and role-gated routing in both apps.
- Product setup, inventory intake, multi-branch stock allocation with
  retail-equivalent preview, supplier ledger with derive-not-store
  running balances.
- Owner audit log (entity/actor/date filters, before/after diffs,
  timing-mismatch hints) and owner flags panel (price anomalies,
  backdating, repeated overriders, frozen allocations).
- Staff invite flow: manager screen → `invite-staff` edge function →
  `provision_staff_user` → magic link the manager forwards.
- POS sell screen: offline-first Dexie queue + sync loop, true
  remaining stock (allocated − this branch's sold) computed fully
  offline, customer name/phone on the order.
- Responsive UI: the dashboard collapses to a mobile top bar +
  slide-out navigation, stat grids go two-up, wide tables scroll, and
  the POS till is built for a phone screen (installable as a PWA).

Left for you (smaller now; see `branchport-requirements.txt`):

- Offline conflict edge cases beyond the MVP-simple approach described
  in the requirements doc.
- PWA icons for the POS install manifest.
- Branch/bootstrap provisioning (owner `branches` screen).
- Invite edge function's `INVITE_REDIRECT_TO` secret is written but
  not yet consumed by the provision path.
