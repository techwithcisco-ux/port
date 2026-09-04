import type { Product, InventoryAllocation, QueuedSale } from '@branchport/shared';
import { saleBaseUnits } from '@branchport/shared';

export interface InventoryStats {
  totalRevenueToday: number;
  totalUnitsSoldToday: number;
  totalAllocatedQuantity: number;
  totalAllocatedCost: number;
  totalCostOfGoodsSoldToday: number;
  totalProfitToday: number;
  totalInventoryValue: number; // allocated stock × cost price
  totalPotentialRevenue: number; // remaining stock × retail price
  totalExpectedProfit: number; // potential revenue - remaining stock cost
}

export interface ProductInventoryStatus {
  product: Product;
  allocatedQuantity: number;
  soldQuantity: number;
  remainingQuantity: number;
  revenueToday: number;
  unitsSoldToday: number;
  revenueTotal: number;
  unitsSoldTotal: number;
  costTotal: number; // allocated × cost
  costOfGoodsSoldToday: number;
  inventoryValue: number; // remaining × cost
  potentialRevenue: number; // remaining × retail
  profitToday: number; // revenue - (sold quantity × cost)
  expectedProfit: number; // profit if remaining stock sells at retail price
  stockAtRisk: number; // cost value of remaining stock
  status: 'stock-low' | 'healthy' | 'sold-out'; // based on remaining vs allocated
}

export interface TopProductByRevenue {
  productName: string;
  productId: string;
  revenueToday: number;
  unitsSold: number;
  potentialRevenue: number;
}

export interface UnsoldProduct {
  productName: string;
  productId: string;
  allocatedQuantity: number;
  remainingQuantity: number;
  potentialRevenue: number;
  unit: string;
}

function getRetailPrice(p: Product, unitType: 'bulk' | 'retail'): number {
  return unitType === 'bulk' ? p.bulk_sell_price : p.retail_sell_price;
}

function getCostPrice(p: Product, unitType: 'bulk' | 'retail'): number {
  return unitType === 'bulk' ? p.bulk_cost_price : (p.bulk_cost_price / p.units_per_bulk);
}

// Cost of ONE base unit (the first variant's unit).
function getBaseCost(p: Product): number {
  return p.units_per_bulk > 0 ? p.bulk_cost_price / p.units_per_bulk : 0;
}

/**
 * Calculate remaining stock in retail-equivalent units.
 * Remaining = allocated - sold
 */
export function getRemainingStock(
  product: Product,
  allocations: InventoryAllocation[],
  sales: QueuedSale[]
): number {
  const allocated = allocations
    .filter((a) => a.product_id === product.id)
    .reduce((sum, a) => sum + Number(a.retail_quantity_equivalent), 0);

  const sold = sales
    .filter((s) => s.product_id === product.id)
    .reduce(
      (sum, s) => sum + Number(s.quantity) * saleBaseUnits(product, s),
      0
    );

  return Math.max(allocated - sold, 0);
}

/**
 * Get stats for a single product's inventory status.
 */
export function getProductInventoryStatus(
  product: Product,
  allocations: InventoryAllocation[],
  allSales: QueuedSale[],
  branchId: string,
  todayStart: string
): ProductInventoryStatus {
  const branchAllocations = allocations.filter((a) => a.branch_id === branchId);
  const branchSales = allSales.filter((s) => s.branch_id === branchId);
  const todaysSales = branchSales.filter((s) => s.product_id === product.id && s.sold_at >= todayStart);

  const allocated = branchAllocations
    .filter((a) => a.product_id === product.id)
    .reduce((sum, a) => sum + Number(a.retail_quantity_equivalent), 0);

  const productSales = branchSales.filter((s) => s.product_id === product.id);
  const sold = productSales.reduce(
    (sum, s) => sum + Number(s.quantity) * saleBaseUnits(product, s),
    0
  );

  const remaining = Math.max(allocated - sold, 0);

  const revenueToday = todaysSales.reduce((sum, s) => sum + Number(s.total_price), 0);
  const unitsSoldToday = todaysSales.reduce((sum, s) => sum + Number(s.quantity), 0);
  const revenueTotal = productSales.reduce((sum, s) => sum + Number(s.total_price), 0);
  const unitsSoldTotal = productSales.reduce((sum, s) => sum + Number(s.quantity), 0);

  // Cost for remaining stock (in retail units)
  const costPrice = getCostPrice(product, 'retail');
  const costTotal = allocated * costPrice;
  const inventoryValue = remaining * costPrice;

  // Potential revenue from remaining stock (in retail units)
  const retailPrice = getRetailPrice(product, 'retail');
  const potentialRevenue = remaining * retailPrice;

  // Profit today = revenue - (units sold × cost). Each sale's cost is the
  // base cost scaled by how many base units its variant consumed.
  const costOfGoodsSold = todaysSales.reduce(
    (sum, s) => sum + Number(s.quantity) * getBaseCost(product) * saleBaseUnits(product, s),
    0
  );
  const profitToday = revenueToday - costOfGoodsSold;
  const expectedProfit = potentialRevenue - inventoryValue;

  // Status based on remaining vs allocated
  const remainingRatio = allocated > 0 ? remaining / allocated : 0;
  let status: 'stock-low' | 'healthy' | 'sold-out' = 'healthy';
  if (remaining === 0) status = 'sold-out';
  else if (remainingRatio < 0.2) status = 'stock-low';

  return {
    product,
    allocatedQuantity: allocated,
    soldQuantity: sold,
    remainingQuantity: remaining,
    revenueToday,
    unitsSoldToday,
    revenueTotal,
    unitsSoldTotal,
    costTotal,
    costOfGoodsSoldToday: costOfGoodsSold,
    inventoryValue,
    potentialRevenue,
    profitToday,
    expectedProfit,
    stockAtRisk: inventoryValue,
    status,
  };
}

