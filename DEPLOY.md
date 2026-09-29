# BranchPort — Deployment Guide

One Render Blueprint provisions the database, the API, and all three
frontends. Vercel remains an option for the static frontends if you
prefer it — the frontends only need the API's URL.

## Architecture

```
  ┌────────────────────────────────────────────────────┐
  │                      Render                        │
  │                                                    │
  │  branchport-dashboard ─┐                           │
  │  branchport-pos ───────┼──► branchport-api (Node)  │
  │  branchport-market ────┘        │                  │
  │                                 ▼                  │
  │                          branchport-db (Postgres)  │
  └────────────────────────────────────────────────────┘
```

- **branchport-api** — Express + `pg` + JWT. Owns all auth
  (bcrypt password hashing, session JWTs, POS phone activation,
  market platform tokens) and all data access. The database has no
  external auth schema or roles; the API is the sole reader/writer.
- **branchport-dashboard** — manager + owner web app.
- **branchport-pos** — staff till (offline-first PWA).
- **branchport-market** — cross-business analytics, gated behind a
  server-verified admin password.

## Deploy on Render (recommended)

`render.yaml` at the repo root describes all five resources.

1. **Push the repo to GitHub.**

2. **Create the Blueprint.** On Render: New → Blueprint → select the
   repo (root directory `branchport/`). Render provisions:

   - `branchport-db` — Postgres 16, free plan.
   - `branchport-api` — Node service. Render *generates* two secrets
     for you: `JWT_SECRET` and `MARKET_ADMIN_PASS`. `DATABASE_URL` is
     wired to the database automatically. Health check: `/health`.
   - `branchport-dashboard`, `branchport-pos`, `branchport-market` —
     static sites. Each gets `VITE_API_URL` pointing at the API
     service automatically. The POS and market are built with
     `VITE_BASE=/` so they serve from their own site roots.

3. **Apply the database schema (one time).** After the database is
   live, get the External Database URL from the Render dashboard
   (branchport-db → Connections) and run, from any machine with
   `psql`:

   ```bash
   psql "$EXTERNAL_DATABASE_URL" -f apps/api/schema.sql
   ```

   `apps/api/schema.sql` is the single source of truth for the
   database — it creates every table, index, and constraint in one
   idempotent run. This is a **fresh database**: all signups start
   from zero.

4. **Sign up the owner.** Open the dashboard URL, sign up (business +
   owner in one step), then create manager/staff users from inside
   the dashboard. Staff get an activation link; after activating they
   log into the POS with their phone number.

5. **Sign into market analytics.** In the Render dashboard, open
   branchport-api → Environment and copy the generated
   `MARKET_ADMIN_PASS`. Open the market URL and sign in with that
   password. It exchanges server-side for a 12-hour platform JWT;
   when it expires the app returns to the login gate.

### Render costs and limits

The free Postgres plan expires after 90 days unless upgraded — set a
reminder or upgrade before then. The API on the free plan sleeps
after 15 minutes of inactivity (first request after sleep is slow).

## Deploy the frontends on Vercel (alternative)

If you'd rather serve the frontends from Vercel, keep the API and
database on Render and point the frontends at the API URL.

**Dashboard + POS in one project:**

1. Import the repo, root directory `branchport/`.
2. Framework preset: **Other** — `vercel.json` takes over
   (`buildCommand: node scripts/vercel-build.mjs`).
3. Add `VITE_API_URL` = your Render API URL (e.g.
   `https://branchport-api.onrender.com`).
4. Result: dashboard at `/`, POS at `/pos/`.

**Market analytics as its own project:**

1. Import the repo again, root directory `branchport/apps/market`.
2. Framework: **Vite**. Build `npm run build`, output `dist`.
3. Add `VITE_API_URL` = the same Render API URL.

**POS as its own project (optional):** root directory
`branchport/apps/pos`, build with `VITE_BASE=/` so assets resolve at
the site root.

## Local development

```bash
npm install

createdb branchport
psql postgresql://localhost/branchport -f apps/api/schema.sql

DATABASE_URL=postgresql://localhost/branchport npm run dev:api      # :8080
npm run dev:dashboard    # :5173
npm run dev:pos          # :5174
npm run dev:market       # :5175
```

Set `MARKET_ADMIN_PASS` on the API to use market analytics locally.
Each frontend's `.env.example` shows the variables it reads.

## API reference (summary)

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /health` | — | Liveness probe |
| `POST /auth/signup-owner` | — | Create business + owner |
| `POST /auth/login` | rate-limited | Phone/password login (dashboard, access + refresh pair) |
| `POST /auth/pos-login` | rate-limited | Phone + password login (POS, password always required) |
| `POST /auth/pos-activate` | activation token | One-time POS activation (returns pair) |
| `POST /auth/refresh` | refresh token | Rotate refresh token (reuse = revoke all) |
| `POST /auth/logout` | refresh token | Revoke current session |
| `POST /auth/logout-all` | access JWT | Revoke all sessions |
| `POST /auth/change-password` | access JWT | Change own password (fresh pair) |
| `POST /auth/password-reset/request` | rate-limited | Request reset (generic reply) |
| `POST /auth/password-reset/confirm` | rate-limited | Confirm reset with token |
| `POST /auth/admin-reset` | manager/owner | Issue one-time temp password for staff |
| `GET /auth/sessions` | access JWT | List active sessions |
| `GET /auth/me` | access JWT | Current profile |
| `POST /auth/staff` | manager/owner | Provision a manager/staff user (password required) |
| `GET/POST/PATCH/DELETE /api/:table` | JWT | Role-scoped data access |
| `POST /api/:table/upsert` | JWT | Insert-or-update |
| `POST /platform/login` | rate-limited | MARKET_ADMIN_PASS → platform JWT |
| `GET /platform/export` | platform JWT | Bulk export for market analytics |

## Troubleshooting

- **Frontends can't reach the API** — check `VITE_API_URL` in the
  site's environment (it should be the full `https://…onrender.com`
  origin, no trailing slash needed).
- **Signups fail with a database error** — the schema hasn't been
  applied: run step 3 of the Render setup.
- **Market login says "not configured"** — `MARKET_ADMIN_PASS` is
  unset on branchport-api (503 by design).
- **Blank page on a standalone POS/market deploy** — the build used
  the wrong Vite base; rebuild with `VITE_BASE=/`.
