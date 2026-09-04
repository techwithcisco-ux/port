-- Add missing columns to businesses table for onboarding
-- These are used by the Onboarding page to store business details

DO $$ BEGIN
  ALTER TABLE businesses ADD COLUMN business_type text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE businesses ADD COLUMN business_form text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE businesses ADD COLUMN business_categories jsonb DEFAULT '[]'::jsonb;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
