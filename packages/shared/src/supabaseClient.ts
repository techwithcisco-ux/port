import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Both apps call this with their own env vars (each app has its own
// .env — see .env.example in apps/dashboard and apps/pos). Kept as a
// factory rather than a singleton here so each app controls its own
// client lifecycle/session storage.
export function createSupabaseClient(url: string, anonKey: string): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error(
      'Missing Supabase URL or anon key. Copy .env.example to .env and fill in your project values.'
    );
  }
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}
