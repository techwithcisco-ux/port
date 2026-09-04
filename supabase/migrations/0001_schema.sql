-- BranchPort: core schema
-- See branchport-requirements.txt Section 3 for the full data model spec.

create extension if not exists "pgcrypto";

create type user_role as enum ('owner', 'manager', 'staff');
create type sale_unit_type as enum ('bulk', 'retail');

create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid, -- set after the owner's auth user exists; fk added below
  created_at timestamptz not null default now()
);

create table branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- Mirrors auth.users (Supabase managed). One row per app user, carrying
-- the role and scoping that every RLS policy in 0002 depends on.
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null, -- null for owner/manager
  role user_role not null,
  name text not null,
  created_at timestamptz not null default now()
);

alter table businesses
  add constraint businesses_owner_user_id_fkey
  foreign key (owner_user_id) references users(id) on delete set null;

create table products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  bulk_unit_name text not null,         -- e.g. 'bag'
  retail_unit_name text not null,       -- e.g. 'cup'
  units_per_bulk numeric not null check (units_per_bulk > 0),
  bulk_cost_price numeric not null check (bulk_cost_price >= 0),
  bulk_sell_price numeric not null check (bulk_sell_price >= 0),
  retail_sell_price numeric not null check (retail_sell_price >= 0),
  created_at timestamptz not null default now()
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table inventory_intake (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  supplier_id uuid not null references suppliers(id),
  product_id uuid not null references products(id),
  bulk_quantity numeric not null check (bulk_quantity > 0),
  cost_price_total numeric not null check (cost_price_total >= 0),
  amount_paid numeric not null default 0 check (amount_paid >= 0),
  amount_owed numeric generated always as (cost_price_total - amount_paid) stored,
  created_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

create table inventory_allocations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  branch_id uuid not null references branches(id),
  bulk_quantity numeric not null check (bulk_quantity > 0),
  retail_quantity_equivalent numeric not null,
  allocated_at timestamptz not null default now(),
  allocated_by uuid not null references users(id)
);

-- id is client-generated (see requirements 5: offline sync) so it is NOT
-- defaulted server-side. sold_at is server-assigned on insert; the client's
-- own clock reading is kept separately in client_reported_at so the gap
-- between them can be used to flag backdating (requirements 4.5).
create table sales (
  id uuid primary key,
  branch_id uuid not null references branches(id),
  product_id uuid not null references products(id),
  unit_type sale_unit_type not null,
  quantity numeric not null check (quantity > 0),
  unit_price numeric not null check (unit_price >= 0),
  total_price numeric not null check (total_price >= 0),
  sold_by uuid not null references users(id),
  sold_at timestamptz not null default now(),
  client_reported_at timestamptz not null,
  price_flagged boolean not null default false
);

-- Append-only. No update/delete grants are given to any application role
-- (see 0002_rls_policies.sql). occurred_at is never client-writable.
create table audit_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  actor_user_id uuid not null references users(id),
  action_type text not null,        -- e.g. 'insert', 'update'
  entity_type text not null,        -- e.g. 'sales', 'inventory_allocations'
  entity_id uuid not null,
  before_state jsonb,
  after_state jsonb,
  occurred_at timestamptz not null default now(),
  client_reported_at timestamptz
);

create index idx_branches_business on branches(business_id);
create index idx_users_business on users(business_id);
create index idx_products_business on products(business_id);
create index idx_suppliers_business on suppliers(business_id);
create index idx_intake_business on inventory_intake(business_id);
create index idx_intake_supplier on inventory_intake(supplier_id);
create index idx_allocations_branch on inventory_allocations(branch_id);
create index idx_sales_branch on sales(branch_id);
create index idx_sales_sold_at on sales(sold_at);
create index idx_audit_business on audit_events(business_id);
create index idx_audit_actor on audit_events(actor_user_id);
create index idx_audit_entity on audit_events(entity_type, entity_id);
