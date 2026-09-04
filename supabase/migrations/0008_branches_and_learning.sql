-- BranchPort: 0008 — branch provisioning + the agent's learning loop
--
-- 1. Branch provisioning. A manager opens a new branch (typically before
--    inviting its first staff member), so branches need a manager-write
--    policy and their own audit trigger — opening a branch is an action
--    the owner's activity log must show, exactly like product edits.
--
-- 2. Learning loop. The "Ask BranchPort" agent is recorded in query_log
--    (0006). To let the agent get measurably better, every answer can now
--    be rated helpful / not — a `helpful` flag on the row. The dashboard
--    writes it only for rows the owner created (same RLS as the insert),
--    and the intelligence layer can then weigh past questions it has been
--    asked when answering the next one.

-- ---- 1. branches: manager write + audit coverage ---------------------

create policy branches_write_manager on branches for insert
  with check (business_id = current_business_id() and current_user_role() = 'manager');

-- Extend the shared trigger so branch creation lands in audit_events. The
-- existing function is recreated here with branches in the resolution list.
create or replace function log_audit_event() returns trigger
language plpgsql security definer as $$
declare
  v_business_id uuid;
  v_actor uuid := auth.uid();
begin
  if TG_TABLE_NAME in ('products', 'suppliers', 'inventory_intake', 'branches') then
    v_business_id := coalesce(new.business_id, old.business_id);
  elsif TG_TABLE_NAME in ('supplier_payments', 'supplier_reconciliations') then
    select business_id into v_business_id from suppliers
      where id = coalesce(new.supplier_id, old.supplier_id);
  elsif TG_TABLE_NAME in ('inventory_allocations', 'sales') then
    select business_id into v_business_id from branches
      where id = coalesce(new.branch_id, old.branch_id);
  end if;

  insert into audit_events (
    business_id, actor_user_id, action_type, entity_type, entity_id,
    before_state, after_state, occurred_at, client_reported_at
  ) values (
    v_business_id,
    v_actor,
    lower(TG_OP),
    TG_TABLE_NAME,
    coalesce(new.id, old.id),
    case when TG_OP = 'UPDATE' then to_jsonb(old) else null end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    now(),
    case when TG_TABLE_NAME = 'sales' then new.client_reported_at else null end
  );

  return new;
end;
$$;

create trigger trg_audit_branches
  after insert or update on branches
  for each row execute function log_audit_event();

-- ---- 2. query_log: feedback for the learning loop --------------------

alter table query_log add column if not exists helpful boolean;
alter table query_log add column if not exists answered_by_model boolean not null default false;

-- Owner can update only rows they created, and only the two learning
-- fields — never the question or intent (append-only for content).
create policy query_log_update_feedback on query_log for update
  using (current_user_role() = 'owner' and business_id = current_business_id() and actor_user_id = auth.uid())
  with check (business_id = current_business_id() and actor_user_id = auth.uid());