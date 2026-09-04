-- BranchPort: audit trigger
-- This is what makes the audit log trustworthy: it fires at the database
-- layer on every insert/update to a tracked table, regardless of which
-- client or role made the write, and cannot be bypassed by application
-- code (including the manager dashboard). See requirements 4.1.

create or replace function log_audit_event() returns trigger
language plpgsql security definer as $$
declare
  v_business_id uuid;
  v_actor uuid := auth.uid();
begin
  -- Resolve business_id whichever way the row exposes it.
  if TG_TABLE_NAME in ('products', 'suppliers', 'inventory_intake') then
    v_business_id := coalesce(new.business_id, old.business_id);
  elsif TG_TABLE_NAME = 'inventory_allocations' then
    select business_id into v_business_id from branches
      where id = coalesce(new.branch_id, old.branch_id);
  elsif TG_TABLE_NAME = 'sales' then
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

create trigger trg_audit_products
  after insert or update on products
  for each row execute function log_audit_event();

create trigger trg_audit_suppliers
  after insert or update on suppliers
  for each row execute function log_audit_event();

create trigger trg_audit_inventory_intake
  after insert or update on inventory_intake
  for each row execute function log_audit_event();

create trigger trg_audit_inventory_allocations
  after insert or update on inventory_allocations
  for each row execute function log_audit_event();

create trigger trg_audit_sales
  after insert or update on sales
  for each row execute function log_audit_event();

-- Backdating detection is read-time, not write-time: it's computed as a
-- view rather than blocking or flagging at insert, since legitimate
-- offline sync delay produces the same signature as backdating and only
-- a human (the owner) should judge which is which.
create view flagged_backdated_events as
  select *,
    extract(epoch from (occurred_at - client_reported_at)) / 60 as gap_minutes
  from audit_events
  where client_reported_at is not null
    and abs(extract(epoch from (occurred_at - client_reported_at))) > 600; -- 10 min, requirements 4.5