/**
 * Compute overall inventory stats for the branch today.
 */
export function getInventoryStats(
  products: Product[],
  allocations: InventoryAllocation[],
  sales: QueuedSale[],
  branchId: string,
  todayStart: string
): InventoryStats {
  const branchSales = sales.filter((s) => s.branch_id === branchId);
  const todaysSales = branchSales.filter((s) => s.sold_at >= todayStart);

  const totalRevenueToday = todaysSales.reduce((sum, s) => sum + Number(s.total_price), 0);
  const totalUnitsSoldToday = todaysSales.reduce((sum, s) => sum + Number(s.quantity), 0);

  let totalAllocatedQuantity = 0;
  let totalAllocatedCost = 0;
  let totalCostOfGoodsSoldToday = 0;
  let totalInventoryValue = 0;
  let totalPotentialRevenue = 0;
  let totalProfitToday = 0;
  let totalExpectedProfit = 0;

  for (const p of products) {
    const status = getProductInventoryStatus(p, allocations, sales, branchId, todayStart);
    totalAllocatedQuantity += status.allocatedQuantity;
    totalAllocatedCost += status.costTotal;
    totalCostOfGoodsSoldToday += status.costOfGoodsSoldToday;
    totalProfitToday += status.profitToday;
    totalInventoryValue += status.inventoryValue;
    totalPotentialRevenue += status.potentialRevenue;
    totalExpectedProfit += status.expectedProfit;
  }

  return {
    totalRevenueToday,
    totalUnitsSoldToday,
    totalAllocatedQuantity,
    totalAllocatedCost,
    totalCostOfGoodsSoldToday,
    totalProfitToday,
    totalInventoryValue,
    totalPotentialRevenue,
    totalExpectedProfit,
  };
}

/**
 * Get top products by revenue for today, sorted descending.
 */
export function getTopProductsByRevenue(
  products: Product[],
  allocations: InventoryAllocation[],
  sales: QueuedSale[],
  branchId: string,
  todayStart: string,
  limit: number = 6
): TopProductByRevenue[] {
  return products
    .map((p) => {
      const status = getProductInventoryStatus(p, allocations, sales, branchId, todayStart);
      return {
        productName: p.name,
        productId: p.id,
        revenueToday: status.revenueToday,
        unitsSold: status.unitsSoldToday,
        potentialRevenue: status.potentialRevenue,
      };
    })
    .filter((p) => p.revenueToday > 0)
    .sort((a, b) => b.revenueToday - a.revenueToday)
    .slice(0, limit);
}

/**
 * Get products with remaining stock but zero sales today (unsold).
 */
export function getUnsoldProducts(
  products: Product[],
  allocations: InventoryAllocation[],
  sales: QueuedSale[],
  branchId: string,
  todayStart: string
): UnsoldProduct[] {
  return products
    .map((p) => {
      const status = getProductInventoryStatus(p, allocations, sales, branchId, todayStart);
      return {
        productName: p.name,
        productId: p.id,
        allocatedQuantity: status.allocatedQuantity,
        remainingQuantity: status.remainingQuantity,
        potentialRevenue: status.potentialRevenue,
        unit: p.retail_unit_name,
      };
    })
    .filter((p) => p.remainingQuantity > 0 && p.potentialRevenue === 0)
    .sort((a, b) => b.potentialRevenue - a.potentialRevenue);
}

/**
 * Get inventory status for all products, sorted by inventory value descending.
 */
export function getAllProductInventoryStatus(
  products: Product[],
  allocations: InventoryAllocation[],
  sales: QueuedSale[],
  branchId: string,
  todayStart: string
): ProductInventoryStatus[] {
  return products
    .map((p) => getProductInventoryStatus(p, allocations, sales, branchId, todayStart))
    .sort((a, b) => b.inventoryValue - a.inventoryValue);
}
