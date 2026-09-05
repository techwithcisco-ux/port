/**
 * Market Intelligence Engine
 *
 * Aggregates data across ALL businesses on the platform to generate
 * cross-market intelligence: commodity tracking, price movements, shop
 * rankings, and market reports. This is the data layer that powers the
 * Market Intelligence dashboard — the "Bloomberg Terminal for Ghana retail".
 *
 * Reads from the Supabase backend.
 * In production, this would query the actual database with RLS.
 */

import { supabase } from './supabase';
import type {
  Business,
  Branch,
  Product,
  Sale,
  ShopProfile,
  CommodityItem,
  MarketReport,
  PriceMovement,
  BusinessType,
} from '@branchport/shared';

export type { ShopProfile, CommodityItem, MarketReport, PriceMovement };

// ── Helpers ────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// ── Data fetching ──────────────────────────────────────────────────────────

interface RawData {
  businesses: Business[];
  branches: Branch[];
  products: Product[];
  sales: Sale[];
}

async function fetchAllData(): Promise<RawData> {
  const [bizRes, brRes, prodRes, saleRes] = await Promise.all([
    supabase.from('businesses').select('*'),
    supabase.from('branches').select('*'),
    supabase.from('products').select('*'),
    supabase.from('sales').select('*'),
  ]);

  return {
    businesses: (bizRes.data as Business[]) ?? [],
    branches: (brRes.data as Branch[]) ?? [],
    products: (prodRes.data as Product[]) ?? [],
    sales: (saleRes.data as Sale[]) ?? [],
  };
}

// ── Shop Profiles ──────────────────────────────────────────────────────────

export async function getShopProfiles(): Promise<ShopProfile[]> {
  const data = await fetchAllData();
  const now = new Date();
  const thirtyDaysAgo = daysAgo(30);

  // Group by business
  const bizMap = new Map<string, Business>();
  data.businesses.forEach((b) => bizMap.set(b.id, b));

  const branchMap = new Map<string, Branch[]>();
  data.branches.forEach((br) => {
    const list = branchMap.get(br.business_id) ?? [];
    list.push(br);
    branchMap.set(br.business_id, list);
  });

  const productMap = new Map<string, Product[]>();
  data.products.forEach((p) => {
    const list = productMap.get(p.business_id) ?? [];
    list.push(p);
    productMap.set(p.business_id, list);
  });

  // Sales by branch → business
  const branchSalesMap = new Map<string, Sale[]>();
  data.sales.forEach((s) => {
    const list = branchSalesMap.get(s.branch_id) ?? [];
    list.push(s);
    branchSalesMap.set(s.branch_id, list);
  });

  return data.businesses.map((biz) => {
    const branches = branchMap.get(biz.id) ?? [];
    const products = productMap.get(biz.id) ?? [];
    const branchIds = new Set(branches.map((b) => b.id));
    const bizSales = data.sales.filter(
      (s) => branchIds.has(s.branch_id) && s.sold_at >= thirtyDaysAgo
    );

    // Top product by revenue
    const productRevenue = new Map<string, number>();
    bizSales.forEach((s) => {
      productRevenue.set(s.product_id, (productRevenue.get(s.product_id) ?? 0) + s.total_price);
    });
    let topProduct = '—';
    let topProductRevenue = 0;
    productRevenue.forEach((rev, pid) => {
      if (rev > topProductRevenue) {
        topProductRevenue = rev;
        const prod = products.find((p) => p.id === pid);
        topProduct = prod?.name ?? 'Unknown';
      }
    });

    return {
      business_id: biz.id,
      business_name: biz.name,
      business_type: (biz.business_type ?? 'other') as BusinessType,
      owner_name: data.businesses.find((b) => b.id === biz.owner_user_id)?.name ?? biz.name,
      branch_count: branches.length,
      product_count: products.length,
      total_revenue_30d: bizSales.reduce((sum, s) => sum + s.total_price, 0),
      total_sales_30d: bizSales.length,
      top_product: topProduct,
      top_product_revenue: topProductRevenue,
      joined_at: biz.created_at,
    };
  });
}

// ── Commodity Tracker ──────────────────────────────────────────────────────

