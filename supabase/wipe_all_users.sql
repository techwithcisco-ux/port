-- wipe_all_users.sql — decommission wipe for the OLD Supabase project.
-- Run in Supabase Dashboard → SQL Editor AFTER the Render Postgres cutover
-- is verified (owner can sign in on the Render dashboard URL and sees data).
--
-- What it does: deletes EVERY app row (sales, products, audit, …) plus ALL
-- users (app users AND auth.users) inside ONE transaction, in FK-safe order.
-- What it does NOT do: drop tables, policies, functions, or the project.
--
-- SAFETY: the transaction ends with ROLLBACK. Steps:
--   1. Paste + Run → inspect the verification counts (all should be 0).
--   2. Only if counts are 0 AND Render is verified: change the last line
--      from ROLLBACK to COMMIT and Run once more.
-- There is no undo after COMMIT. Export a backup first
-- (Dashboard → Database → Backups) if you want one.

BEGIN;

-- ── Leaf tables first (reference users / products / branches) ──
DELETE FROM debtor_payments;
DELETE FROM creditor_payments;
DELETE FROM expense_payments;
DELETE FROM debtors;
DELETE FROM creditors;
DELETE FROM expenses;
DELETE FROM query_log;
DELETE FROM audit_events;
DELETE FROM flagged_backdated_events;
DELETE FROM sales;
DELETE FROM invoices;
DELETE FROM inventory_allocations;
DELETE FROM inventory_intake;
DELETE FROM supplier_payments;
DELETE FROM supplier_reconciliations;
DELETE FROM product_variants;
DELETE FROM products;
DELETE FROM suppliers;

-- ── Users, then branches, then businesses ──
-- (users.branch_id is SET NULL; businesses.owner is SET NULL, so plain
-- deletes work once the tables above are empty.)
DELETE FROM users;
DELETE FROM branches;
DELETE FROM businesses;

-- ── Auth accounts (login itself) ──
DELETE FROM auth.users;

-- ── Verify: every count must be 0 ──
SELECT 'audit_events' AS tbl, count(*) FROM audit_events
UNION ALL SELECT 'sales', count(*) FROM sales
UNION ALL SELECT 'products', count(*) FROM products
UNION ALL SELECT 'users', count(*) FROM users
UNION ALL SELECT 'branches', count(*) FROM branches
UNION ALL SELECT 'businesses', count(*) FROM businesses
UNION ALL SELECT 'auth.users', count(*) FROM auth.users;

-- Change to COMMIT only after verifying counts are 0 AND Render works.
ROLLBACK;
