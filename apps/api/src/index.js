import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { query } from './db.js';
import {
  normalizePhone, validatePassword, signAccessToken, signPlatformToken,
  hashPassword, verifyPassword, issueRefreshToken, rotateRefreshToken,
  revokeRefreshToken, revokeAllSessions, listSessions, isLocked,
  recordFailedLogin, clearFailedLogin, createPasswordReset,
  consumePasswordReset, generateTempPassword, recordAuthAudit,
  authRequired, requireRole, loadUserById, publicUser,
} from './auth.js';
import { TABLES, AUDITED, WRITE_ROLES, assertTable, assertColumn } from './tables.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Login rate limiter (in-memory, per IP) ────────────────────
// Single Render instance — a Map is enough. 10 attempts / 15 min / IP;
// successful logins do not count toward the budget.
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 10;
const loginAttempts = new Map(); // ip -> number[] timestamps

function rateLimit(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const tries = (loginAttempts.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (tries.length >= RATE_MAX) {
    const waitMs = RATE_WINDOW_MS - (now - tries[0]);
    return res.status(429).json({
      error: `Too many attempts. Try again in ${Math.ceil(waitMs / 60000)} minute(s).`,
    });
  }
  tries.push(now);
  loginAttempts.set(ip, tries);
  if (loginAttempts.size > 5000) { // keep the map bounded
    for (const [k, v] of loginAttempts) {
      if (v.every((t) => now - t >= RATE_WINDOW_MS)) loginAttempts.delete(k);
    }
  }
  next();
}

function rateLimitClear(req) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  loginAttempts.delete(ip);
}

