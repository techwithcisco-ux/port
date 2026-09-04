-- 0009_pos_customers.sql
-- Captures customer details at the point-of-sale till.
--
-- The POS cashier can attach a customer name + phone to a sale (see the
-- reference desktop app's Customer Information card). These columns are
-- OPTIONAL so anonymous informal-market cash sales keep working unchanged.
-- The value rides along on every sale row the POS inserts, so the manager
-- and owner can later see who bought without a separate join.
--
-- Reviewed SQL only (same as 0007/0008): no Docker/Supabase CLI locally,
-- so this file is not executed here. Append-only guarantees still hold —
-- sales are never updated after insert.

alter table sales
  add column customer_name  text,
  add column customer_phone text;
