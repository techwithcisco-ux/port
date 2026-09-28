// Render Postgres API client — supabase-js compatible subset.
// The browser cannot speak to Postgres directly, so apps/api (Express + pg)
// fronts the Render database. This client mirrors the supabase-js surface
// the frontends already use (from/select/eq/insert/update/delete/upsert,
// rpc, auth.*) over REST + JWT, so existing screens keep working.

export interface ApiQueryResult<T = unknown> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

type Filter = { col: string; op: 'eq' | 'gte' | 'lte'; val: string };

function phoneFromEmail(email: string): string {
  const local = String(email || '').split('@')[0] || '';
  return local.replace(/\s+/g, '').replace(/[^+\d]/g, '');
}

export function createApiClient(opts: {
  baseUrl: string;
  tokenKey?: string;
  userKey?: string;
}) {
  let baseUrl = String(opts.baseUrl || '').replace(/\/$/, '');
  // Render's fromService:host injects a bare hostname — upgrade to https.
  if (baseUrl && !/:\/\//.test(baseUrl)) baseUrl = `https://${baseUrl}`;
  const tokenKey = opts.tokenKey || 'bp-api-token';
  const userKey = opts.userKey || 'bp-api-user';

  const listeners = new Set<(event: string, session: unknown) => void>();
  let pendingSignup: { email: string; password: string; options?: { data?: Record<string, unknown> } } | null = null;

  const getToken = () => {
    try { return localStorage.getItem(tokenKey); } catch { return null; }
  };
  const setSession = (token: string, user: unknown) => {
    try {
      localStorage.setItem(tokenKey, token);
      localStorage.setItem(userKey, JSON.stringify(user));
    } catch { /* quota */ }
    listeners.forEach((cb) => { try { cb('SIGNED_IN', { user, access_token: token }); } catch {} });
  };
  const clearSession = () => {
    try { localStorage.removeItem(tokenKey); localStorage.removeItem(userKey); } catch {}
    listeners.forEach((cb) => { try { cb('SIGNED_OUT', null); } catch {} });
  };
  const readUser = <T = unknown>(): T | null => {
    try {
      const raw = localStorage.getItem(userKey);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch { return null; }
  };

  async function authed(path: string, init?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string> || {}) };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, { ...init, headers });
  }

  function toError(status: number, body: { error?: string }): { message: string; code?: string } {
    return { message: body?.error || `Request failed (${status})` };
  }

  // Mirrors supabase-js chaining: every method returns `this` and the
  // query only executes on await/.then — so .update(patch).eq(...),
  // .delete().eq(...), .insert(rows).select() and .select().eq().order()
  // all work exactly like the Supabase path.
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
        const res = await authed(`/api/${this.table}?${sp.toString()}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return { data: null, error: toError(res.status, body) };
        const data = (body.data ?? []) as unknown;
        if (this.wantSingle) {
          const arr = data as unknown[];
          if (!Array.isArray(arr) || arr.length === 0) return { data: null, error: { message: 'No rows' } };
          return { data: arr[0] as unknown, error: null };
        }
        return { data, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    }

    async execWrite(): Promise<ApiQueryResult> {
      try {
        const op = this.op;
        let res: Response;
        if (op.kind === 'insert') {
          res = await authed(`/api/${this.table}`, { method: 'POST', body: JSON.stringify(op.rows) });
        } else if (op.kind === 'upsert') {
          res = await authed(`/api/${this.table}/upsert`, { method: 'POST', body: JSON.stringify(op.row) });
        } else if (op.kind === 'update') {
          res = await authed(`/api/${this.table}?${this.filterQs()}`, { method: 'PATCH', body: JSON.stringify(op.patch) });
        } else {
          res = await authed(`/api/${this.table}?${this.filterQs()}`, { method: 'DELETE' });
        }
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return { data: null, error: toError(res.status, body) };
        const data = (body.data ?? null) as unknown;
        if (this.wantSingle) return { data: (Array.isArray(data) ? data[0] : data) ?? null, error: null };
        return { data, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
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

  async function rpc(fn: string, args?: Record<string, unknown>): Promise<ApiQueryResult> {
    // Signup flow: dashboard calls auth.signUp (buffers creds) then
    // rpc('signup_create_owner', {p_name, p_phone, p_business_name}).
    // Complete the real owner creation here where we have all fields.
    if (fn === 'signup_create_owner' && pendingSignup) {
      try {
        const res = await fetch(`${baseUrl}/auth/signup-owner`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: (args?.p_name as string) ?? '',
            phone: (args?.p_phone as string) ?? '',
            businessName: (args?.p_business_name as string) ?? '',
            password: pendingSignup.password,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return { data: null, error: toError(res.status, body) };
        setSession(body.token, body.user);
        pendingSignup = null;
        return { data: body.user ?? null, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    }
    if (fn === 'auto_confirm_user') return { data: true as unknown, error: null };
    try {
      const res = await authed(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args || {}) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { data: null, error: toError(res.status, body) };
      return { data: (body.data ?? null) as unknown, error: null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  }

  const auth = {
    async signUp(params: { email: string; password: string; options?: { data?: Record<string, unknown> } }) {
      pendingSignup = { email: params.email, password: params.password, options: params.options };
      // Return a pending user; the follow-up signup_create_owner RPC
      // completes creation and establishes the session.
      return { data: { user: { id: 'pending', email: params.email } }, error: null };
    },
    async signInWithPassword(params: { email: string; password: string }) {
      try {
        const phone = phoneFromEmail(params.email);
        const res = await fetch(`${baseUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, password: params.password }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = body?.error || 'Login failed';
          return { data: null, error: { message: /wrong|invalid/i.test(msg) ? 'Invalid login credentials' : msg } };
        }
        setSession(body.token, body.user);
        return { data: { user: body.user, session: { access_token: body.token, user: body.user } }, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
    async signOut() {
      clearSession();
      pendingSignup = null;
      return { error: null };
    },
    async getSession() {
      const token = getToken();
      const user = readUser();
      if (!token) return { data: { session: null } };
      return { data: { session: { access_token: token, user } } };
    },
    async getUser() {
      const user = readUser();
      return { data: { user } };
    },
    onAuthStateChange(cb: (event: string, session: unknown) => void) {
      listeners.add(cb);
      return { data: { subscription: { unsubscribe: () => { listeners.delete(cb); } } } };
    },
  };

  return {
    from: (table: string) => new TableQuery(table),
    rpc,
    auth,
    isApiMode: true as const,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
