# BranchPort — Management Dashboard + POS

Two apps, one Supabase project, deployed separately on Vercel.

## Architecture

```
┌─────────────────────────┐     ┌─────────────────────────┐
│   BranchPort (Vercel)   │     │  Market Analytics (Vercel)│
│                         │     │                          │
│  /  → Dashboard app     │◄────│  Reads data via Supabase │
│  /pos/ → POS app        │     │  REST API                │
│                         │     │                          │
└──────────┬──────────────┘     └──────────┬───────────────┘
           │                               │
           ▼                               ▼
   ┌───────────────────────────────────────────┐
   │         Supabase Project (shared)         │
   │   Auth · Database · RLS · Edge Functions  │
   └───────────────────────────────────────────┘
```

## Deployment

### BranchPort (Dashboard + POS)
1. Connect this repo to Vercel
2. Set root directory to `branchport/`
3. Build command: `npm run build:dashboard && npm run build:pos`
4. Output directory: `apps/dashboard/dist`
5. Install command: `npm install`
6. Framework preset: **Other**
7. Add Vercel rewrites in this project's `vercel.json` to route `/pos/*` to POS dist

Environment variables:
- `VITE_SUPABASE_URL` — your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — your Supabase anon key

### Market Analytics (separate Vercel project)
1. Connect the same repo to Vercel (second project)
2. Set root directory to `branchport/apps/market`
3. Build command: `npm run build`
4. Output directory: `dist`
5. Framework preset: **Vite**

Environment variables:
- `VITE_SUPABASE_URL` — same Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — same Supabase anon key
- `VITE_API_URL` — BranchPort's public URL (for cross-app API calls)

## How They Connect

Both apps read from the **same Supabase database**. The Market Analytics app uses the Supabase REST API to query:
- `users` table — all registered users across all businesses
- `businesses` table — all businesses on the platform
- `products` table — all products listed
- `sales` table — all sales across all branches
- `branches` table — all branches
- `audit_events` table — activity logs

RLS policies ensure:
- Dashboard users can only read/write their own business data
- Market Analytics reads only aggregated/anonymized data via a read-only role

## Development

```bash
# Start all three dev servers
npm run dev:dashboard   # → localhost:5173
npm run dev:pos         # → localhost:5174
npm run dev:market      # → localhost:5175
```

## Supabase Setup

1. Create a Supabase project at https://supabase.com
2. Run migrations 0001–0012 from `supabase/migrations/`
3. Copy the project URL and anon key to both apps' `.env` files
4. Set up RLS policies per the migration files
