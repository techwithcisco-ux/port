// BranchPort REST client — the single backend access layer.
// The browser cannot speak to Postgres directly, so apps/api (Express + pg)
// fronts the Render database. This client provides:
//   - `from(table)`: chainable query builder (select/eq/gte/lte/order/limit/
//     insert/update/delete/upsert) executing over REST with JWT auth
//   - `auth`: phone + password authentication against the /auth/* endpoints
// Every await resolves to the `{ data, error }` convention the screens use,
// so call sites read like synchronous DB access with explicit failures.

// `data` stays `any` on purpose: the dashboard/POS/market screens all use
// the loose destructured `{ data, error }` style the old client allowed.
// Narrowing here would break every call site for no runtime gain — the
// API's row shapes are documented in apps/api/schema.sql.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ApiQueryResult<T = any> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

export interface ApiUser {
  id: string;
  business_id: string | null;
  branch_id: string | null;
  role: 'owner' | 'manager' | 'staff';
  name: string;
  phone: string;
  pos_activated?: boolean;
  [key: string]: unknown;
}

export type AuthResult<T = ApiUser> =
  | { ok: true; token: string; accessToken: string; refreshToken: string; user: T }
  | { ok: false; error: string; passwordRequired?: boolean };

export type MeResult<T = ApiUser> =
  | { ok: true; user: T }
  | { ok: false; error: string };

type Filter = { col: string; op: 'eq' | 'gte' | 'lte'; val: string };

