-- Allow authenticated users to insert audit events for their business.
-- The existing trigger handles automatic audit on table changes; this policy
-- lets the POS client log custom events like discounts and credit sales.

create policy audit_insert_auth on audit_events for insert
  with check (
    business_id = current_business_id()
    and actor_user_id = auth.uid()
  );
