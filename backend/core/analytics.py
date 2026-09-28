"""Python port of packages/shared/src/analytics.ts + apps/pos/src/lib/inventory.ts."""
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone


def _d(x):
    return Decimal(str(x or 0))


def product_status(product, allocations, sales, branch_id=None, today_start=None):
    """Per-product metrics: allocated / sold / remaining / revenue / profit / status."""
    allocs = [a for a in allocations if str(a.product_id) == str(product.id)]
    if branch_id:
        allocs = [a for a in allocs if str(a.branch_id) == str(branch_id)]
    allocated = sum((_d(a.retail_quantity_equivalent) for a in allocs), Decimal("0"))

    psales = [s for s in sales if str(s.product_id) == str(product.id)]
    if branch_id:
        psales = [s for s in psales if str(s.branch_id) == str(branch_id)]
    sold = sum((_d(s.quantity) * _d(s.sale_base_units()) for s in psales), Decimal("0"))
    remaining = max(allocated - sold, Decimal("0"))

    tsales = [s for s in psales if today_start is None or s.sold_at >= today_start]
    revenue_today = sum((_d(s.total_price) for s in tsales), Decimal("0"))
    units_today = sum((_d(s.quantity) for s in tsales), Decimal("0"))
    revenue_total = sum((_d(s.total_price) for s in psales), Decimal("0"))
    base_cost = product.base_cost or Decimal("0")
    cogs_today = sum((_d(s.quantity) * base_cost * _d(s.sale_base_units()) for s in tsales), Decimal("0"))
    cost_total = allocated * (product.base_cost or Decimal("0"))
    inventory_value = remaining * (product.base_cost or Decimal("0"))
    potential = remaining * (product.retail_sell_price or Decimal("0"))
    profit_today = revenue_today - cogs_today
    ratio = (remaining / allocated) if allocated > 0 else Decimal("0")
    if remaining <= 0:
        status = "sold-out"
    elif ratio < Decimal("0.2"):
        status = "stock-low"
    else:
        status = "healthy"
    return {
        "product": product,
        "allocated": allocated,
        "sold": sold,
        "remaining": remaining,
        "revenue_today": revenue_today,
        "units_today": units_today,
        "revenue_total": revenue_total,
        "cogs_today": cogs_today,
        "cost_total": cost_total,
        "inventory_value": inventory_value,
        "potential": potential,
        "profit_today": profit_today,
        "expected_profit": potential - inventory_value,
        "status": status,
    }


def branch_stats(products, allocations, sales, branch_id, today_start):
    stats = [product_status(p, allocations, sales, branch_id, today_start) for p in products]
    return {
        "revenue_today": sum((s["revenue_today"] for s in stats), Decimal("0")),
        "units_today": sum((s["units_today"] for s in stats), Decimal("0")),
        "inventory_value": sum((s["inventory_value"] for s in stats), Decimal("0")),
        "potential": sum((s["potential"] for s in stats), Decimal("0")),
        "profit_today": sum((s["profit_today"] for s in stats), Decimal("0")),
        "by_product": sorted(stats, key=lambda s: s["inventory_value"], reverse=True),
        "top": sorted([s for s in stats if s["revenue_today"] > 0], key=lambda s: s["revenue_today"], reverse=True)[:6],
        "unsold": sorted(
            [s for s in stats if s["remaining"] > 0 and s["revenue_today"] == 0],
            key=lambda s: s["potential"],
            reverse=True,
        ),
    }


def business_analytics(products, branches, allocations, sales):
    """Port of calculateBusinessAnalytics: revenue/cost/profit per product & branch."""
    by_product, by_branch = [], []
    for p in products:
        ps = [s for s in sales if str(s.product_id) == str(p.id)]
        alloc = sum((_d(a.retail_quantity_equivalent) for a in allocations if str(a.product_id) == str(p.id)), Decimal("0"))
        sold_units = sum((_d(s.quantity) * _d(s.sale_base_units()) for s in ps), Decimal("0"))
        remaining = max(alloc - sold_units, Decimal("0"))
        revenue = sum((_d(s.total_price) for s in ps), Decimal("0"))
        base = p.base_cost or Decimal("0")
        cost = sum((_d(s.quantity) * base * _d(s.sale_base_units()) for s in ps), Decimal("0"))
        by_product.append({"product": p, "revenue": revenue, "cost": cost, "profit": revenue - cost,
                           "remaining": remaining, "expected": remaining * (p.retail_sell_price or Decimal("0"))})
    for b in branches:
        bs = [s for s in sales if str(s.branch_id) == str(b.id)]
        revenue = sum((_d(s.total_price) for s in bs), Decimal("0"))
        cost = Decimal("0")
        prod_map = {str(p.id): p for p in products}
        for s in bs:
            p = prod_map.get(str(s.product_id))
            if p:
                cost += _d(s.quantity) * (p.base_cost or Decimal("0")) * _d(s.sale_base_units())
        by_branch.append({"branch": b, "revenue": revenue, "cost": cost, "profit": revenue - cost,
                          "units": sum((_d(s.quantity) for s in bs), Decimal("0"))})
    by_product.sort(key=lambda x: x["revenue"], reverse=True)
    by_branch.sort(key=lambda x: x["revenue"], reverse=True)
    return {
        "revenue": sum((x["revenue"] for x in by_product), Decimal("0")),
        "cost": sum((x["cost"] for x in by_product), Decimal("0")),
        "profit": sum((x["profit"] for x in by_product), Decimal("0")),
        "products": by_product,
        "branches": by_branch,
    }


def detect_flags(sales, products):
    """Owner flags: price anomalies, backdating, repeated discounters."""
    prod_map = {str(p.id): p for p in products}
    price_flags, backdated = [], []
    discounter = defaultdict(int)
    for s in sales:
        p = prod_map.get(str(s.product_id))
        if p and p.retail_sell_price:
            expected = _d(p.retail_sell_price)
            # variant-aware expected price when variant known
            if s.variant_id and s.variant:
                expected = _d(s.variant.price)
            if expected > 0 and abs(_d(s.unit_price) - expected) / expected > Decimal("0.2"):
                price_flags.append(s)
        gap = abs((s.sold_at - s.client_reported_at).total_seconds()) if s.sold_at and s.client_reported_at else 0
        if gap > 3600:
            backdated.append(s)
        if s.is_discounted:
            discounter[str(s.sold_by_id)] += 1
    repeat = sorted(discounter.items(), key=lambda kv: kv[1], reverse=True)[:5]
    return {"price_flags": price_flags[:50], "backdated": backdated[:50], "repeat_discounters": repeat}
