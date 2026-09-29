-- ============================================================
-- BranchPort Render Postgres — FULL PLATFORM WIPE (users + all data)
-- Run against branchport-db ONLY after explicit confirmation:
--   psql "$DATABASE_URL" -f apps/api/clear_platform.sql
-- What it does: deletes EVERY business row (users, branches,
-- businesses) plus ALL dependent data (sales, products, audit,
-- invoices, auth sessions, resets) in FK-safe order, one transaction.
-- After this the platform is a fresh install: sign up the owner again
-- from the dashboard URL.
-- There is no undo. Export a backup first if history matters.
-- ============================================================

BEGIN;

-- ── Auth sessions first (reference users) ──
DELETE FROM refresh_tokens;
DELETE FROM password_reset_tokens;
DELETE FROM auth_audit;

-- ── Leaf business tables (reference users / products / branches) ──
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
DELETE FROM waitlist_orders;
DELETE FROM waitlist_invites;

-- ── Users, then branches, then businesses ──
DELETE FROM users;
DELETE FROM branches;
DELETE FROM businesses;

-- ── Verify: every count must be 0 ──
SELECT 'users' AS tbl, count(*) FROM users
UNION ALL SELECT 'branches', count(*) FROM branches
UNION ALL SELECT 'businesses', count(*) FROM businesses
UNION ALL SELECT 'sales', count(*) FROM sales
UNION ALL SELECT 'products', count(*) FROM products
UNION ALL SELECT 'audit_events', count(*) FROM audit_events
UNION ALL SELECT 'refresh_tokens', count(*) FROM refresh_tokens
UNION ALL SELECT 'password_reset_tokens', count(*) FROM password_reset_tokens
UNION ALL SELECT 'waitlist_orders', count(*) FROM waitlist_orders
UNION ALL SELECT 'waitlist_invites', count(*) FROM waitlist_invites;

COMMIT;
