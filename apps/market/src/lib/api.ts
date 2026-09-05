/**
 * Market Analytics API Layer
 *
 * Connects the standalone Market Stock Analytics dashboard to the
 * BranchPort platform. Reads from real Supabase endpoints.
 *
 * When deployed separately on Vercel, this can be configured to call
 * the BranchPort API via environment variable VITE_API_URL.
 */

import { createClient } from '@supabase/supabase-js';
import type {
  Business,
  Branch,
  Product,
  Sale,
  AppUser,
} from '@branchport/shared';

// Real Supabase client for production
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars. '
    + 'Copy .env.example to .env and fill in your Supabase project values.'
  );
}

const supabase = createClient(url, key);

// ── Types ──────────────────────────────────────────────────────────────────

export interface UserAnalytics {
  id: string;
  name: string;
  phone: string;
  role: string;
  business_id: string;
  business_name: string;
  branch_name: string;
  created_at: string;
  total_sales: number;
  total_revenue: number;
  last_active: string;
  items_sold: string[];
}

export interface ItemAnalytics {
  product_id: string;
  product_name: string;
  category: string;
  total_sold: number;
  total_revenue: number;
  avg_price: number;
  price_trend: 'rising' | 'falling' | 'stable';
  trend_pct: number;
  shop_count: number;
  min_price: number;
  max_price: number;
}

export interface MarketTicker {
  product_name: string;
  current_price: number;
  change_24h: number;
  change_7d: number;
  volume_24h: number;
  high_24h: number;
  low_24h: number;
  sparkline: number[];
}

export interface PlatformStats {
  total_users: number;
  total_businesses: number;
  total_products: number;
  total_sales_30d: number;
  total_revenue_30d: number;
  new_signups_7d: number;
  active_users_7d: number;
  avg_session_duration: number;
  total_branches: number;
}