// ── Auth: owner signup (issues access + refresh pair) ──────────
app.post('/auth/signup-owner', async (req, res) => {
  try {
    const { name, phone, businessName, businessType, password } = req.body || {};
    const cleanPhone = normalizePhone(phone || '');
    if (!String(name || '').trim()) return res.status(400).json({ error: 'Your name is required.' });
    if (!cleanPhone || cleanPhone.length < 9) return res.status(400).json({ error: 'Valid phone required.' });
    if (!String(businessName || '').trim()) return res.status(400).json({ error: 'Business name required.' });
    const pwErr = validatePassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    const existing = await query('SELECT id FROM users WHERE phone = $1 LIMIT 1', [cleanPhone]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Phone already registered. Sign in.' });

    const pwHash = await hashPassword(String(password));
    const biz = await query(
      "INSERT INTO businesses (name, business_type) VALUES ($1, $2) RETURNING *",
      [String(businessName).trim(), businessType || null],
    );
    const business = biz.rows[0];
    const userRes = await query(
      `INSERT INTO users (business_id, branch_id, role, name, phone, password_hash, password_changed_at)
       VALUES ($1, NULL, 'owner', $2, $3, $4, now()) RETURNING *`,
      [business.id, String(name).trim(), cleanPhone, pwHash],
    );
    const user = userRes.rows[0];
    const br = await query('INSERT INTO branches (business_id, name) VALUES ($1, $2) RETURNING *', [business.id, 'Main Store']);
    const branch = br.rows[0];
    await query('UPDATE users SET branch_id = $1 WHERE id = $2', [branch.id, user.id]);
    await query('UPDATE businesses SET owner_user_id = $1 WHERE id = $2', [user.id, business.id]);

    const full = await loadUserById(user.id);
    const accessToken = signAccessToken(full);
    const { token: refreshToken } = await issueRefreshToken(full.id, req.ip);
    await recordAuthAudit(full.id, cleanPhone, 'signup_owner', true, req.ip);
    res.json({ accessToken, refreshToken, user: publicUser(full) });
  } catch (e) {
    console.error('signup-owner failed:', e.message);
    res.status(500).json({ error: 'Signup failed. Try again.' });
  }
});

// ── Auth: login (all roles, phone + password, lockout) ────────
app.post('/auth/login', rateLimit, async (req, res) => {
  try {
    const { phone, password } = req.body || {};
    const cleanPhone = normalizePhone(phone || '');
    if (!cleanPhone || !password) return res.status(400).json({ error: 'Phone and password required.' });
    const r = await query('SELECT * FROM users WHERE phone = $1 LIMIT 1', [cleanPhone]);
    const user = r.rows[0];
    // Generic message either way: no account enumeration.
    if (!user) return res.status(401).json({ error: 'Wrong phone number or password.' });
    if (isLocked(user)) {
      await recordAuthAudit(user.id, cleanPhone, 'login_locked', false, req.ip);
      return res.status(423).json({ error: 'Account locked after too many attempts. Try again in 15 minutes.' });
    }
    const ok = await verifyPassword(String(password), user.password_hash);
    if (!ok) {
      await recordFailedLogin(user);
      await recordAuthAudit(user.id, cleanPhone, 'login', false, req.ip);
      return res.status(401).json({ error: 'Wrong phone number or password.' });
    }
    rateLimitClear(req);
    await clearFailedLogin(user.id);
    const full = await loadUserById(user.id);
    const accessToken = signAccessToken(full);
    const { token: refreshToken } = await issueRefreshToken(full.id, req.ip);
    await recordAuthAudit(full.id, cleanPhone, 'login', true, req.ip);
    res.json({ accessToken, refreshToken, user: publicUser(full) });
  } catch (e) {
    console.error('login failed:', e.message);
    res.status(500).json({ error: 'Login failed.' });
  }
});

// ── Auth: POS login (phone + password ALWAYS required) ─────────
// No passwordless fallback: every till account has a bcrypt password
// set at provisioning. Staff without a branch are rejected — the till
// is branch-scoped and has no stock to sell otherwise.
app.post('/auth/pos-login', rateLimit, async (req, res) => {
  try {
    const { phone, password } = req.body || {};
    const cleanPhone = normalizePhone(phone || '');
    if (!cleanPhone || !password) {
      return res.status(400).json({ error: 'Phone and password required.', passwordRequired: true });
    }
    const r = await query('SELECT * FROM users WHERE phone = $1 LIMIT 1', [cleanPhone]);
    const user = r.rows[0];
    if (!user) return res.status(401).json({ error: 'Wrong phone number or password.' });
    if (user.role !== 'staff' && user.role !== 'manager') return res.status(403).json({ error: 'No POS access.' });
    if (isLocked(user)) {
      await recordAuthAudit(user.id, cleanPhone, 'pos_login_locked', false, req.ip);
      return res.status(423).json({ error: 'Account locked after too many attempts. Try again in 15 minutes.' });
    }
    const ok = await verifyPassword(String(password), user.password_hash);
    if (!ok) {
      await recordFailedLogin(user);
      await recordAuthAudit(user.id, cleanPhone, 'pos_login', false, req.ip);
      return res.status(401).json({ error: 'Wrong phone number or password.' });
    }
    if (!user.branch_id) return res.status(403).json({ error: 'This account has no branch assigned. Ask your manager.' });
    rateLimitClear(req);
    await clearFailedLogin(user.id);
    const full = await loadUserById(user.id);
    const accessToken = signAccessToken(full);
    const { token: refreshToken } = await issueRefreshToken(full.id, req.ip);
    await recordAuthAudit(full.id, cleanPhone, 'pos_login', true, req.ip);
    res.json({ accessToken, refreshToken, user: publicUser(full) });
  } catch (e) {
    console.error('pos-login failed:', e.message);
    res.status(500).json({ error: 'POS login failed.' });
  }
});

app.post('/auth/pos-activate', async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Activation token required.' });
    const r = await query('SELECT * FROM users WHERE pos_activation_token = $1 LIMIT 1', [String(token)]);
    const user = r.rows[0];
    if (!user) return res.status(404).json({ error: 'Invalid or expired activation link.' });
    // Single-use: burn the token so a leaked link can't be replayed.
    await query('UPDATE users SET pos_activated = true, pos_activation_token = NULL WHERE id = $1', [user.id]);
    const full = await loadUserById(user.id);
    const accessToken = signAccessToken(full);
    const { token: refreshToken } = await issueRefreshToken(full.id, req.ip);
    await recordAuthAudit(full.id, full.phone, 'pos_activate', true, req.ip);
    res.json({ accessToken, refreshToken, user: publicUser(full) });
  } catch (e) {
    console.error('pos-activate failed:', e.message);
    res.status(500).json({ error: 'Activation failed.' });
  }
});

