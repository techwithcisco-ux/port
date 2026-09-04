import { createSupabaseClient, createDemoSupabase } from '@branchport/shared';

// Demo mode is opt-in. Live mode is the default so the app only responds to
// real user activity unless a developer deliberately enables the seeded demo.
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
