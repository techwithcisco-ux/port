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

// ── Waitlist / shop-link ordering ──────────────────────────────
// A rep (staff/manager/owner) creates an invite for a customer phone
// number. The customer opens the PUBLIC shop link (?token), sees live
// branch availability at retail prices only, picks quantities, submits.
// Prices/totals are recomputed from the DB — client numbers are ignored.
// The customer then forwards the order to the retailer over WhatsApp
// (contact number included in the public payload).

// Lighter limiter for the public shop (browsing customers, not logins).
const PUB_WINDOW_MS = 15 * 60 * 1000;
const PUB_MAX = 60;
const pubAttempts = new Map();
function publicLimit(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const tries = (pubAttempts.get(ip) || []).filter((t) => now - t < PUB_WINDOW_MS);
  if (tries.length >= PUB_MAX) return res.status(429).json({ error: 'Too many requests. Try again shortly.' });
  tries.push(now);
  pubAttempts.set(ip, tries);
  next();
}

// Live branch catalog in retail-equivalent units. Base units == retail
// units for stock counting (see packages/shared variants.ts).
async function branchCatalog(branchId) {
  const prod = await query(
    `SELECT p.id, p.name, p.retail_unit_name, p.retail_sell_price
     FROM products p JOIN branches b ON b.business_id = p.business_id
     WHERE b.id = $1 ORDER BY p.name`,
    [branchId],
  );
  const alloc = await query(
    `SELECT product_id, SUM(retail_quantity_equivalent)::float AS qty
     FROM inventory_allocations WHERE branch_id = $1 GROUP BY product_id`,
    [branchId],
  );
  const sold = await query(
    `SELECT s.product_id,
       SUM(s.quantity * COALESCE(v.base_units, CASE WHEN s.unit_type = 'bulk' THEN p.units_per_bulk ELSE 1 END))::float AS qty
     FROM sales s JOIN products p ON p.id = s.product_id
     LEFT JOIN product_variants v ON v.id = s.variant_id
     WHERE s.branch_id = $1 GROUP BY s.product_id`,
    [branchId],
  );
  const aMap = new Map(alloc.rows.map((r) => [r.product_id, Number(r.qty) || 0]));
  const sMap = new Map(sold.rows.map((r) => [r.product_id, Number(r.qty) || 0]));
  return prod.rows.map((p) => ({
    product_id: p.id,
    name: p.name,
    unit: p.retail_unit_name,
    unit_price: Number(p.retail_sell_price),
    available: Math.max(0, Math.round(((aMap.get(p.id) || 0) - (sMap.get(p.id) || 0)) * 100) / 100),
  }));
}

async function loadInvite(token) {
  const r = await query(
    `SELECT i.*, b.name AS branch_name, b.business_id AS branch_business,
       biz.name AS business_name, u.name AS creator_name, u.phone AS creator_phone
     FROM waitlist_invites i
     JOIN branches b ON b.id = i.branch_id
     JOIN businesses biz ON biz.id = i.business_id
     JOIN users u ON u.id = i.created_by
     WHERE i.token = $1 LIMIT 1`,
    [String(token || '')],
  );
  const inv = r.rows[0];
  if (!inv) return null;
  if (inv.status === 'pending' && new Date(inv.expires_at).getTime() < Date.now()) {
    await query("UPDATE waitlist_invites SET status = 'expired' WHERE id = $1", [inv.id]);
    inv.status = 'expired';
  }
  return inv;
}

async function resolveBranch(me, branchId) {
  const wanted = branchId || me.branch_id;
  if (me.role === 'staff') {
    if (!me.branch_id) return { error: 'Your account has no branch. Ask your manager.' };
    if (branchId && branchId !== me.branch_id) return { error: 'Staff can only invite for their own branch.' };
    return { branchId: me.branch_id };
  }
  if (!wanted) return { error: 'Branch required.' };
  const b = await query('SELECT id FROM branches WHERE id = $1 AND business_id = $2', [wanted, me.business_id]);
  if (!b.rows[0]) return { error: 'Branch not found.' };
  return { branchId: wanted };
}

