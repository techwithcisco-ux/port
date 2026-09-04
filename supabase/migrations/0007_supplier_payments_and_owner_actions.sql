-- BranchPort: supplier payments + reconciliation + owner-action writes
--
-- Two trust additions on top of the existing append-only ledger:
--
-- 1. supplier_payments — a payment is never an update to an intake row
--    (those are deliberately immutable, requirements 4.1). It is its own
--    append-only row carrying the supplier, amount and who recorded it.
--    The running balance the UI shows is always DERIVED on read:
--    sum(intake.amount_owed) - sum(payments). Nothing is overwritten.
--
-- 2. supplier_reconciliations — a statement that a supplier's balance is
--    confirmed (the supplier reconciled the amount they owe). It is a
--    first-class record, not a comment field, so "did everyone actually
--    confirm?" can be answered from data.
--
-- Both new tables are wired into the SAME audit trigger, so every payment
-- and every confirmation lands in the owner's activity log automatically,
-- exactly like product edits already do.
--
-- The owner can now also edit product prices directly (their AI commands
-- like "this item now costs 20 cedis" become a products UPDATE). That
-- write is covered by the existing trg_audit_products trigger, so the
-- change is logged with the owner as actor the moment it happens.

create table supplier_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  amount numeric not null check (amount > 0),
  note text,
  paid_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

create table supplier_reconciliations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  status text not null check (status in ('confirmed', 'disputed')),
  note text,
  reconciled_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

create index idx_payments_supplier on supplier_payments(supplier_id);
create index idx_reconciliations_supplier on supplier_reconciliations(supplier_id);

-- ---- audit trigger coverage -------------------------------------------

-- Extend business_id resolution: supplier_payments / supplier_reconciliations
-- carry supplier_id, so resolve through suppliers -> business.
drop trigger if exists trg_audit_supplier_payments on supplier_payments;
drop trigger if exists trg_audit_supplier_reconciliations on supplier_reconciliations;

create or replace function log_audit_event() returns trigger
language plpgsql security definer as $$
declare
  v_business_id uuid;
  v_actor uuid := auth.uid();
begin
  if TG_TABLE_NAME in ('products', 'suppliers', 'inventory_intake') then
    v_business_id := coalesce(new.business_id, old.business_id);
  elsif TG_TABLE_NAME in ('supplier_payments', 'supplier_reconciliations') then
    select business_id into v_business_id from suppliers
      where id = coalesce(new.supplier_id, old.supplier_id);
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

create trigger trg_audit_supplier_payments
  after insert or update on supplier_payments
  for each row execute function log_audit_event();

create trigger trg_audit_supplier_reconciliations
  after insert or update on supplier_reconciliations
  for each row execute function log_audit_event();

-- ---- RLS ---------------------------------------------------------------

alter table supplier_payments enable row level security;
alter table supplier_reconciliations enable row level security;

-- Reading: manager and owner (mirrors suppliers_read). Writing: owner and
-- manager may record payments (recording money-in is part of the ledger),
-- but reconciliations are owner-only — only the person who owns the books
-- can confirm a balance. No update/delete on either table: append-only.

create policy payments_read_manager_owner on supplier_payments for select
  using (
    business_id = current_business_id()
    and current_user_role() in ('manager', 'owner')
  );

create policy payments_write_manager_owner on supplier_payments for insert
  with check (
    business_id = current_business_id()
    and current_user_role() in ('manager', 'owner')
  );

create policy reconciliations_read_owner_only on supplier_reconciliations for select
  using (current_user_role() = 'owner' and business_id = current_business_id());

create policy reconciliations_write_owner_only on supplier_reconciliations for insert
  with check (current_user_role() = 'owner' and business_id = current_business_id());

-- Owner may also update product prices (the manager could already; the
-- owner's AI commands need the same write). Everything is still audited by
-- trg_audit_products, and RLS keeps this scoped to the owner's own
-- business.
create policy products_update_owner on products for update
  using (business_id = current_business_id() and current_user_role() = 'owner');