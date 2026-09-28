import { createSupabaseClient, createApiClient } from '@branchport/shared';

// Render Postgres path: set VITE_API_URL to the apps/api service
// (e.g. https://branchport-api.onrender.com). When present, all
// data + auth goes over REST + JWT and no Supabase env is required.
// Otherwise falls back to the legacy Supabase project.
export const apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';
export const isApiMode = apiBaseUrl.length > 0;

function buildClient() {
  if (isApiMode) {
    return createApiClient({ baseUrl: apiBaseUrl, tokenKey: 'bp-session-token', userKey: 'bp-session-user' });
  }
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing VITE_API_URL (Render API) or VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. '
      + 'Copy .env.example to .env and fill in one backend.',
    );
  }
  return createSupabaseClient(url, key);
}

// `supabase` keeps its name so the 40+ screens using
// supabase.from(...)/supabase.rpc(...)/supabase.auth.* work unchanged
// in both backends (see packages/shared apiClient for the REST shim).
// Typed as any: the two backends (supabase-js vs REST shim) expose the
// same runtime shape but different static types; the codebase uses the
// loose destructured-{data,error} style throughout.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: any = buildClient();
