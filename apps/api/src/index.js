import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { query } from './db.js';
import {
  normalizePhone, signToken, hashPassword, verifyPassword,
  authRequired, requireRole, loadUserById, publicUser,
} from './auth.js';
import { TABLES, AUDITED, WRITE_ROLES, assertTable, assertColumn } from './tables.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Auth: owner signup ───────────────────────────────────────
app.post('/auth/signup-owner', async (req, res) => {
  try {
    const { name, phone, businessName, businessType, password } = req.body || {};
    const cleanPhone = normalizePhone(phone || '');
    if (!String(name || '').trim()) return res.status(400).json({ error: 'Your name is required.' });
    if (!cleanPhone || cleanPhone.length < 9) return res.status(400).json({ error: 'Valid phone required.' });
    if (!String(businessName || '').trim()) return res.status(400).json({ error: 'Business name required.' });
    if (!password || String(password).length < 7) return res.status(400).json({ error: 'Password >= 7 chars.' });

    const existing = await query('SELECT id FROM users WHERE phone = $1 LIMIT 1', [cleanPhone]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Phone already registered. Sign in.' });

    const pwHash = await hashPassword(String(password));
    const biz = await query(
      "INSERT INTO businesses (name, business_type) VALUES ($1, $2) RETURNING *",
      [String(businessName).trim(), businessType || null],
    );
    const business = biz.rows[0];
    const userRes = await query(
      `INSERT INTO users (business_id, branch_id, role, name, phone, password_hash)
       VALUES ($1, NULL, 'owner', $2, $3, $4) RETURNING *`,
      [business.id, String(name).trim(), cleanPhone, pwHash],
    );
    const user = userRes.rows[0];
    const br = await query('INSERT INTO branches (business_id, name) VALUES ($1, $2) RETURNING *', [business.id, 'Main Store']);
    const branch = br.rows[0];
    await query('UPDATE users SET branch_id = $1 WHERE id = $2', [branch.id, user.id]);
    await query('UPDATE businesses SET owner_user_id = $1 WHERE id = $2', [user.id, business.id]);

    const full = await loadUserById(user.id);
    const token = signToken(full);
    res.json({ token, user: publicUser(full) });
  } catch (e) {
    console.error('signup-owner failed:', e.message);
    res.status(500).json({ error: 'Signup failed. Try again.' });
  }
});

// ── Auth: login (all roles, phone + password) ────────────────
app.post('/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body || {};
    const cleanPhone = normalizePhone(phone || '');
    if (!cleanPhone || !password) return res.status(400).json({ error: 'Phone and password required.' });
    const r = await query('SELECT * FROM users WHERE phone = $1 LIMIT 1', [cleanPhone]);
    const user = r.rows[0];
    if (!user) return res.status(401).json({ error: 'Wrong phone number or password.' });
    const ok = await verifyPassword(String(password), user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Wrong phone number or password.' });
    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (e) {
    console.error('login failed:', e.message);
    res.status(500).json({ error: 'Login failed.' });
  }
});

// ── Auth: POS login (password if set, else passwordless for legacy staff)
app.post('/auth/pos-login', async (req, res) => {
  try {
    const { phone, password } = req.body || {};
    const cleanPhone = normalizePhone(phone || '');
    if (!cleanPhone) return res.status(400).json({ error: 'Phone required.' });
    const r = await query('SELECT * FROM users WHERE phone = $1 LIMIT 1', [cleanPhone]);
    const user = r.rows[0];
    if (!user) return res.status(404).json({ error: 'No account for this phone. Ask your manager.' });
    if (user.role !== 'staff' && user.role !== 'manager') return res.status(403).json({ error: 'No POS access.' });
    if (user.password_hash) {
      if (!password) return res.status(401).json({ error: 'Password required for this account.', passwordRequired: true });
      const ok = await verifyPassword(String(password), user.password_hash);
      if (!ok) return res.status(401).json({ error: 'Wrong phone number or password.' });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
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
    await query('UPDATE users SET pos_activated = true WHERE id = $1', [user.id]);
    const full = await loadUserById(user.id);
    res.json({ token: signToken(full), user: publicUser(full) });
  } catch (e) {
    console.error('pos-activate failed:', e.message);
    res.status(500).json({ error: 'Activation failed.' });
  }
});

app.get('/auth/me', authRequired, async (req, res) => {
  const user = await loadUserById(req.auth.sub);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(user) });
});

// Manager/owner creates staff (replaces provision_staff_user RPC).
app.post('/auth/staff', authRequired, requireRole('manager', 'owner'), async (req, res) => {
  try {
    const me = await loadUserById(req.auth.sub);
    const { name, phone, password, branch_id, role } = req.body || {};
    const cleanPhone = normalizePhone(phone || '');
    if (!String(name || '').trim()) return res.status(400).json({ error: 'Name required.' });
    if (!cleanPhone) return res.status(400).json({ error: 'Phone required.' });
    const r = await query('INSERT INTO users (business_id, branch_id, role, name, phone, password_hash, pos_activation_token) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [
      me.business_id, branch_id || me.branch_id, role === 'manager' ? 'manager' : 'staff',
      String(name).trim(), cleanPhone,
      password ? await hashPassword(String(password)) : null,
      crypto.randomUUID(),
    ]);
    await writeAudit(me, 'insert', 'users', r.rows[0].id, null, publicUser(r.rows[0]));
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

    let sql = `SELECT * FROM "${table}"`;
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
      for (const r of rows) {
        r.business_id = me.business_id;
        if (r.password_hash && !String(r.password_hash).startsWith('$2')) {
          r.password_hash = await hashPassword(String(r.password_hash));
        }
      }
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

// ── RPC compat (old Supabase function names) ─────────────────
app.post('/rpc/:fn', authRequired, async (req, res) => {
  try {
    const { fn } = req.params;
    const me = await loadUserById(req.auth.sub);
    if (fn === 'auto_confirm_user') return res.json({ data: true });
    if (fn === 'signup_create_owner') {
      return res.json({ data: { business_id: me.business_id, user_id: me.id } });
    }
    if (fn === 'provision_staff_user') {
      const { p_name, p_phone, p_branch_id, p_role } = req.body || {};
      const cleanPhone = normalizePhone(p_phone || '');
      const r = await query(
        'INSERT INTO users (business_id, branch_id, role, name, phone, pos_activation_token) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [me.business_id, p_branch_id || me.branch_id, p_role === 'manager' ? 'manager' : 'staff', p_name || 'Staff', cleanPhone || null, crypto.randomUUID()],
      );
      await writeAudit(me, 'insert', 'users', r.rows[0].id, null, publicUser(r.rows[0]));
      return res.json({ data: publicUser(r.rows[0]) });
    }
    return res.status(400).json({ error: 'Unknown RPC: ' + fn });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`[api] listening on :${PORT}`));