// ── Auth: refresh / logout ─────────────────────────────────────
app.post('/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required.' });
    const { user, token } = await rotateRefreshToken(String(refreshToken), req.ip);
    res.json({ accessToken: signAccessToken(user), refreshToken: token, user: publicUser(user) });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Refresh failed.' });
  }
});

app.post('/auth/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (refreshToken) await revokeRefreshToken(String(refreshToken));
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
});

app.post('/auth/logout-all', authRequired, async (req, res) => {
  await revokeAllSessions(req.auth.sub);
  await recordAuthAudit(req.auth.sub, null, 'logout_all', true, req.ip);
  res.json({ ok: true });
});

app.get('/auth/sessions', authRequired, async (req, res) => {
  res.json({ data: await listSessions(req.auth.sub) });
});

// ── Auth: password change + reset ──────────────────────────────
app.post('/auth/change-password', authRequired, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    const me = await loadUserById(req.auth.sub);
    if (!me) return res.status(404).json({ error: 'User not found' });
    const ok = await verifyPassword(String(currentPassword || ''), me.password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password is wrong.' });
    const pwErr = validatePassword(newPassword);
    if (pwErr) return res.status(400).json({ error: pwErr });
    await query('UPDATE users SET password_hash = $2, password_changed_at = now(), failed_attempts = 0, locked_until = NULL WHERE id = $1', [
      me.id, await hashPassword(String(newPassword)),
    ]);
    // Revoke everything, then issue a fresh pair for this device.
    await revokeAllSessions(me.id);
    const full = await loadUserById(me.id);
    const accessToken = signAccessToken(full);
    const { token: refreshToken } = await issueRefreshToken(full.id, req.ip);
    await recordAuthAudit(me.id, me.phone, 'change_password', true, req.ip);
    res.json({ accessToken, refreshToken, user: publicUser(full) });
  } catch (e) {
    res.status(500).json({ error: 'Password change failed.' });
  }
});

// Self-service reset: request always answers ok (no enumeration).
// NOTE: there is no SMS gateway yet — the token is stored hashed and
// delivery is out-of-band. Owners locked out with no manager above them
// need DB access (psql) or a fresh admin reset from another owner.
app.post('/auth/password-reset/request', rateLimit, async (req, res) => {
  try {
    const { phone } = req.body || {};
    const cleanPhone = normalizePhone(phone || '');
    const r = await query('SELECT * FROM users WHERE phone = $1 LIMIT 1', [cleanPhone]);
    if (r.rows[0]) {
      await createPasswordReset(r.rows[0].id);
      await recordAuthAudit(r.rows[0].id, cleanPhone, 'reset_request', true, req.ip);
    }
    rateLimitClear(req);
    res.json({ ok: true, message: 'If an account exists for this number, a reset was created.' });
  } catch {
    res.json({ ok: true });
  }
});

app.post('/auth/password-reset/confirm', rateLimit, async (req, res) => {
  try {
    const { phone, token, newPassword } = req.body || {};
    const full = await consumePasswordReset(phone, token, newPassword);
    await recordAuthAudit(full.id, full.phone, 'reset_confirm', true, req.ip);
    rateLimitClear(req);
    const accessToken = signAccessToken(full);
    const { token: refreshToken } = await issueRefreshToken(full.id, req.ip);
    res.json({ accessToken, refreshToken, user: publicUser(full) });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Reset failed.' });
  }
});

// Manager/owner resetting staff/manager passwords: server generates a
// compliant temp password, sets it, revokes sessions, returns it ONCE
// for forwarding over WhatsApp. The clear value is never logged.
app.post('/auth/admin-reset', authRequired, requireRole('manager', 'owner'), async (req, res) => {
  try {
    const me = await loadUserById(req.auth.sub);
    const { userId } = req.body || {};
    const r = await query('SELECT * FROM users WHERE id = $1 LIMIT 1', [String(userId || '')]);
    const target = r.rows[0];
    if (!target || target.business_id !== me.business_id) {
      return res.status(404).json({ error: 'User not found.' });
    }
    if (target.role === 'owner' && me.role !== 'owner') {
      return res.status(403).json({ error: 'Only an owner can reset another owner.' });
    }
    const temp = generateTempPassword();
    await query('UPDATE users SET password_hash = $2, password_changed_at = now(), failed_attempts = 0, locked_until = NULL WHERE id = $1', [
      target.id, await hashPassword(temp),
    ]);
    await revokeAllSessions(target.id);
    await writeAudit(me, 'update', 'users', target.id, { password: '***' }, { password: '***reset***' });
    await recordAuthAudit(me.id, me.phone, 'admin_reset:' + target.id, true, req.ip);
    res.json({ tempPassword: temp, user: publicUser(await loadUserById(target.id)) });
  } catch (e) {
    res.status(500).json({ error: 'Reset failed.' });
  }
});

