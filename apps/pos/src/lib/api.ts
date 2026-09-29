import { createApiClient } from '@branchport/shared';

// Backend REST API (apps/api). In production VITE_API_URL points at the
// Render service (e.g. https://branchport-api.onrender.com); unset means
// the local dev API on localhost:8080.
export const apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
  || 'http://localhost:8080';

// `api` keeps the from()/auth surface the POS screens were written
// against, executing over REST + JWT instead of a database client.
// Typed as any for the same reason as the dashboard: the codebase uses
// the loose destructured-{data,error} style throughout.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const api: any = createApiClient({
  baseUrl: apiBaseUrl,
  tokenKey: 'branchport-pos-token',
  userKey: 'branchport-pos-user',
});