export interface UserActivityLog {
  user_id: string;
  user_name: string;
  action: string;
  timestamp: string;
  details: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function daysAgo(n: number, h = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
}

function guessCategory(name: string): string {
  const lower = name.toLowerCase();
  if (/rice|sugar|salt|oil|gari|flour|yam|cassava|maize|pepper|tomato|onion/.test(lower)) return 'Groceries';
  if (/milk|tea|coffee|juice|water|coke|fanta|sprite|beer|wine/.test(lower)) return 'Beverages';
  if (/paracetamol|amoxicillin|vitamin|medicine|drug|cream|lotion/.test(lower)) return 'Health';
  if (/phone|charger|cable|earphone|airpod/.test(lower)) return 'Electronics';
  if (/shirt|trouser|dress|fabric|shoe/.test(lower)) return 'Fashion';
  return 'General';
}

// ── Data fetching ──────────────────────────────────────────────────────────

interface RawData {
  businesses: Business[];
  branches: Branch[];
  products: Product[];
  sales: Sale[];
  users: AppUser[];
}

async function fetchAllData(): Promise<RawData> {
  const [bizRes, brRes, prodRes, saleRes, userRes] = await Promise.all([
    supabase.from('businesses').select('*'),
    supabase.from('branches').select('*'),
    supabase.from('products').select('*'),
    supabase.from('sales').select('*'),
    supabase.from('users').select('*'),
  ]);

  return {
    businesses: (bizRes.data as Business[]) ?? [],
    branches: (brRes.data as Branch[]) ?? [],
    products: (prodRes.data as Product[]) ?? [],
    sales: (saleRes.data as Sale[]) ?? [],
    users: (userRes.data as unknown as AppUser[]) ?? [],
  };
}

// ── Platform Stats ─────────────────────────────────────────────────────────

export async function getPlatformStats(): Promise<PlatformStats> {
  const data = await fetchAllData();
  const sevenDaysAgo = daysAgo(7);
  const thirtyDaysAgo = daysAgo(30);

  const sales30d = data.sales.filter((s) => s.sold_at >= thirtyDaysAgo);
  const sales7d = data.sales.filter((s) => s.sold_at >= sevenDaysAgo);

  const activeUserIds = new Set(sales7d.map((s) => s.sold_by));
  const newSignups = data.users.filter((u) => u.created_at >= sevenDaysAgo).length;

  return {
    total_users: data.users.length,
    total_businesses: data.businesses.length,
    total_products: data.products.length,
    total_sales_30d: sales30d.length,
    total_revenue_30d: Math.round(sales30d.reduce((sum, s) => sum + Number(s.total_price), 0)),
    new_signups_7d: newSignups,
    active_users_7d: activeUserIds.size,
    avg_session_duration: 12, // placeholder — real data from analytics events
    total_branches: data.branches.length,
  };
}

// ── User Directory ─────────────────────────────────────────────────────────

export async function getUserDirectory(): Promise<UserAnalytics[]> {
  const data = await fetchAllData();
  const thirtyDaysAgo = daysAgo(30);
  const branchMap = new Map(data.branches.map((b) => [b.id, b]));
  const bizMap = new Map(data.businesses.map((b) => [b.id, b]));

  return data.users.map((user) => {
    const userSales = data.sales.filter(
      (s) => s.sold_by === user.id && s.sold_at >= thirtyDaysAgo
    );
    const branch = branchMap.get(user.branch_id ?? '');
    const business = bizMap.get(user.business_id);
    const productIds = new Set(userSales.map((s) => s.product_id));
    const itemNames = Array.from(productIds)
      .map((pid) => data.products.find((p) => p.id === pid)?.name ?? pid)
      .slice(0, 5);

    return {
      id: user.id,
      name: user.name,
      phone: user.phone ?? '—',
      role: user.role,
      business_id: user.business_id,
      business_name: business?.name ?? '—',
      branch_name: branch?.name ?? 'HQ',
      created_at: user.created_at,
      total_sales: userSales.length,
      total_revenue: Math.round(userSales.reduce((sum, s) => sum + Number(s.total_price), 0)),
      last_active: userSales.length > 0
        ? userSales.sort((a, b) => b.sold_at.localeCompare(a.sold_at))[0].sold_at
        : user.created_at,
      items_sold: itemNames,
    };
  }).sort((a, b) => b.total_revenue - a.total_revenue);
}

// ── Items Tracker ──────────────────────────────────────────────────────────

export async function getItemsAnalytics(): Promise<ItemAnalytics[]> {
  const data = await fetchAllData();
  const thirtyDaysAgo = daysAgo(30);
  const sevenDaysAgo = daysAgo(7);

  const recentSales = data.sales.filter((s) => s.sold_at >= thirtyDaysAgo);

  const priceHistory = new Map<string, { now: number[]; prev: number[]; shops: Set<string> }>();

  for (const s of recentSales) {
    const entry = priceHistory.get(s.product_id) ?? { now: [], prev: [], shops: new Set() };
    if (s.sold_at >= sevenDaysAgo) {
      entry.now.push(s.unit_price);
    } else {
      entry.prev.push(s.unit_price);
    }
    const branch = data.branches.find((b) => b.id === s.branch_id);
    if (branch) entry.shops.add(branch.business_id);
    priceHistory.set(s.product_id, entry);
  }

  return data.products.map((product) => {
    const productSales = recentSales.filter((s) => s.product_id === product.id);
    const history = priceHistory.get(product.id) ?? { now: [], prev: [], shops: new Set() };

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const currentPrice = avg(history.now) || product.retail_sell_price;
    const prevPrice = avg(history.prev);

    let trend: 'rising' | 'falling' | 'stable' = 'stable';
    let trendPct = 0;
    if (prevPrice > 0) {
      trendPct = ((currentPrice - prevPrice) / prevPrice) * 100;
      if (trendPct > 3) trend = 'rising';
      else if (trendPct < -3) trend = 'falling';
    }

    const prices = productSales.map((s) => s.unit_price);

    return {
      product_id: product.id,
      product_name: product.name,
      category: guessCategory(product.name),
      total_sold: productSales.reduce((sum, s) => sum + Number(s.quantity), 0),
      total_revenue: Math.round(productSales.reduce((sum, s) => sum + Number(s.total_price), 0)),
      avg_price: Math.round(currentPrice * 100) / 100,
      price_trend: trend,
      trend_pct: Math.round(trendPct * 10) / 10,
      shop_count: history.shops.size,
      min_price: prices.length > 0 ? Math.round(Math.min(...prices) * 100) / 100 : product.retail_sell_price,
      max_price: prices.length > 0 ? Math.round(Math.max(...prices) * 100) / 100 : product.retail_sell_price,
    };
  }).sort((a, b) => b.total_revenue - a.total_revenue);
}

// ── Live Market Ticker (Binance-style) ─────────────────────────────────────

export async function getMarketTicker(): Promise<MarketTicker[]> {
  const data = await fetchAllData();
  const oneDayAgo = daysAgo(1);
  const sevenDaysAgo = daysAgo(7);

  const todaySales = data.sales.filter((s) => s.sold_at >= oneDayAgo);
  const weekSales = data.sales.filter((s) => s.sold_at >= sevenDaysAgo);

  return data.products.map((product) => {
    const todayPrices = todaySales
      .filter((s) => s.product_id === product.id)
      .map((s) => s.unit_price);
    const weekPrices = weekSales
      .filter((s) => s.product_id === product.id)
      .map((s) => s.unit_price);

    const currentPrice = todayPrices.length > 0
      ? todayPrices.reduce((a, b) => a + b, 0) / todayPrices.length
      : product.retail_sell_price;
    const prevPrice = weekPrices.length > 0
      ? weekPrices.reduce((a, b) => a + b, 0) / weekPrices.length
      : currentPrice;

    const sparkline = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = daysAgo(i, 8);
      const dayEnd = daysAgo(i - 1, 8);
      const dayPrices = data.sales
        .filter((s) => s.product_id === product.id && s.sold_at >= dayStart && s.sold_at < dayEnd)
        .map((s) => s.unit_price);
      sparkline.push(dayPrices.length > 0 ? dayPrices.reduce((a, b) => a + b, 0) / dayPrices.length : currentPrice);
    }

    const change24h = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;

    return {
      product_name: product.name,
      current_price: Math.round(currentPrice * 100) / 100,
      change_24h: Math.round(change24h * 100) / 100,
      change_7d: Math.round(((currentPrice - product.retail_sell_price) / product.retail_sell_price) * 100 * 100) / 100,
      volume_24h: todayPrices.length,
      high_24h: todayPrices.length > 0 ? Math.round(Math.max(...todayPrices) * 100) / 100 : currentPrice,
      low_24h: todayPrices.length > 0 ? Math.round(Math.min(...todayPrices) * 100) / 100 : currentPrice,
      sparkline,
    };
  });
}