export function createApiClient(opts: {
  baseUrl: string;
  tokenKey?: string;
  refreshKey?: string;
  userKey?: string;
}) {
  let baseUrl = String(opts.baseUrl || '').replace(/\/$/, '');
  // Render's fromService:host injects a bare hostname — upgrade to https.
  if (baseUrl && !/:\/\//.test(baseUrl)) baseUrl = `https://${baseUrl}`;
  const tokenKey = opts.tokenKey || 'bp-api-token';
  const refreshKey = opts.refreshKey || `${tokenKey}-refresh`;
  const userKey = opts.userKey || 'bp-api-user';

  type AuthEvent = 'signed-in' | 'signed-out';
  type Session = { token: string; user: unknown } | null;
  const listeners = new Set<(event: AuthEvent, session: Session) => void>();

  const getToken = (): string | null => {
    try { return localStorage.getItem(tokenKey); } catch { return null; }
  };
  const getRefreshToken = (): string | null => {
    try { return localStorage.getItem(refreshKey); } catch { return null; }
  };
  const readUser = <T = ApiUser>(): T | null => {
    try {
      const raw = localStorage.getItem(userKey);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch { return null; }
  };
  const setSession = (accessToken: string, refreshToken: string, user: unknown) => {
    try {
      localStorage.setItem(tokenKey, accessToken);
      localStorage.setItem(refreshKey, refreshToken);
      localStorage.setItem(userKey, JSON.stringify(user));
    } catch { /* quota */ }
    listeners.forEach((cb) => { try { cb('signed-in', { token: accessToken, user }); } catch {} });
  };
  const clearSession = () => {
    try { localStorage.removeItem(tokenKey); localStorage.removeItem(refreshKey); localStorage.removeItem(userKey); } catch {}
    listeners.forEach((cb) => { try { cb('signed-out', null); } catch {} });
  };

  // Single-flight refresh: concurrent 401s share one rotation call.
  let refreshPromise: Promise<boolean> | null = null;
  async function refreshNow(): Promise<boolean> {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const rt = getRefreshToken();
      if (!rt) return false;
      try {
        const res = await fetch(`${baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.status !== 200 || !body.accessToken) {
          clearSession();
          return false;
        }
        setSession(body.accessToken, body.refreshToken, body.user ?? readUser());
        return true;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  }

  const AUTH_PATHS = new Set(['/auth/login', '/auth/pos-login', '/auth/refresh', '/auth/signup-owner']);

  async function request(
    path: string,
    init?: RequestInit,
    retry = true,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((init?.headers as Record<string, string>) || {}),
    };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
    const body = await res.json().catch(() => ({} as Record<string, unknown>));
    // Access tokens live 15 minutes: on expiry, rotate once and retry.
    // Refresh reuse (theft) or expiry clears the session -> signed-out.
    if (res.status === 401 && retry && !AUTH_PATHS.has(path) && getRefreshToken()) {
      const ok = await refreshNow();
      if (ok) return request(path, init, false);
    }
    return { status: res.status, body };
  }

  function toError(status: number, body: Record<string, unknown>): { message: string; code?: string } {
    return { message: (body?.error as string) || `Request failed (${status})` };
  }
  const networkError = (): { message: string } =>
    ({ message: 'Could not reach the server. Check your connection.' });

  // Chaining query builder: every method returns `this` and the query only
  // executes on await/.then — so .update(patch).eq(...), .delete().eq(...),
  // .insert(rows).select() and .select().eq().order() all read fluently.
  type PendingOp =
    | { kind: 'select' }
    | { kind: 'insert'; rows: unknown }
    | { kind: 'update'; patch: Record<string, unknown> }
    | { kind: 'delete' }
    | { kind: 'upsert'; row: Record<string, unknown> };

  class TableQuery {
    table: string;
    filters: Filter[] = [];
    orderBy: string | null = null;
    limitN: number | null = null;
    wantSingle = false;
    cols = '*';
    op: PendingOp = { kind: 'select' };

    constructor(table: string) { this.table = table; }

    select(cols = '*') { this.cols = cols; return this; }
    eq(col: string, val: unknown) { this.filters.push({ col, op: 'eq', val: String(val) }); return this; }
    gte(col: string, val: unknown) { this.filters.push({ col, op: 'gte', val: String(val) }); return this; }
    lte(col: string, val: unknown) { this.filters.push({ col, op: 'lte', val: String(val) }); return this; }
    order(col: string, opts?: { ascending?: boolean }) {
      this.orderBy = `${col}.${opts?.ascending === false ? 'desc' : 'asc'}`;
      return this;
    }
    limit(n: number) { this.limitN = n; return this; }
    insert(rows: unknown) { this.op = { kind: 'insert', rows }; return this; }
    update(patch: Record<string, unknown>) { this.op = { kind: 'update', patch }; return this; }
    delete() { this.op = { kind: 'delete' }; return this; }
    upsert(row: Record<string, unknown>) { this.op = { kind: 'upsert', row }; return this; }
    single() { this.wantSingle = true; return this.exec(); }

    filterQs(): string {
      return this.filters.map((f) => `eq.${encodeURIComponent(f.col)}=${encodeURIComponent(f.val)}`).join('&');
    }

    async execSelect(): Promise<ApiQueryResult> {
      try {
        const sp = new URLSearchParams();
        if (this.cols && this.cols !== '*') sp.set('select', this.cols);
        for (const f of this.filters) sp.append(`${f.op}.${f.col}`, f.val);
        if (this.orderBy) sp.set('order', this.orderBy);
        if (this.limitN != null) sp.set('limit', String(this.limitN));
        const { status, body } = await request(`/api/${this.table}?${sp.toString()}`);
        if (status !== 200) return { data: null, error: toError(status, body) };
        const data = (body.data ?? []) as unknown;
        if (this.wantSingle) {
          const arr = data as unknown[];
          if (!Array.isArray(arr) || arr.length === 0) return { data: null, error: { message: 'No rows' } };
          return { data: arr[0] as unknown, error: null };
        }
        return { data, error: null };
      } catch {
        return { data: null, error: networkError() };
      }
    }

    async execWrite(): Promise<ApiQueryResult> {
      try {
        const op = this.op;
        let res: { status: number; body: Record<string, unknown> };
        if (op.kind === 'insert') {
          res = await request(`/api/${this.table}`, { method: 'POST', body: JSON.stringify(op.rows) });
        } else if (op.kind === 'upsert') {
          res = await request(`/api/${this.table}/upsert`, { method: 'POST', body: JSON.stringify(op.row) });
        } else if (op.kind === 'update') {
          res = await request(`/api/${this.table}?${this.filterQs()}`, { method: 'PATCH', body: JSON.stringify(op.patch) });
        } else {
          res = await request(`/api/${this.table}?${this.filterQs()}`, { method: 'DELETE' });
        }
        if (res.status >= 400) return { data: null, error: toError(res.status, res.body) };
        const data = (res.body.data ?? null) as unknown;
        if (this.wantSingle) return { data: (Array.isArray(data) ? data[0] : data) ?? null, error: null };
        return { data, error: null };
      } catch {
        return { data: null, error: networkError() };
      }
    }

    async exec(): Promise<ApiQueryResult> {
      if (this.op.kind === 'select') return this.execSelect();
      return this.execWrite();
    }

    then<TResult1 = ApiQueryResult, TResult2 = never>(
      onfulfilled?: ((value: ApiQueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return this.exec().then(onfulfilled, onrejected);
    }
  }

  const pair = (body: Record<string, unknown>) => ({
    accessToken: body.accessToken as string,
    refreshToken: body.refreshToken as string,
    // `token` stays as the access-token alias so existing callers keep working.
    token: body.accessToken as string,
    user: body.user as ApiUser,
  });

  const auth = {
    /** Sign in any role with phone + password (access + refresh pair). */
    async login(phone: string, password: string): Promise<AuthResult> {
      try {
        const { status, body } = await request('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ phone, password }),
        });
        if (status !== 200) return { ok: false, error: toError(status, body).message };
        const p = pair(body);
        setSession(p.accessToken, p.refreshToken, p.user);
        return { ok: true, ...p };
      } catch {
        return { ok: false, error: networkError().message };
      }
    },

    /** Create a business + owner account in one call (dashboard signup). */
    async signupOwner(params: {
      name: string;
      phone: string;
      businessName: string;
      businessType?: string;
      password: string;
    }): Promise<AuthResult> {
      try {
        const { status, body } = await request('/auth/signup-owner', {
          method: 'POST',
          body: JSON.stringify(params),
        });
        if (status !== 200) return { ok: false, error: toError(status, body).message };
        const p = pair(body);
        setSession(p.accessToken, p.refreshToken, p.user);
        return { ok: true, ...p };
      } catch {
        return { ok: false, error: networkError().message };
      }
    },

    /** POS login: phone + password always required (no passwordless path). */
    async posLogin(phone: string, password?: string): Promise<AuthResult> {
      try {
        const { status, body } = await request('/auth/pos-login', {
          method: 'POST',
          body: JSON.stringify({ phone, password }),
        });
        if (status !== 200) {
          return {
            ok: false,
            error: toError(status, body).message,
            ...(body.passwordRequired ? { passwordRequired: true } : {}),
          };
        }
        const p = pair(body);
        setSession(p.accessToken, p.refreshToken, p.user);
        return { ok: true, ...p };
      } catch {
        return { ok: false, error: networkError().message };
      }
    },

    /** Burn a single-use POS activation link token and open a session. */
    async posActivate(token: string): Promise<AuthResult> {
      try {
        const { status, body } = await request('/auth/pos-activate', {
          method: 'POST',
          body: JSON.stringify({ token }),
        });
        if (status !== 200) return { ok: false, error: toError(status, body).message };
        const p = pair(body);
        setSession(p.accessToken, p.refreshToken, p.user);
        return { ok: true, ...p };
      } catch {
        return { ok: false, error: networkError().message };
      }
    },

    /** Validate the stored access token; auto-rotates once on expiry. */
    async me(): Promise<MeResult> {
      try {
        const { status, body } = await request('/auth/me');
        if (status !== 200) return { ok: false, error: toError(status, body).message };
        return { ok: true, user: body.user as ApiUser };
      } catch {
        return { ok: false, error: networkError().message };
      }
    },

    /** Force a refresh rotation now (used after foregrounding the app). */
    async refreshSession(): Promise<boolean> {
      return refreshNow();
    },

    /** Manager/owner provisions a staff or manager account (password required). */
    async createStaff(params: {
      name: string;
      phone: string;
      password: string;
      branch_id?: string;
      role?: 'staff' | 'manager';
    }): Promise<MeResult> {
      try {
        const { status, body } = await request('/auth/staff', {
          method: 'POST',
          body: JSON.stringify(params),
        });
        if (status !== 200 && status !== 201) return { ok: false, error: toError(status, body).message };
        return { ok: true, user: body.user as ApiUser };
      } catch {
        return { ok: false, error: networkError().message };
      }
    },

    /** Change own password (revokes all other sessions, returns fresh pair). */
    async changePassword(currentPassword: string, newPassword: string): Promise<AuthResult> {
      try {
        const { status, body } = await request('/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        if (status !== 200) return { ok: false, error: toError(status, body).message };
        const p = pair(body);
        setSession(p.accessToken, p.refreshToken, p.user);
        return { ok: true, ...p };
      } catch {
        return { ok: false, error: networkError().message };
      }
    },

    async requestPasswordReset(phone: string): Promise<{ ok: boolean; error?: string }> {
      try {
        const { status, body } = await request('/auth/password-reset/request', {
          method: 'POST',
          body: JSON.stringify({ phone }),
        });
        if (status !== 200) return { ok: false, error: toError(status, body).message };
        return { ok: true };
      } catch {
        return { ok: false, error: networkError().message };
      }
    },

    async confirmPasswordReset(phone: string, token: string, newPassword: string): Promise<AuthResult> {
      try {
        const { status, body } = await request('/auth/password-reset/confirm', {
          method: 'POST',
          body: JSON.stringify({ phone, token, newPassword }),
        });
        if (status !== 200) return { ok: false, error: toError(status, body).message };
        const p = pair(body);
        setSession(p.accessToken, p.refreshToken, p.user);
        return { ok: true, ...p };
      } catch {
        return { ok: false, error: networkError().message };
      }
    },

    /** Manager/owner reset: returns a one-time temp password for forwarding. */
    async adminResetStaff(userId: string): Promise<{ ok: true; tempPassword: string } | { ok: false; error: string }> {
      try {
        const { status, body } = await request('/auth/admin-reset', {
          method: 'POST',
          body: JSON.stringify({ userId }),
        });
        if (status !== 200) return { ok: false, error: toError(status, body).message };
        return { ok: true, tempPassword: body.tempPassword as string };
      } catch {
        return { ok: false, error: networkError().message };
      }
    },

    /** Revoke current refresh token server-side, then drop local session. */
    async logout(): Promise<void> {
      try {
        const rt = getRefreshToken();
        if (rt) {
          await fetch(`${baseUrl}/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: rt }),
          }).catch(() => null);
        }
      } finally {
        clearSession();
      }
    },

    /** Revoke ALL sessions for this user (e.g. lost device). */
    async logoutAll(): Promise<void> {
      try { await request('/auth/logout-all', { method: 'POST' }); } catch { /* best effort */ }
      clearSession();
    },

    /** Stored access JWT, or null when signed out. */
    getToken,

    /** Stored refresh token (opaque, long-lived). */
    getRefreshToken,

    /** Last-known user object from storage (may be stale — prefer `me()`). */
    getUser: readUser,

    /** Subscribe to sign-in/sign-out events. Returns an unsubscribe fn. */
    onChange(cb: (event: AuthEvent, session: Session) => void): () => void {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
  };

  return {
    from: (table: string) => new TableQuery(table),
    auth,
    baseUrl,
    isApiMode: true as const,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
