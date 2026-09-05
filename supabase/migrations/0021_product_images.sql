-- 0021_product_images.sql
-- Add image column to products table for storing base64-encoded product photos.
-- Images are captured during stock intake or product setup so the POS grid
-- can display vivid product thumbnails — helping illiterate staff visually
-- identify items instead of relying on text search alone.

ALTER TABLE products ADD COLUMN IF NOT EXISTS image TEXT DEFAULT NULL;
