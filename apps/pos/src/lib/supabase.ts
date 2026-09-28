import { createSupabaseClient, createApiClient } from '@branchport/shared';

// Same backend switch as the dashboard: VITE_API_URL (Render apps/api)
// takes precedence; Supabase is the legacy fallback.
export const apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';
export const isApiMode = apiBaseUrl.length > 0;

function buildClient() {
  if (isApiMode) {
    return createApiClient({ baseUrl: apiBaseUrl, tokenKey: 'branchport-pos-token', userKey: 'branchport-pos-user' });
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: any = buildClient();