app.get('/auth/me', authRequired, async (req, res) => {
  const user = await loadUserById(req.auth.sub);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(user) });
});

// Manager/owner provisions staff/manager (password REQUIRED + POS token).
// The till no longer has a passwordless path: every account leaves here
// with a bcrypt password and a single-use activation token. The clear
// password is supplied by the caller (dashboard generates it) and is
// returned NEVER — the caller already holds it for WhatsApp forwarding.
app.post('/auth/staff', authRequired, requireRole('manager', 'owner'), async (req, res) => {
  try {
    const me = await loadUserById(req.auth.sub);
    const { name, phone, password, branch_id, role } = req.body || {};
    const cleanPhone = normalizePhone(phone || '');
    if (!String(name || '').trim()) return res.status(400).json({ error: 'Name required.' });
    if (!cleanPhone || cleanPhone.length < 9) return res.status(400).json({ error: 'Valid phone required.' });
    const pwErr = validatePassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });
    if (!branch_id && !me.branch_id) return res.status(400).json({ error: 'Branch required.' });
    const existing = await query('SELECT id FROM users WHERE phone = $1 LIMIT 1', [cleanPhone]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'This phone number already has an account.' });
    const r = await query('INSERT INTO users (business_id, branch_id, role, name, phone, password_hash, password_changed_at, pos_activation_token) VALUES ($1,$2,$3,$4,$5,$6,now(),$7) RETURNING *', [
      me.business_id, branch_id || me.branch_id, role === 'manager' ? 'manager' : 'staff',
      String(name).trim(), cleanPhone,
      await hashPassword(String(password)),
      crypto.randomUUID(),
    ]);
    await writeAudit(me, 'insert', 'users', r.rows[0].id, null, publicUser(r.rows[0]));
    await recordAuthAudit(me.id, me.phone, 'provision:' + r.rows[0].id, true, req.ip);
    res.json({ user: publicUser(r.rows[0]) });
  } catch (e) {
    console.error('create staff failed:', e.message);
    res.status(500).json({ error: 'Could not create staff.' });
  }
});