export async function getCommodities(): Promise<CommodityItem[]> {
  const data = await fetchAllData();
  const thirtyDaysAgo = daysAgo(30);
  const sevenDaysAgo = daysAgo(7);

  const recentSales = data.sales.filter((s) => s.sold_at >= thirtyDaysAgo);
  const lastWeekSales = data.sales.filter((s) => s.sold_at >= sevenDaysAgo);

  // Group by product name (cross-business)
  const productMap = new Map<string, Product>();
  data.products.forEach((p) => productMap.set(p.id, p));

  // Aggregate by product name
  const commodityMap = new Map<string, {
    totalSold: number;
    totalRevenue: number;
    prices: number[];
    shops: Set<string>;
    recentPrices: number[];
  }>();

  recentSales.forEach((s) => {
    const prod = productMap.get(s.product_id);
    if (!prod) return;
    const name = prod.name;
    const entry = commodityMap.get(name) ?? {
      totalSold: 0,
      totalRevenue: 0,
      prices: [],
      shops: new Set(),
      recentPrices: [],
    };
    entry.totalSold += s.quantity;
    entry.totalRevenue += s.total_price;
    entry.prices.push(s.unit_price);
    // Find the branch → business
    const branch = data.branches.find((b) => b.id === s.branch_id);
    if (branch) entry.shops.add(branch.business_id);
    if (s.sold_at >= sevenDaysAgo) entry.recentPrices.push(s.unit_price);
    commodityMap.set(name, entry);
  });

  // Build commodity items
  const items: CommodityItem[] = [];
  commodityMap.forEach((entry, name) => {
    const avg = entry.prices.reduce((a, b) => a + b, 0) / entry.prices.length;
    const min = Math.min(...entry.prices);
    const max = Math.max(...entry.prices);

    // Price trend: compare last 7 days avg vs previous 23 days avg
    let trend: 'rising' | 'falling' | 'stable' = 'stable';
    let trendPct = 0;
    if (entry.recentPrices.length > 0 && entry.prices.length > entry.recentPrices.length) {
      const recentAvg = entry.recentPrices.reduce((a, b) => a + b, 0) / entry.recentPrices.length;
      const olderPrices = entry.prices.filter((_, i) => i >= entry.recentPrices.length);
      const olderAvg = olderPrices.length > 0
        ? olderPrices.reduce((a, b) => a + b, 0) / olderPrices.length
        : recentAvg;
      if (olderAvg > 0) {
        trendPct = ((recentAvg - olderAvg) / olderAvg) * 100;
        if (trendPct > 3) trend = 'rising';
        else if (trendPct < -3) trend = 'falling';
      }
    }

    // Detect category from product name (simple heuristic)
    const prod = data.products.find((p) => p.name === name);
    const category = guessCategory(name);

    items.push({
      product_name: name,
      avg_price: Math.round(avg * 100) / 100,
      min_price: Math.round(min * 100) / 100,
      max_price: Math.round(max * 100) / 100,
      total_sold_30d: entry.totalSold,
      total_revenue_30d: Math.round(entry.totalRevenue * 100) / 100,
      shop_count: entry.shops.size,
      price_trend: trend,
      trend_pct: Math.round(trendPct * 10) / 10,
      category,
    });
  });

  return items.sort((a, b) => b.total_revenue_30d - a.total_revenue_30d);
}

// ── Price Movements ────────────────────────────────────────────────────────

export async function getPriceMovements(): Promise<PriceMovement[]> {
  const data = await fetchAllData();
  const productMap = new Map<string, Product>();
  data.products.forEach((p) => productMap.set(p.id, p));

  const thirtyDaysAgo = daysAgo(30);
  const sevenDaysAgo = daysAgo(7);

  // Group prices by product name
  const priceMap = new Map<string, { now: number[]; week: number[]; month: number[] }>();

  data.sales.forEach((s) => {
    const prod = productMap.get(s.product_id);
    if (!prod) return;
    const name = prod.name;
    const entry = priceMap.get(name) ?? { now: [], week: [], month: [] };
    if (s.sold_at >= sevenDaysAgo) entry.now.push(s.unit_price);
    else if (s.sold_at >= thirtyDaysAgo) entry.week.push(s.unit_price);
    entry.month.push(s.unit_price);
    priceMap.set(name, entry);
  });

  const movements: PriceMovement[] = [];
  priceMap.forEach((entry, name) => {
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const current = avg(entry.now);
    const prevWeek = avg(entry.week);
    const prevMonth = avg(entry.month.filter((_, i) => i < entry.month.length - entry.now.length - entry.week.length));

    if (current === 0) return;

    const change7d = prevWeek > 0 ? ((current - prevWeek) / prevWeek) * 100 : 0;
    const change30d = prevMonth > 0 ? ((current - prevMonth) / prevMonth) * 100 : 0;
    const volatility = Math.abs(change30d) > 10 ? 'high' : Math.abs(change30d) > 3 ? 'medium' : 'low';

    movements.push({
      product_name: name,
      current_price: Math.round(current * 100) / 100,
      prev_price_7d: Math.round(prevWeek * 100) / 100,
      prev_price_30d: Math.round(prevMonth * 100) / 100,
      change_7d_pct: Math.round(change7d * 10) / 10,
      change_30d_pct: Math.round(change30d * 10) / 10,
      volatility,
    });
  });

  return movements.sort((a, b) => Math.abs(b.change_30d_pct) - Math.abs(a.change_30d_pct));
}

// ── Market Reports ─────────────────────────────────────────────────────────

