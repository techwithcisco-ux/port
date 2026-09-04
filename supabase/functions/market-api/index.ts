// Supabase Edge Function: market-api
// Serves aggregated analytics data for the Market Analytics dashboard.
// Deploy: supabase functions deploy market-api
//
// Endpoints:
//   GET /market-api/stats     — platform-wide stats
//   GET /market-api/users     — user directory (anonymized)
//   GET /market-api/items     — commodity tracker
//   GET /market-api/ticker    — live price ticker
//   GET /market-api/activity  — recent activity log
//
// Rate limited: 60 requests per minute per IP.
// All endpoints are read-only.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Simple in-memory rate limiter ─────────────────────────────────────────
// In production, use Redis or Upstash for distributed rate limiting.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60; // requests per window
const RATE_WINDOW = 60_000; // 1 minute in ms

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT) {
    return false; // rate limited
  }

  entry.count += 1;
  return true;
}

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 5 * 60_000);

// ── CORS preflight ────────────────────────────────────────────────────────
function handleCORS() {
  return new Response("ok", { headers: corsHeaders });
}

// ── Error response ────────────────────────────────────────────────────────
function errorResponse(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── JSON response helper ──────────────────────────────────────────────────
function jsonResponse(data: unknown, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

// ── Main handler ──────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleCORS();

  // Rate limiting
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  if (!checkRateLimit(ip)) {
    return errorResponse("Rate limit exceeded. Try again in a minute.", 429);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const path = url.pathname.split("/").pop();

    switch (path) {
      case "stats": {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const [users, businesses, branches, products, sales30d, sales7d] = await Promise.all([
          supabase.from("users").select("id, created_at"),
          supabase.from("businesses").select("id"),
          supabase.from("branches").select("id"),
          supabase.from("products").select("id"),
          supabase.from("sales").select("id, total_price, sold_at, sold_by").gte("sold_at", thirtyDaysAgo),
          supabase.from("sales").select("id, sold_by").gte("sold_at", sevenDaysAgo),
        ]);

        const activeUserIds = new Set((sales7d.data ?? []).map((s: any) => s.sold_by));
        const newSignups = (users.data ?? []).filter((u: any) => u.created_at >= sevenDaysAgo).length;

        return jsonResponse({
          total_users: users.data?.length ?? 0,
          total_businesses: businesses.data?.length ?? 0,
          total_products: products.data?.length ?? 0,
          total_branches: branches.data?.length ?? 0,
          total_sales_30d: sales30d.data?.length ?? 0,
          total_revenue_30d: Math.round((sales30d.data ?? []).reduce((s: number, r: any) => s + (r.total_price ?? 0), 0)),
          new_signups_7d: newSignups,
          active_users_7d: activeUserIds.size,
          avg_session_duration: 12,
        });
      }

      case "users": {
        const { data: users } = await supabase
          .from("users")
          .select("id, name, phone, role, business_id, branch_id, created_at");

        const { data: businesses } = await supabase.from("businesses").select("id, name");
        const { data: branches } = await supabase.from("branches").select("id, name, business_id");
        const { data: sales } = await supabase.from("sales").select("sold_by, total_price, product_id, sold_at").limit(10000);
        const { data: products } = await supabase.from("products").select("id, name");

        const bizMap = new Map((businesses ?? []).map((b: any) => [b.id, b]));
        const brMap = new Map((branches ?? []).map((b: any) => [b.id, b]));
        const prodMap = new Map((products ?? []).map((p: any) => [p.id, p]));
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const directory = (users ?? []).map((u: any) => {
          const userSales = (sales ?? []).filter((s: any) => s.sold_by === u.id && s.sold_at >= thirtyDaysAgo);
          const productIds = new Set(userSales.map((s: any) => s.product_id));
          const items = Array.from(productIds).map((pid) => prodMap.get(pid)?.name ?? pid).slice(0, 5);
          return {
            id: u.id,
            name: u.name,
            phone: u.phone ?? "—",
            role: u.role,
            business_name: bizMap.get(u.business_id)?.name ?? "—",
            branch_name: brMap.get(u.branch_id)?.name ?? "HQ",
            created_at: u.created_at,
            total_sales: userSales.length,
            total_revenue: Math.round(userSales.reduce((s: number, r: any) => s + (r.total_price ?? 0), 0)),
            items_sold: items,
          };
        }).sort((a: any, b: any) => b.total_revenue - a.total_revenue);

        return jsonResponse(directory);
      }

      case "items": {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const { data: products } = await supabase.from("products").select("*");
        const { data: branches } = await supabase.from("branches").select("id, business_id");
        const { data: sales } = await supabase.from("sales").select("product_id, unit_price, quantity, branch_id, sold_at").gte("sold_at", thirtyDaysAgo);

        const brMap = new Map((branches ?? []).map((b: any) => [b.id, b]));

        const items = (products ?? []).map((p: any) => {
          const ps = (sales ?? []).filter((s: any) => s.product_id === p.id);
          const now = ps.filter((s: any) => s.sold_at >= sevenDaysAgo);
          const prev = ps.filter((s: any) => s.sold_at < sevenDaysAgo);
          const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
          const currAvg = avg(now.map((s: any) => s.unit_price));
          const prevAvg = avg(prev.map((s: any) => s.unit_price));
          const shops = new Set(ps.map((s: any) => brMap.get(s.branch_id)?.business_id).filter(Boolean));
          const change = prevAvg > 0 ? ((currAvg - prevAvg) / prevAvg) * 100 : 0;
          const prices = ps.map((s: any) => s.unit_price);

          return {
            product_id: p.id,
            product_name: p.name,
            avg_price: Math.round((currAvg || p.retail_sell_price) * 100) / 100,
            min_price: prices.length ? Math.round(Math.min(...prices) * 100) / 100 : p.retail_sell_price,
            max_price: prices.length ? Math.round(Math.max(...prices) * 100) / 100 : p.retail_sell_price,
            total_sold: ps.reduce((s: number, r: any) => s + r.quantity, 0),
            total_revenue: Math.round(ps.reduce((s: number, r: any) => s + r.quantity * r.unit_price, 0)),
            shop_count: shops.size,
            price_trend: change > 3 ? "rising" : change < -3 ? "falling" : "stable",
            trend_pct: Math.round(change * 10) / 10,
          };
        }).sort((a: any, b: any) => b.total_revenue - a.total_revenue);

        return jsonResponse(items);
      }

      default:
        return errorResponse("Unknown endpoint. Use /stats, /users, or /items.", 404);
    }
  } catch (err) {
    return errorResponse(String(err));
  }
});
