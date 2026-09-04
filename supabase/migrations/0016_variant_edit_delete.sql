-- 0016_variant_edit_delete.sql
-- Allow managers to update and delete product variants.
-- Previously variants were append-only (corrections = new rows),
-- but for price editing we need UPDATE and DELETE.

-- UPDATE policy: managers can update variants in their business
create policy product_variants_update_manager on product_variants for update
  using (
    current_user_role() = 'manager'
    and product_id in (select id from products where business_id = current_business_id())
  );

-- DELETE policy: managers can delete variants in their business
create policy product_variants_delete_manager on product_variants for delete
  using (
    current_user_role() = 'manager'
    and product_id in (select id from products where business_id = current_business_id())
  );

-- Also allow owner to update/delete
create policy product_variants_update_owner on product_variants for update
  using (
    current_user_role() = 'owner'
    and product_id in (select id from products where business_id = current_business_id())
  );

create policy product_variants_delete_owner on product_variants for delete
  using (
    current_user_role() = 'owner'
    and product_id in (select id from products where business_id = current_business_id())
  );
