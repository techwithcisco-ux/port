import { createSupabaseClient, createDemoSupabase } from '@branchport/shared';

// Demo mode remains opt-in. Live mode is the default and only uses the
// in-memory dataset when a developer explicitly turns it on.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabaseClient: ReturnType<typeof createSupabaseClient> | ReturnType<typeof createDemoSupabase>;

if (import.meta.env.VITE_DEMO_MODE === '1') {
  supabaseClient = createDemoSupabase();
} else if (url && key) {
  supabaseClient = createSupabaseClient(url, key);
} else {
  console.error(
    '⚠️ Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars. '
    + 'The app cannot connect to Supabase. Falling back to demo mode.'
  );
  supabaseClient = createDemoSupabase();
}

export const supabase = supabaseClient;
