-- BranchPort: 0006 — the observation layer behind "Ask BranchPort"
--
-- The guided analyst (apps/dashboard/src/components/AgentPanel.tsx) is the
-- opposite of a black box: whenever the owner asks anything, and whenever
-- they run a parameterised query, a row lands here. This is the guarantee
-- that nothing disappears, and it mirrors the audit trigger philosophy —
-- the data system observes even the tool that reads it.
--
-- OWNER ONLY, by design. Read is restricted to the owner role; write is
-- restricted to the owner role as well (only the owner dashboard calls
-- planQuery/run). Staff and managers have no policy on this table — they
-- cannot read or write it, regardless of UI. See requirements 2.1.

create table if not exists query_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) not null default current_business_id(),
  actor_user_id uuid references users(id) not null default auth.uid(),
  question text not null,
  intent text not null,
  values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table query_log enable row level security;

create policy query_log_read_owner on query_log for select
  using (current_user_role() = 'owner' and business_id = current_business_id());

create policy query_log_write_owner on query_log for insert
  with check (current_user_role() = 'owner' and business_id = current_business_id());

create index if not exists idx_query_log_created on query_log(created_at desc);