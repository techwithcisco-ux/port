import { createSupabaseClient } from '@branchport/shared';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars. '
    + 'Copy .env.example to .env and fill in your Supabase project values.'
  );
}

export const supabase = createSupabaseClient(url, key);
