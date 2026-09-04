import type { Product, ProductVariant, Sale, SaleUnitType } from './types';

// Variant helpers shared by the dashboard and the POS. The canonical rule:
// a product's variants come from `product.variants` when present; products
// without stored variants (legacy rows, or a catalog snapshot that hasn't
// pulled product_variants yet) fall back to the two synthetic variants the
// old bulk/retail columns describe. That keeps every downstream consumer —
// the till, stock math, analytics — working for both cases.

const tmpVariantId = (kind: 'retail' | 'bulk') => `__legacy_${kind}`;

export function getProductVariants(product: Product): ProductVariant[] {
  if (product.variants && product.variants.length > 0) {
    return [...product.variants].sort((a, b) => a.sort_order - b.sort_order);
  }
  const retail: ProductVariant = {
    id: tmpVariantId('retail'),
    product_id: product.id,
    name: product.retail_unit_name,
    price: Number(product.retail_sell_price),
    base_units: 1,
    sort_order: 0,
    created_at: product.created_at,
  };
  const bulk: ProductVariant = {
    id: tmpVariantId('bulk'),
    product_id: product.id,
    name: product.bulk_unit_name,
    price: Number(product.bulk_sell_price),
    base_units: Number(product.units_per_bulk) || 1,
    sort_order: 1,
    created_at: product.created_at,
  };
  return [retail, bulk];
}

export function findVariant(product: Product, variantId: string | null | undefined): ProductVariant | undefined {
  if (!variantId) return undefined;
  return getProductVariants(product).find((v) => v.id === variantId);
}

// How many base units a single unit of the variant consumes from stock.
export function variantBaseUnits(product: Product, variantId: string | null | undefined): number {
  const v = findVariant(product, variantId);
  if (v) return Number(v.base_units) || 1;
  return 1;
}

// How many base units a recorded sale consumed. Variant-aware; falls back
// to the legacy bulk/retail conversion for sales without a variant_id.
export function saleBaseUnits(product: Product, sale: Pick<Sale, 'variant_id' | 'unit_type'>): number {
  if (sale.variant_id) return variantBaseUnits(product, sale.variant_id);
  return sale.unit_type === 'bulk' ? Number(product.units_per_bulk) || 1 : 1;
}

// The legacy unit_type a variant maps to for sales rows. The base (first)
// variant is 'retail'; the bulk variant is 'bulk'; any custom variant is
// 'retail' so the price-consistency trigger and analytics treat it as a
// direct base-unit sale.
export function variantUnitType(product: Product, variant: ProductVariant): SaleUnitType {
  const variants = getProductVariants(product);
  const base = variants[0];
  if (variant.id === base?.id) return 'retail';
  if (variant.base_units > 1 && variant.id !== base?.id) return 'bulk';
  return 'retail';
}

// True when the variant was auto-derived from the legacy bulk/retail
// columns rather than a stored product_variants row.
export function isSyntheticVariant(variant: ProductVariant): boolean {
  return variant.id.startsWith('__legacy_');
}

// The base (stock-counting) variant — normally the first one.
export function baseVariant(product: Product): ProductVariant {
  return getProductVariants(product)[0];
}