// ── Helpers: scoping + audit ─────────────────────────────────
async function writeAudit(actor, action, entity, entityId, before, after) {
  try {
    let businessId = actor.business_id;
    if (!businessId && after && after.business_id) businessId = after.business_id;
    if (!businessId && before && before.business_id) businessId = before.business_id;
    if (!businessId) {
      if (entity === 'branches' && (after?.business_id || before?.business_id)) businessId = (after || before).business_id;
      else if ((entity === 'sales' || entity === 'inventory_allocations' || entity === 'invoices') && (after?.branch_id || before?.branch_id)) {
        const br = await query('SELECT business_id FROM branches WHERE id = $1', [(after || before).branch_id]);
        businessId = br.rows[0]?.business_id || null;
      } else if ((after?.product_id || before?.product_id)) {
        const pr = await query('SELECT business_id FROM products WHERE id = $1', [(after || before).product_id]);
        businessId = pr.rows[0]?.business_id || null;
      } else if ((after?.supplier_id || before?.supplier_id)) {
        const sp = await query('SELECT business_id FROM suppliers WHERE id = $1', [(after || before).supplier_id]);
        businessId = sp.rows[0]?.business_id || null;
      }
    }
    if (!businessId) return;
    await query(
      `INSERT INTO audit_events (business_id, actor_user_id, action_type, entity_type, entity_id, before_state, after_state)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [businessId, actor.id, action, entity, entityId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null],
    );
  } catch (e) {
    console.warn('audit write failed:', e.message);
  }
}

function scopeClause(table, user, params, idx) {
  // Returns { sql, nextIdx } appending business/branch scoping.
  // Staff see only their branch for branch-scoped tables.
  if (table === 'businesses') {
    params.push(user.business_id);
    return { sql: `businesses.id = $${idx}`, nextIdx: idx + 1 };
  }
  if (table === 'branches' || table === 'products' || table === 'suppliers' ||
      table === 'inventory_intake' || table === 'supplier_payments' ||
      table === 'supplier_reconciliations' || table === 'audit_events' ||
      table === 'query_log' || table === 'expenses' || table === 'debtors' ||
      table === 'creditors' || table === 'flagged_backdated_events') {
    params.push(user.business_id);
    const col = table === 'audit_events' || table === 'query_log' || table === 'flagged_backdated_events' ? 'business_id' : 'business_id';
    return { sql: `"${table}"."${col}" = $${idx}`, nextIdx: idx + 1 };
  }
  if (table === 'users') {
    params.push(user.business_id);
    return { sql: `users.business_id = $${idx}`, nextIdx: idx + 1 };
  }
  if (table === 'sales' || table === 'inventory_allocations' || table === 'invoices') {
    if (user.role === 'staff' && user.branch_id) {
      params.push(user.branch_id);
      return { sql: `"${table}".branch_id = $${idx}`, nextIdx: idx + 1 };
    }
    // manager/owner: restrict to branches in their business via subquery
    params.push(user.business_id);
    return { sql: `"${table}".branch_id IN (SELECT id FROM branches WHERE business_id = $${idx})`, nextIdx: idx + 1 };
  }
  // Join-scoped tables inherit scope from parents (checked on write).
  return { sql: '1=1', nextIdx: idx };
}

// ── Generic read ─────────────────────────────────────────────
app.get('/api/:table', authRequired, async (req, res) => {
  try {
    const { table } = req.params;
    assertTable(table);
    if (table === 'audit_events' && req.auth.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
    // User directory holds credentials metadata: only managers/owners may
    // list it (staff use /auth/me for their own profile). password_hash is
    // NEVER selected — the API is the only reader of that column.
    if (table === 'users' && req.auth.role !== 'manager' && req.auth.role !== 'owner') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const me = await loadUserById(req.auth.sub);
    if (!me) return res.status(401).json({ error: 'User gone' });

    const params = [];
    const wheres = [];
    let i = 1;
    const scoped = scopeClause(table, me, params, i);
    i = scoped.nextIdx;
    if (scoped.sql !== '1=1') wheres.push(scoped.sql);

    for (const [k, v] of Object.entries(req.query)) {
      if (k.startsWith('eq.')) {
        const col = k.slice(3);
        assertColumn(col);
        params.push(String(v));
        wheres.push(`"${table}"."${col}" = $${i++}`);
      } else if (k.startsWith('gte.')) {
        const col = k.slice(4);
        assertColumn(col);
        params.push(String(v));
        wheres.push(`"${table}"."${col}" >= $${i++}`);
      } else if (k.startsWith('lte.')) {
        const col = k.slice(4);
        assertColumn(col);
        params.push(String(v));
        wheres.push(`"${table}"."${col}" <= $${i++}`);
      }
    }

    // password_hash never leaves the server, even to managers.
    const selectList = table === 'users'
      ? 'id, business_id, branch_id, role, name, phone, pos_activated, pos_activation_token, failed_attempts, locked_until, password_changed_at, last_login_at, created_at'
      : '*';
    let sql = `SELECT ${selectList} FROM "${table}"`;
    if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ');

    const order = String(req.query.order || '');
    if (order) {
      const [col, dir] = order.split('.');
      assertColumn(col);
      sql += ` ORDER BY "${col}" ${dir === 'asc' ? 'ASC' : 'DESC'}`;
    } else if (table === 'audit_events' || table === 'query_log') {
      sql += ` ORDER BY "${table === 'audit_events' ? 'occurred_at' : 'created_at'}" DESC`;
    }
    const limit = Math.min(parseInt(String(req.query.limit || '500'), 10) || 500, 2000);
    sql += ` LIMIT ${limit}`;

    const r = await query(sql, params);
    res.json({ data: r.rows });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Read failed' });
  }
});

// ── Generic insert ───────────────────────────────────────────
app.post('/api/:table', authRequired, async (req, res) => {
  try {
    const { table } = req.params;
    assertTable(table);
    if (table === 'audit_events') return res.status(403).json({ error: 'Audit is server-written' });
    const roles = WRITE_ROLES[table] || [];
    if (!roles.includes(req.auth.role)) return res.status(403).json({ error: 'Forbidden' });
    const me = await loadUserById(req.auth.sub);
    const rows = Array.isArray(req.body) ? req.body : [req.body];
    if (rows.length === 0) return res.json({ data: [] });
    if (rows.length > 200) return res.status(400).json({ error: 'Max 200 rows per request' });

    // Image guard: products.image <= ~700k chars (~500KB binary).
    if (table === 'products') {
      for (const r of rows) {
        if (r.image && String(r.image).length > 700000) {
          return res.status(400).json({ error: 'Product image too large (max ~500KB). Use a smaller photo.' });
        }
        if (me.role !== 'owner' && me.role !== 'manager') return res.status(403).json({ error: 'Forbidden' });
        r.business_id = r.business_id || me.business_id;
        if (r.business_id !== me.business_id) return res.status(403).json({ error: 'Cross-business write blocked' });
      }
    }
    if (['branches', 'suppliers', 'inventory_intake', 'supplier_payments', 'supplier_reconciliations', 'expenses', 'debtors', 'creditors'].includes(table)) {
      for (const r of rows) {
        r.business_id = r.business_id || me.business_id;
        if (r.business_id !== me.business_id) return res.status(403).json({ error: 'Cross-business write blocked' });
      }
    }
    if (table === 'sales' || table === 'inventory_allocations' || table === 'invoices') {
      for (const r of rows) {
        if (me.role === 'staff' && me.branch_id && r.branch_id && r.branch_id !== me.branch_id) {
          return res.status(403).json({ error: 'Staff can only write their branch' });
        }
      }
    }
    if (table === 'users') {
      // No direct inserts: provisioning (password policy, activation token,
      // audit) lives in POST /auth/staff. The generic gateway would bypass it.
      return res.status(403).json({ error: 'Use POST /auth/staff to create users.' });
    }

    const out = [];
    for (const row of rows) {
      const cols = Object.keys(row).filter((k) => row[k] !== undefined);
      if (cols.length === 0) continue;
      const vals = cols.map((c) => row[c] === undefined ? null : (typeof row[c] === 'object' && row[c] !== null ? JSON.stringify(row[c]) : row[c]));
      const placeholders = cols.map((_, n) => `$${n + 1}`).join(', ');
      const q = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders}) RETURNING *`;
      try {
        const r = await query(q, vals);
        out.push(r.rows[0]);
        if (AUDITED.has(table)) await writeAudit(me, 'insert', table, r.rows[0].id, null, r.rows[0]);
      } catch (e) {
        if (e.code === '23505') {
          // Unique violation (e.g. POS retrying a queued sale) — fetch existing.
          if (row.id) {
            const ex = await query(`SELECT * FROM "${table}" WHERE id = $1`, [row.id]);
            if (ex.rows[0]) { out.push(ex.rows[0]); continue; }
          }
        }
        throw e;
      }
    }
    res.json({ data: out });
  } catch (e) {
    console.error('insert failed:', e.message);
    res.status(500).json({ error: e.message || 'Insert failed' });
  }
});

