import type { Branch, InventoryAllocation, Product, Sale } from './types';
import { saleBaseUnits } from './variants';

export interface ProductAnalytics {
  productId: string;
  productName: string;
  unitsSold: number;
  revenue: number;
  cost: number;
  profit: number;
  remainingUnits: number;
  expectedRevenue: number;
  expectedProfit: number;
  unsoldCost: number;
}

export interface BranchAnalytics {
  branchId: string;
  branchName: string;
  unitsSold: number;
  revenue: number;
  cost: number;
  profit: number;
}

export interface BusinessAnalytics {
  revenue: number;
  cost: number;
  profit: number;
  expectedRevenue: number;
  expectedProfit: number;
  products: ProductAnalytics[];
  branches: BranchAnalytics[];
}

function unitCost(product: Product, unitType: Sale['unit_type']) {
  return unitType === 'bulk' ? product.bulk_cost_price : product.bulk_cost_price / product.units_per_bulk;
}

// Cost of one base (first-variant) unit.
function baseCost(product: Product) {
  return product.units_per_bulk > 0 ? product.bulk_cost_price / product.units_per_bulk : 0;
}

// Cost of one unit as sold — variant-aware. A bag variant with base_units 24
// costs 24 × base unit cost, no matter how the sale row records unit_type.
function soldUnitCost(product: Product, sale: Sale) {
  return baseCost(product) * saleBaseUnits(product, sale);
}

/** Pure, deterministic business metrics used by dashboards and offline caches. */
export function calculateBusinessAnalytics(
  products: Product[],
  branches: Branch[],
  allocations: InventoryAllocation[],
  sales: Sale[]
): BusinessAnalytics {
  const byProduct = products.map((product) => {
    const productSales = sales.filter((sale) => sale.product_id === product.id);
    const allocated = allocations
      .filter((allocation) => allocation.product_id === product.id)
      .reduce((sum, allocation) => sum + Number(allocation.retail_quantity_equivalent), 0);
    const soldRetailUnits = productSales.reduce(
      (sum, sale) => sum + Number(sale.quantity) * (sale.unit_type === 'bulk' ? product.units_per_bulk : 1),
      0
    );
    const remainingUnits = Math.max(allocated - soldRetailUnits, 0);
    const revenue = productSales.reduce((sum, sale) => sum + Number(sale.total_price), 0);
    const cost = productSales.reduce((sum, sale) => sum + Number(sale.quantity) * soldUnitCost(product, sale), 0);
    const unsoldCost = remainingUnits * unitCost(product, 'retail');
    const expectedRevenue = remainingUnits * product.retail_sell_price;
    return {
      productId: product.id,
      productName: product.name,
      unitsSold: productSales.reduce((sum, sale) => sum + Number(sale.quantity), 0),
      revenue,
      cost,
      profit: revenue - cost,
      remainingUnits,
      expectedRevenue,
      expectedProfit: expectedRevenue - unsoldCost,
      unsoldCost,
    };
  });

  const byBranch = branches.map((branch) => {
    const branchSales = sales.filter((sale) => sale.branch_id === branch.id);
    const revenue = branchSales.reduce((sum, sale) => sum + Number(sale.total_price), 0);
    const cost = branchSales.reduce((sum, sale) => {
      const product = products.find((item) => item.id === sale.product_id);
      return product ? sum + Number(sale.quantity) * soldUnitCost(product, sale) : sum;
    }, 0);
    return {
      branchId: branch.id,
      branchName: branch.name,
      unitsSold: branchSales.reduce((sum, sale) => sum + Number(sale.quantity), 0),
      revenue,
      cost,
      profit: revenue - cost,
    };
  });

  return {
    revenue: byProduct.reduce((sum, item) => sum + item.revenue, 0),
    cost: byProduct.reduce((sum, item) => sum + item.cost, 0),
    profit: byProduct.reduce((sum, item) => sum + item.profit, 0),
    expectedRevenue: byProduct.reduce((sum, item) => sum + item.expectedRevenue, 0),
    expectedProfit: byProduct.reduce((sum, item) => sum + item.expectedProfit, 0),
    products: byProduct.sort((a, b) => b.revenue - a.revenue),
    branches: byBranch.sort((a, b) => b.revenue - a.revenue),
  };
}