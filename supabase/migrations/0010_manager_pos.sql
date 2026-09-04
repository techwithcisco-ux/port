-- BranchPort: allow managers to operate a branch POS.
-- Managers already have read access to business sales and may allocate stock;
-- this adds the matching append-only sale insert path for their own branches.

create policy sales_insert_manager on sales for insert
  with check (
    current_user_role() = 'manager'
    and branch_id in (select id from branches where business_id = current_business_id())
  );