// ── Generic update (filters via eq.* query params) ───────────
app.patch('/api/:table', authRequired, async (req, res) => {
  try {
    const { table } = req.params;
    assertTable(table);
    if (table === 'audit_events') return res.status(403).json({ error: 'Audit is append-only' });
    const roles = WRITE_ROLES[table] || [];
    if (!roles.includes(req.auth.role)) return res.status(403).json({ error: 'Forbidden' });
    const me = await loadUserById(req.auth.sub);
    const patch = req.body || {};
    delete patch.id;
    if (table === 'users') {
      // Role, business, credentials and tokens change only via dedicated
      // endpoints (/auth/admin-reset, /auth/change-password, provisioning).
      // Generic edits are limited to directory fields.
      const allowed = new Set(['name', 'phone', 'branch_id']);
      for (const k of Object.keys(patch)) {
        if (!allowed.has(k)) return res.status(403).json({ error: 'Field not editable here: ' + k });
      }
      if (patch.phone !== undefined) {
        const cp = normalizePhone(patch.phone || '');
        if (!cp || cp.length < 9) return res.status(400).json({ error: 'Valid phone required.' });
        patch.phone = cp;
        const dupe = await query('SELECT id FROM users WHERE phone = $1 AND id <> $2 LIMIT 1', [cp, req.query['eq.id'] || '']);
        if (dupe.rows.length > 0) return res.status(409).json({ error: 'Phone already in use.' });
      }
    }
    const cols = Object.keys(patch);
    if (cols.length === 0) return res.status(400).json({ error: 'Empty patch' });
    if (table === 'products' && patch.image && String(patch.image).length > 700000) {
      return res.status(400).json({ error: 'Product image too large (max ~500KB).' });
    }

    const params = [];
    const wheres = [];
    let i = 1;
    const scoped = scopeClause(table, me, params, i);
    i = scoped.nextIdx;
    if (scoped.sql !== '1=1') wheres.push(scoped.sql);
    let hasEq = false;
    for (const [k, v] of Object.entries(req.query)) {
      if (k.startsWith('eq.')) {
        const col = k.slice(3);
        assertColumn(col);
        params.push(String(v));
        wheres.push(`"${table}"."${col}" = $${i++}`);
        hasEq = true;
      }
    }
    if (!hasEq) return res.status(400).json({ error: 'Update requires eq.* filter' });

    const before = await query(`SELECT * FROM "${table}" WHERE ${wheres.join(' AND ')}`, params);
    const setSql = cols.map((c, n) => `"${c}" = $${params.length + n + 1}`).join(', ');
    const vals = cols.map((c) => (typeof patch[c] === 'object' && patch[c] !== null ? JSON.stringify(patch[c]) : patch[c]));
    const r = await query(`UPDATE "${table}" SET ${setSql} WHERE ${wheres.join(' AND ')} RETURNING *`, [...params, ...vals]);
    if (AUDITED.has(table)) {
      for (const row of r.rows) {
        const b = before.rows.find((x) => x.id === row.id) || null;
        await writeAudit(me, 'update', table, row.id, b, row);
      }
    }
    res.json({ data: r.rows });
  } catch (e) {
    console.error('update failed:', e.message);
    res.status(500).json({ error: e.message || 'Update failed' });
  }
});

