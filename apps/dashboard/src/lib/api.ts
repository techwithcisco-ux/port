import { createApiClient } from '@branchport/shared';

// All dashboard data + auth goes over REST + JWT to the apps/api service.
// Set VITE_API_URL in production (render.yaml injects the Render host);
// unset, it defaults to the local dev server so `npm run dev` just works.
export const apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
  || 'http://localhost:8080';

export const api = createApiClient({
  baseUrl: apiBaseUrl,
  tokenKey: 'bp-session-token',
  userKey: 'bp-session-user',
});
