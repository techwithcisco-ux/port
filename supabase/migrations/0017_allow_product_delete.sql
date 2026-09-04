-- 0017_allow_product_delete.sql
-- Products can't be deleted because inventory_intake.product_id
-- references products(id) with no ON DELETE rule.
-- Fix: make product_id nullable so intake records survive product deletion.

ALTER TABLE inventory_intake
  ALTER COLUMN product_id DROP NOT NULL;

-- Also allow null product_id in the intake table
ALTER TABLE inventory_intake
  DROP CONSTRAINT IF EXISTS inventory_intake_product_id_fkey;

ALTER TABLE inventory_intake
  ADD CONSTRAINT inventory_intake_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(id)
  ON DELETE SET NULL;