// Rep creates an invite for a customer phone number.
app.post('/api/waitlist/invites', authRequired, requireRole('staff', 'manager', 'owner'), async (req, res) => {
  try {
    const me = await loadUserById(req.auth.sub);
    if (!me) return res.status(401).json({ error: 'User gone' });
    const cleanPhone = normalizePhone(req.body?.customer_phone || '');
    if (!cleanPhone || cleanPhone.length < 9) return res.status(400).json({ error: 'Valid customer phone required.' });
    const { branchId, error } = await resolveBranch(me, req.body?.branch_id);
    if (error) return res.status(400).json({ error });
    const token = crypto.randomBytes(32).toString('hex');
    const r = await query(
      `INSERT INTO waitlist_invites (business_id, branch_id, created_by, customer_phone, token)
       VALUES ((SELECT business_id FROM branches WHERE id = $1), $1, $2, $3, $4) RETURNING *`,
      [branchId, me.id, cleanPhone, token],
    );
    await writeAudit(me, 'insert', 'waitlist_invites', r.rows[0].id, null, { ...publicUser(r.rows[0]), token: '***' });
    res.json({ invite: { ...r.rows[0], token } });
  } catch (e) {
    console.error('waitlist invite failed:', e.message);
    res.status(500).json({ error: 'Could not create invite.' });
  }
});

// Rep lists invites for their business (staff: own branch only).
app.get('/api/waitlist/invites', authRequired, requireRole('staff', 'manager', 'owner'), async (req, res) => {
  try {
    const me = await loadUserById(req.auth.sub);
    const params = [me.business_id];
    let extra = '';
    if (me.role === 'staff' && me.branch_id) {
      params.push(me.branch_id);
      extra = ' AND i.branch_id = $2';
    }
    const r = await query(
      `SELECT i.*, b.name AS branch_name,
         (SELECT count(*)::int FROM waitlist_orders o WHERE o.invite_id = i.id) AS order_count
       FROM waitlist_invites i JOIN branches b ON b.id = i.branch_id
       WHERE i.business_id = $1${extra} ORDER BY i.created_at DESC LIMIT 100`,
      params,
    );
    res.json({ data: r.rows });
  } catch (e) {
    res.status(500).json({ error: 'Could not list invites.' });
  }
});

