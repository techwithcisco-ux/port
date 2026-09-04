# Market Stock Analytics — BranchPort

Standalone analytics dashboard that monitors all activity across the BranchPort platform. Deployed separately on Vercel.

## What it shows

- **Platform Stats** — total users, businesses, products, revenue
- **User Directory** — all registered users, their data, items sold
- **Items Tracker** — every item on the market with prices and trends
- **Live Market Graph** — Binance-style ticker with sparklines and gainers/losers
- **Usage Analytics** — signups, active users, session data over time
- **Business Reports** — exportable CSV reports for official analytics

## How it connects to BranchPort

Both apps share the same Supabase database:
- **BranchPort** writes data (auth, sales, inventory, etc.)
- **Market Analytics** reads aggregated data via the Supabase REST API

The connection is configured via environment variables:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Deployment (Vercel)

1. Import this repo into Vercel as a new project
2. Set **Root Directory** to `apps/market`
3. Framework: **Vite**
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. Add environment variables from `.env.example`

## Development

```bash
# From the repo root
npm install
npm run dev:market    # → localhost:5175

# Or from this directory
cd apps/market
npm install
npm run dev           # → localhost:5175
```

## Tech Stack

- React 18 + TypeScript + Vite
- Tailwind CSS (mobile-first)
- Recharts (live market charts)
- Supabase JS client (data fetching)
- Shared `@branchport/shared` types