export async function generateMarketReport(): Promise<MarketReport> {
  const [commodities, shops] = await Promise.all([getCommodities(), getShopProfiles()]);

  const rising = commodities.filter((c) => c.price_trend === 'rising').slice(0, 5).map((c) => c.product_name);
  const declining = commodities.filter((c) => c.price_trend === 'falling').slice(0, 5).map((c) => c.product_name);
  const topCommodities = commodities.slice(0, 5).map((c) => c.product_name);

  const totalVolume = commodities.reduce((sum, c) => sum + c.total_sold_30d, 0);
  const totalRevenue = commodities.reduce((sum, c) => sum + c.total_revenue_30d, 0);
  const avgBasket = shops.length > 0
    ? shops.reduce((sum, s) => sum + s.total_revenue_30d, 0) / shops.length
    : 0;

  // Determine overall market direction
  const risingCount = commodities.filter((c) => c.price_trend === 'rising').length;
  const fallingCount = commodities.filter((c) => c.price_trend === 'falling').length;
  const marketDirection = risingCount > fallingCount ? 'bullish' : risingCount < fallingCount ? 'bearish' : 'neutral';

  return {
    id: `rpt-${Date.now()}`,
    title: `Market Intelligence Report — ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`,
    summary: `The market is ${marketDirection} with ${risingCount} rising and ${fallingCount} declining commodities across ${shops.length} shops. Total market volume: ${totalVolume.toLocaleString()} units worth GHS ${totalRevenue.toLocaleString()}.`,
    generated_at: new Date().toISOString(),
    period: 'monthly',
    top_commodities: topCommodities,
    rising_items: rising,
    declining_items: declining,
    avg_basket_size: Math.round(avgBasket),
    total_market_volume: totalVolume,
    total_market_revenue: Math.round(totalRevenue),
    shop_count: shops.length,
  };
}

// ── Aggregate Stats ────────────────────────────────────────────────────────

export interface MarketStats {
  total_shops: number;
  total_branches: number;
  total_products: number;
  total_sales_30d: number;
  total_revenue_30d: number;
  avg_price_change_7d: number;
  rising_count: number;
  falling_count: number;
  stable_count: number;
  most_traded: string;
  highest_revenue_shop: string;
  top_category: string;
}

export async function getMarketStats(): Promise<MarketStats> {
  const [commodities, shops] = await Promise.all([getCommodities(), getShopProfiles()]);
  const data = await fetchAllData();

  const rising = commodities.filter((c) => c.price_trend === 'rising').length;
  const falling = commodities.filter((c) => c.price_trend === 'falling').length;
  const stable = commodities.length - rising - falling;
  const avgChange = commodities.length > 0
    ? commodities.reduce((sum, c) => sum + c.trend_pct, 0) / commodities.length
    : 0;

  // Most traded by volume
  const mostTraded = commodities.length > 0 ? commodities[0].product_name : '—';

  // Highest revenue shop
  const topShop = shops.length > 0
    ? shops.reduce((a, b) => (a.total_revenue_30d > b.total_revenue_30d ? a : b))
    : null;

  // Top category by revenue
  const categoryRevenue = new Map<string, number>();
  commodities.forEach((c) => {
    categoryRevenue.set(c.category, (categoryRevenue.get(c.category) ?? 0) + c.total_revenue_30d);
  });
  let topCat = '—';
  let topCatRev = 0;
  categoryRevenue.forEach((rev, cat) => {
    if (rev > topCatRev) { topCatRev = rev; topCat = cat; }
  });

  return {
    total_shops: shops.length,
    total_branches: data.branches.length,
    total_products: data.products.length,
    total_sales_30d: commodities.reduce((sum, c) => sum + c.total_sold_30d, 0),
    total_revenue_30d: Math.round(commodities.reduce((sum, c) => sum + c.total_revenue_30d, 0)),
    avg_price_change_7d: Math.round(avgChange * 10) / 10,
    rising_count: rising,
    falling_count: falling,
    stable_count: stable,
    most_traded: mostTraded,
    highest_revenue_shop: topShop?.business_name ?? '—',
    top_category: topCat,
  };
}

// ── Category guesser ───────────────────────────────────────────────────────

function guessCategory(name: string): string {
  const lower = name.toLowerCase();
  if (/rice|sugar|salt|oil|gari|flour|yam|cassava|maize|pepper|tomato|onion/.test(lower)) return 'Groceries';
  if (/milk|tea|coffee|juice|water|coke|fanta|sprite|beer|wine/.test(lower)) return 'Beverages';    if (/paracetamol|amoxicillin|vitamin|medicine|drug|cream|lotion/.test(lower)) return 'Health';
  if (/rice|sugar|frytol|peak|milo|nescafe|indomie/.test(lower)) return 'Provisions';
  if (/phone|charger|cable|earphone|airpod/.test(lower)) return 'Electronics';
  if (/shirt|trouser|dress|fabric|shoe/.test(lower)) return 'Fashion';
  return 'General';
}
