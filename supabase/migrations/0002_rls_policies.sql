-- BranchPort: row-level security
-- This is the actual enforcement mechanism for requirements.txt Section 1.
-- Do not treat UI-level hiding as a substitute for anything in this file.

-- Helper functions (security definer so they can read `users` without
-- recursing into the RLS policy being evaluated on `users` itself).
create or replace function current_user_role() returns user_role
language sql security definer stable as $$
  select role from users where id = auth.uid();
$$;

create or replace function current_business_id() returns uuid
language sql security definer stable as $$
  select business_id from users where id = auth.uid();
$$;

create or replace function current_branch_id() returns uuid
language sql security definer stable as $$
  select branch_id from users where id = auth.uid();
$$;

alter table businesses enable row level security;
alter table branches enable row level security;
alter table users enable row level security;
alter table products enable row level security;
alter table suppliers enable row level security;
alter table inventory_intake enable row level security;
alter table inventory_allocations enable row level security;
alter table sales enable row level security;
alter table audit_events enable row level security;

-- businesses / branches / users: readable by anyone in the same business.
-- No direct client writes to `users` — user provisioning happens via a
-- server-side function (see 0004) triggered by the manager's invite flow.
create policy business_read on businesses for select
  using (id = current_business_id());

create policy branches_read on branches for select
  using (business_id = current_business_id());

create policy users_read on users for select
  using (business_id = current_business_id());

-- products / suppliers / inventory_intake / inventory_allocations:
-- manager and owner can read everything in their business; only manager
-- can write. Staff can read products (they need names/prices to sell) and
-- their own branch's allocations, nothing else.
create policy products_read on products for select
  using (business_id = current_business_id());

create policy products_write_manager on products for insert
  with check (business_id = current_business_id() and current_user_role() = 'manager');

create policy products_update_manager on products for update
  using (business_id = current_business_id() and current_user_role() = 'manager');

create policy suppliers_read on suppliers for select
  using (
    business_id = current_business_id()
    and current_user_role() in ('manager', 'owner')
  );

create policy suppliers_write_manager on suppliers for insert
  with check (business_id = current_business_id() and current_user_role() = 'manager');

create policy intake_read on inventory_intake for select
  using (
    business_id = current_business_id()
    and current_user_role() in ('manager', 'owner')
  );

create policy intake_write_manager on inventory_intake for insert
  with check (business_id = current_business_id() and current_user_role() = 'manager');
-- Deliberately no UPDATE or DELETE policy on inventory_intake for any
-- role: corrections are new rows (append-only rule, requirements 4.1).

create policy allocations_read_manager_owner on inventory_allocations for select
  using (
    current_user_role() in ('manager', 'owner')
    and branch_id in (select id from branches where business_id = current_business_id())
  );

create policy allocations_read_staff_own_branch on inventory_allocations for select
  using (current_user_role() = 'staff' and branch_id = current_branch_id());

create policy allocations_write_manager on inventory_allocations for insert
  with check (
    current_user_role() = 'manager'
    and branch_id in (select id from branches where business_id = current_business_id())
  );
-- No UPDATE/DELETE: reallocation is a new row, not an edit.

-- sales: staff can insert only for their own branch, and can read only
-- their own branch's sales. Manager/owner can read all branches. Nobody
-- can update or delete a sale once created — see requirements 4.1 and the
-- acceptance criteria in requirements.txt Section 9.
create policy sales_read_manager_owner on sales for select
  using (
    current_user_role() in ('manager', 'owner')
    and branch_id in (select id from branches where business_id = current_business_id())
  );

create policy sales_read_staff_own_branch on sales for select
  using (current_user_role() = 'staff' and branch_id = current_branch_id());

create policy sales_insert_staff on sales for insert
  with check (current_user_role() = 'staff' and branch_id = current_branch_id());

-- audit_events: owner-only read. Manager's dashboard must NOT query this
-- table directly (requirements 2.1: manager view does not show the raw
-- audit log). No insert/update/delete policy is granted to any client
-- role at all — every row is written exclusively by the trigger in
-- 0003_audit_trigger.sql, which runs as the table owner and bypasses RLS.
create policy audit_read_owner_only on audit_events for select
  using (current_user_role() = 'owner' and business_id = current_business_id());
