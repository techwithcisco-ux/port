-- Fix: allow owner to also insert suppliers, branches, products, and
-- related tables.  The original RLS policies only granted write access
-- to the manager role, which blocked the owner from creating suppliers
-- or branches through the UI.

-- ---- suppliers -------------------------------------------------------
drop policy if exists suppliers_write_manager on suppliers;
create policy suppliers_write_manager on suppliers for insert
  with check (
    business_id = current_business_id()
    and current_user_role() in ('manager', 'owner')
  );

-- ---- branches --------------------------------------------------------
drop policy if exists branches_write_manager on branches;
create policy branches_write_manager on branches for insert
  with check (
    business_id = current_business_id()
    and current_user_role() in ('manager', 'owner')
  );

-- ---- products --------------------------------------------------------
drop policy if exists products_write_manager on products;
create policy products_write_manager on products for insert
  with check (
    business_id = current_business_id()
    and current_user_role() in ('manager', 'owner')
  );

-- ---- inventory intake ------------------------------------------------
drop policy if exists intake_write_manager on inventory_intake;
create policy intake_write_manager on inventory_intake for insert
  with check (
    business_id = current_business_id()
    and current_user_role() in ('manager', 'owner')
  );

-- ---- inventory allocations -------------------------------------------
drop policy if exists allocations_write_manager on inventory_allocations;
create policy allocations_write_manager on inventory_allocations for insert
  with check (
    current_user_role() in ('manager', 'owner')
    and branch_id in (select id from branches where business_id = current_business_id())
  );

-- ---- product variants (no direct business_id — check via products) ---
drop policy if exists product_variants_write_manager on product_variants;
create policy product_variants_write_manager on product_variants for insert
  with check (
    current_user_role() in ('manager', 'owner')
    and product_id in (select id from products where business_id = current_business_id())
  );