// ── Usage Analytics ────────────────────────────────────────────────────────

export interface UsageDataPoint {
  date: string;
  signups: number;
  active_users: number;
  sales_count: number;
  revenue: number;
}

export async function getUsageAnalytics(): Promise<UsageDataPoint[]> {
  const data = await fetchAllData();
  const points: UsageDataPoint[] = [];

  for (let i = 29; i >= 0; i--) {
    const dayStart = daysAgo(i, 0);
    const dayEnd = daysAgo(i - 1, 0);
    const dayLabel = new Date(dayStart).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });

    const daySales = data.sales.filter((s) => s.sold_at >= dayStart && s.sold_at < dayEnd);
    const activeUserIds = new Set(daySales.map((s) => s.sold_by));
    const daySignups = data.users.filter((u) => u.created_at >= dayStart && u.created_at < dayEnd).length;

    points.push({
      date: dayLabel,
      signups: daySignups,
      active_users: activeUserIds.size,
      sales_count: daySales.length,
      revenue: Math.round(daySales.reduce((sum, s) => sum + Number(s.total_price), 0)),
    });
  }

  return points;
}

// ── Activity Log ───────────────────────────────────────────────────────────

export async function getActivityLog(): Promise<UserActivityLog[]> {
  const data = await fetchAllData();
  const userMap = new Map(data.users.map((u) => [u.id, u]));
  const productMap = new Map(data.products.map((p) => [p.id, p]));

  const activities: UserActivityLog[] = [];

  data.sales.slice(-50).forEach((s) => {
    const user = userMap.get(s.sold_by);
    const product = productMap.get(s.product_id);
    activities.push({
      user_id: s.sold_by,
      user_name: user?.name ?? 'Unknown',
      action: 'sale',
      timestamp: s.sold_at,
      details: `Sold ${s.quantity} ${product?.name ?? 'item'} for GHS ${Number(s.total_price).toFixed(2)}`,
    });
  });

  return activities.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 100);
}