app.post('/api/waitlist/invites/revoke', authRequired, requireRole('staff', 'manager', 'owner'), async (req, res) => {
  try {
    const me = await loadUserById(req.auth.sub);
    const r = await query('SELECT * FROM waitlist_invites WHERE id = $1 AND business_id = $2 LIMIT 1', [String(req.body?.id || ''), me.business_id]);
    const inv = r.rows[0];
    if (!inv) return res.status(404).json({ error: 'Invite not found.' });
    if (me.role === 'staff' && inv.branch_id !== me.branch_id) return res.status(403).json({ error: 'Not your branch.' });
    await query("UPDATE waitlist_invites SET status = 'revoked' WHERE id = $1", [inv.id]);
    await writeAudit(me, 'update', 'waitlist_invites', inv.id, { status: inv.status }, { status: 'revoked' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Could not revoke invite.' });
  }
});

// Rep lists customer orders (staff: own branch only).
app.get('/api/waitlist/orders', authRequired, requireRole('staff', 'manager', 'owner'), async (req, res) => {
  try {
    const me = await loadUserById(req.auth.sub);
    const params = [me.business_id];
    let extra = '';
    if (me.role === 'staff' && me.branch_id) {
      params.push(me.branch_id);
      extra = ' AND o.branch_id = $2';
    }
    const r = await query(
      `SELECT o.*, b.name AS branch_name FROM waitlist_orders o
       JOIN branches b ON b.id = o.branch_id
       WHERE o.business_id = $1${extra} ORDER BY o.created_at DESC LIMIT 100`,
      params,
    );
    res.json({ data: r.rows });
  } catch (e) {
    res.status(500).json({ error: 'Could not list orders.' });
  }
});

app.patch('/api/waitlist/orders', authRequired, requireRole('staff', 'manager', 'owner'), async (req, res) => {
  try {
    const me = await loadUserById(req.auth.sub);
    const { id, status } = req.body || {};
    if (!['confirmed', 'fulfilled', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }
    const r = await query('SELECT * FROM waitlist_orders WHERE id = $1 AND business_id = $2 LIMIT 1', [String(id || ''), me.business_id]);
    const order = r.rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (me.role === 'staff' && order.branch_id !== me.branch_id) return res.status(403).json({ error: 'Not your branch.' });
    const u = await query('UPDATE waitlist_orders SET status = $2 WHERE id = $1 RETURNING *', [order.id, status]);
    await writeAudit(me, 'update', 'waitlist_orders', order.id, { status: order.status }, { status });
    res.json({ data: u.rows[0] });
  } catch (e) {
    res.status(500).json({ error: 'Could not update order.' });
  }
});

// PUBLIC: shop catalog for an invite token (retail prices + availability only).
app.get('/w/:token', publicLimit, async (req, res) => {
  try {
    const inv = await loadInvite(req.params.token);
    if (!inv) return res.status(404).json({ error: 'This shop link is invalid.' });
    if (inv.status === 'revoked') return res.status(410).json({ error: 'This shop link was revoked. Ask the shop for a new one.' });
    if (inv.status === 'expired') return res.status(410).json({ error: 'This shop link expired. Ask the shop for a new one.' });
    res.json({
      business_name: inv.business_name,
      branch_name: inv.branch_name,
      customer_phone: inv.customer_phone,
      expires_at: inv.expires_at,
      contact: { name: inv.creator_name, phone: inv.creator_phone },
      items: await branchCatalog(inv.branch_id),
    });
  } catch (e) {
    console.error('shop catalog failed:', e.message);
    res.status(500).json({ error: 'Could not load shop.' });
  }
});

// PUBLIC: submit a customer order (server recomputes prices + availability).
app.post('/w/:token/order', publicLimit, async (req, res) => {
  try {
    const inv = await loadInvite(req.params.token);
    if (!inv) return res.status(404).json({ error: 'This shop link is invalid.' });
    if (inv.status === 'revoked' || inv.status === 'expired') {
      return res.status(410).json({ error: 'This shop link is no longer active.' });
    }
    const lines = Array.isArray(req.body?.items) ? req.body.items : [];
    if (lines.length === 0 || lines.length > 50) return res.status(400).json({ error: 'Pick at least one item.' });
    const catalog = await branchCatalog(inv.branch_id);
    const byId = new Map(catalog.map((c) => [c.product_id, c]));
    const items = [];
    let total = 0;
    for (const l of lines) {
      const c = byId.get(String(l?.product_id || ''));
      const qty = Number(l?.qty);
      if (!c) return res.status(400).json({ error: 'Unknown item in order.' });
      if (!(qty > 0) || qty > 10000) return res.status(400).json({ error: `Bad quantity for ${c.name}.` });
      if (qty - c.available > 1e-9) {
        return res.status(409).json({ error: `Only ${c.available} ${c.unit} of ${c.name} left. Adjust and resend.` });
      }
      const lineTotal = Math.round(qty * c.unit_price * 100) / 100;
      total += lineTotal;
      items.push({ product_id: c.product_id, name: c.name, unit: c.unit, qty, unit_price: c.unit_price, line_total: lineTotal });
    }
    total = Math.round(total * 100) / 100;
    const customerName = String(req.body?.customer_name || '').trim().slice(0, 80) || null;
    const r = await query(
      `INSERT INTO waitlist_orders (invite_id, business_id, branch_id, customer_phone, customer_name, items, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [inv.id, inv.business_id, inv.branch_id, inv.customer_phone, customerName, JSON.stringify(items), total],
    );
    if (inv.status === 'pending') {
      await query("UPDATE waitlist_invites SET status = 'ordered' WHERE id = $1", [inv.id]);
    }
    const order = r.rows[0];
    res.json({
      order: { ...order, ref: String(order.id).slice(0, 8).toUpperCase() },
      contact: { name: inv.creator_name, phone: inv.creator_phone },
    });
  } catch (e) {
    console.error('shop order failed:', e.message);
    res.status(500).json({ error: 'Could not place order.' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`[api] listening on :${PORT}`));