// ── Generic delete ───────────────────────────────────────────
app.delete('/api/:table', authRequired, async (req, res) => {
  try {
    const { table } = req.params;
    assertTable(table);
    const roles = WRITE_ROLES[table] || [];
    if (!roles.includes(req.auth.role)) return res.status(403).json({ error: 'Forbidden' });
    if (['sales', 'inventory_intake', 'inventory_allocations', 'audit_events'].includes(table)) {
      return res.status(403).json({ error: table + ' is append-only and cannot be deleted' });
    }
    const me = await loadUserById(req.auth.sub);
    const params = [];
    const wheres = [];
    let i = 1;
    const scoped = scopeClause(table, me, params, i);
    i = scoped.nextIdx;
    if (scoped.sql !== '1=1') wheres.push(scoped.sql);
    let hasEq = false;
    for (const [k, v] of Object.entries(req.query)) {
      if (k.startsWith('eq.')) {
        const col = k.slice(3);
        assertColumn(col);
        params.push(String(v));
        wheres.push(`"${table}"."${col}" = $${i++}`);
        hasEq = true;
      }
    }
    if (!hasEq) return res.status(400).json({ error: 'Delete requires eq.* filter' });
    if (table === 'users' && String(req.query['eq.id'] || '') === me.id) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }
    const before = await query(`SELECT * FROM "${table}" WHERE ${wheres.join(' AND ')}`, params);
    const r = await query(`DELETE FROM "${table}" WHERE ${wheres.join(' AND ')} RETURNING *`, params);
    for (const row of r.rows) {
      const b = before.rows.find((x) => x.id === row.id) || null;
      await writeAudit(me, 'delete', table, row.id, b, null);
    }
    res.json({ data: r.rows });
  } catch (e) {
    console.error('delete failed:', e.message);
    res.status(500).json({ error: e.message || 'Delete failed' });
  }
});

