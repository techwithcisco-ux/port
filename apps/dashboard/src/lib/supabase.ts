import { createSupabaseClient } from '@branchport/shared';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Don't crash the whole app on import when env is missing (e.g. fresh
// clone / demo). Create a placeholder client so routes still render and
// AuthContext can surface a friendly error on login instead.
if (!url || !key) {
  console.warn(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars. '
    + 'Copy .env.example to .env and fill in your Supabase project values.'
  );
}

export const supabase = createSupabaseClient(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder-anon-key'
);