// ── Upsert (invoices/debtors/queued retries) ─────────────────
app.post('/api/:table/upsert', authRequired, async (req, res) => {
  try {
    const { table } = req.params;
    assertTable(table);
    const roles = WRITE_ROLES[table] || [];
    if (!roles.includes(req.auth.role)) return res.status(403).json({ error: 'Forbidden' });
    const me = await loadUserById(req.auth.sub);
    const row = req.body || {};
    if (!row.id) return res.status(400).json({ error: 'Upsert requires id' });
    const cols = Object.keys(row);
    const vals = cols.map((c) => (typeof row[c] === 'object' && row[c] !== null ? JSON.stringify(row[c]) : row[c]));
    const placeholders = cols.map((_, n) => `$${n + 1}`).join(', ');
    const updates = cols.filter((c) => c !== 'id').map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
    const r = await query(
      `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})
       ON CONFLICT (id) DO UPDATE SET ${updates} RETURNING *`,
      vals,
    );
    if (AUDITED.has(table)) await writeAudit(me, 'upsert', table, r.rows[0].id, null, r.rows[0]);
    res.json({ data: [r.rows[0]] });
  } catch (e) {
    console.error('upsert failed:', e.message);
    res.status(500).json({ error: e.message || 'Upsert failed' });
  }
});

// ── Platform: Market analytics (cross-business, admin-gated) ──
// The Market dashboard (apps/market) shows platform-wide aggregates.
// Normal /api/* reads are business-scoped, so these dedicated endpoints
// authenticate with the MARKET_ADMIN_PASS and issue a short-lived
// platform token instead of a user session.
const MARKET_ADMIN_PASS = process.env.MARKET_ADMIN_PASS || null;

app.post('/platform/login', rateLimit, async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!MARKET_ADMIN_PASS) {
      console.error('[api] MARKET_ADMIN_PASS is not set — market dashboard disabled.');
      return res.status(503).json({ error: 'Market analytics is not configured.' });
    }
    if (!password || String(password) !== MARKET_ADMIN_PASS) {
      return res.status(401).json({ error: 'Invalid password. Access denied.' });
    }
    rateLimitClear(req);
    res.json({ token: signPlatformToken() });
  } catch (e) {
    console.error('platform login failed:', e.message);
    res.status(500).json({ error: 'Login failed.' });
  }
});

// One call returns the five tables the Market dashboard aggregates
// client-side (same shape as its old bulk fetch): businesses, branches,
// products, sales, users. Password hashes are stripped from users.
app.get('/platform/export', authRequired, requireRole('platform'), async (_req, res) => {
  try {
    const [biz, br, prod, sales, users] = await Promise.all([
      query('SELECT id, name, business_type, owner_user_id, created_at FROM businesses ORDER BY created_at DESC LIMIT 20000'),
      query('SELECT id, business_id, name, created_at FROM branches ORDER BY created_at DESC LIMIT 20000'),
      query(`SELECT id, business_id, name, bulk_unit_name, retail_unit_name,
             units_per_bulk, bulk_cost_price, bulk_sell_price, retail_sell_price, created_at
             FROM products ORDER BY created_at DESC LIMIT 20000`),
      query(`SELECT id, branch_id, product_id, sold_by, unit_type, quantity, unit_price,
             total_price, sold_at, client_reported_at
             FROM sales ORDER BY sold_at DESC LIMIT 50000`),
      query('SELECT id, business_id, branch_id, role, name, phone, created_at FROM users ORDER BY created_at DESC LIMIT 20000'),
    ]);
    res.json({
      data: {
        businesses: biz.rows,
        branches: br.rows,
        products: prod.rows,
        sales: sales.rows,
        users: users.rows,
      },
    });
  } catch (e) {
    console.error('platform export failed:', e.message);
    res.status(500).json({ error: 'Export failed.' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`[api] listening on :${PORT}`));
