import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { query } from './db.js';

// Fail closed: without a real secret anyone could forge JWTs. Render's
// render.yaml generates JWT_SECRET; locally copy .env.example to .env.
if (!process.env.JWT_SECRET) {
  console.error('[api] FATAL: JWT_SECRET is not set. Refusing to start.');
  console.error('[api]        Copy apps/api/.env.example to .env (local) or set');
  console.error('[api]        JWT_SECRET in the Render dashboard (it is generated');
  console.error('[api]        automatically from render.yaml).');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TTL = process.env.JWT_ACCESS_TTL || '15m';
const REFRESH_DAYS = parseInt(process.env.JWT_REFRESH_DAYS || '30', 10) || 30;
const BCRYPT_ROUNDS = 12;

// Account lockout: 5 bad passwords -> 15 min lock. Stored on the user row
// so it survives restarts and works across Render instances.
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export function normalizePhone(v = '') {
  return String(v).replace(/\s+/g, '').replace(/[^+\d]/g, '');
}

// Password policy: >= 8 chars with a letter and a number. Strict enough to
// stop "1234567" without punishing market staff with symbol requirements.
export function validatePassword(pw) {
  const s = String(pw || '');
  if (s.length < 8) return 'Password must be at least 8 characters.';
  if (s.length > 128) return 'Password is too long (max 128).';
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) {
    return 'Password must contain a letter and a number.';
  }
  return null;
}

export async function hashPassword(pw) {
  return bcrypt.hash(pw, BCRYPT_ROUNDS);
}

export async function verifyPassword(pw, hash) {
  if (!hash) return false;
  return bcrypt.compare(pw, hash);
}

// ── Access tokens (short-lived, stateless) ──────────────────────
// Only type:'access' tokens pass authRequired. Refresh and platform
// tokens are rejected there by design.
export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      business_id: user.business_id,
      role: user.role,
      branch_id: user.branch_id,
      type: 'access',
    },
    JWT_SECRET,
    {
      expiresIn: ACCESS_TTL,
      issuer: 'branchport-api',
      audience: 'branchport-client',
      jwtid: crypto.randomUUID(),
    },
  );
}

/** Short-lived token for the Market analytics dashboard (cross-business reads). */
export function signPlatformToken() {
  return jwt.sign(
    { sub: 'market', role: 'platform', type: 'platform' },
    JWT_SECRET,
    { expiresIn: '12h', issuer: 'branchport-api' },
  );
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// ── Refresh tokens (opaque, hashed, rotating) ───────────────────
// The raw token only ever exists in the login response and the caller's
// storage. The DB holds sha256(token): a DB leak yields no live session.
// Rotation: every use burns the old token and issues a new one. Reuse of
// a burned token means theft -> all sessions for that user are revoked.
export async function issueRefreshToken(userId, ip = null) {
  const raw = crypto.randomBytes(48).toString('hex');
  const expires = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);
  const r = await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip)
     VALUES ($1, $2, $3, $4) RETURNING id, expires_at`,
    [userId, sha256(raw), expires.toISOString(), ip],
  );
  return { token: raw, id: r.rows[0].id, expiresAt: r.rows[0].expires_at };
}

export async function rotateRefreshToken(raw, ip = null) {
  const r = await query('SELECT * FROM refresh_tokens WHERE token_hash = $1 LIMIT 1', [sha256(String(raw || ''))]);
  const rec = r.rows[0];
  if (!rec) {
    const e = new Error('Invalid session. Sign in again.');
    e.status = 401;
    throw e;
  }
  if (rec.revoked_at) {
    // Reuse of a rotated token: possible theft. Burn everything.
    await query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [rec.user_id]);
    await recordAuthAudit(rec.user_id, null, 'refresh_reuse', false, ip);
    const e = new Error('Session reused. All sessions revoked — sign in again.');
    e.status = 401;
    throw e;
  }
  if (new Date(rec.expires_at).getTime() < Date.now()) {
    await query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [rec.id]);
    const e = new Error('Session expired. Sign in again.');
    e.status = 401;
    throw e;
  }
  const user = await loadUserById(rec.user_id);
  if (!user) {
    const e = new Error('User gone.');
    e.status = 401;
    throw e;
  }
  if (isLocked(user)) {
    const e = new Error('Account locked. Try again later.');
    e.status = 423;
    throw e;
  }
  const next = await issueRefreshToken(user.id, ip);
  await query('UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1', [rec.id, next.id]);
  await recordAuthAudit(user.id, user.phone, 'refresh', true, ip);
  return { user, token: next.token };
}

export async function revokeRefreshToken(raw) {
  if (!raw) return;
  await query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1', [sha256(String(raw))]);
}

export async function revokeAllSessions(userId) {
  await query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}

export async function listSessions(userId) {
  const r = await query(
    `SELECT id, created_at, expires_at, revoked_at, ip FROM refresh_tokens
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId],
  );
  return r.rows;
}

// ── Lockout ─────────────────────────────────────────────────────
export function isLocked(user) {
  return !!(user?.locked_until && new Date(user.locked_until).getTime() > Date.now());
}

export async function recordFailedLogin(user) {
  const fails = (user.failed_attempts || 0) + 1;
  if (fails >= MAX_FAILED) {
    await query('UPDATE users SET failed_attempts = $2, locked_until = $3 WHERE id = $1', [
      user.id, 0, new Date(Date.now() + LOCK_MS).toISOString(),
    ]);
  } else {
    await query('UPDATE users SET failed_attempts = $2 WHERE id = $1', [user.id, fails]);
  }
  return fails;
}

export async function clearFailedLogin(userId) {
  await query('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [userId]);
}

// ── Password reset (single-use hashed tokens) ───────────────────
export async function createPasswordReset(userId) {
  const raw = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + RESET_TTL_MS);
  await query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL', [userId]);
  await query(
    'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, sha256(raw), expires.toISOString()],
  );
  return { token: raw, expiresAt: expires };
}

export async function consumePasswordReset(phone, token, newPassword) {
  const err = validatePassword(newPassword);
  if (err) {
    const e = new Error(err);
    e.status = 400;
    throw e;
  }
  const u = await query('SELECT * FROM users WHERE phone = $1 LIMIT 1', [normalizePhone(phone || '')]);
  const user = u.rows[0];
  if (!user) {
    const e = new Error('Invalid reset link.');
    e.status = 400;
    throw e;
  }
  const r = await query(
    'SELECT * FROM password_reset_tokens WHERE user_id = $1 AND token_hash = $2 LIMIT 1',
    [user.id, sha256(String(token || ''))],
  );
  const rec = r.rows[0];
  if (!rec || rec.used_at || new Date(rec.expires_at).getTime() < Date.now()) {
    const e = new Error('Invalid or expired reset link.');
    e.status = 400;
    throw e;
  }
  await query('UPDATE users SET password_hash = $2, password_changed_at = now(), failed_attempts = 0, locked_until = NULL WHERE id = $1', [
    user.id, await hashPassword(String(newPassword)),
  ]);
  await query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [rec.id]);
  await revokeAllSessions(user.id);
  return loadUserById(user.id);
}

// Manager/owner resetting staff: server generates a compliant temp
// password, sets it, revokes sessions, returns it ONCE for forwarding
// over WhatsApp. Never logged, never stored in clear.
export function generateTempPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;
  const pick = (s) => s[crypto.randomInt(s.length)];
  let pw = pick(letters) + pick(digits);
  for (let i = 0; i < 10; i++) pw += pick(all);
  return pw.split('').sort(() => crypto.randomInt(3) - 1).join('');
}

export async function recordAuthAudit(userId, phone, action, success, ip) {
  try {
    await query('INSERT INTO auth_audit (user_id, phone, action, success, ip) VALUES ($1,$2,$3,$4,$5)', [
      userId || null, phone || null, action, !!success, ip || null,
    ]);
  } catch { /* audit must never break auth */ }
}

export function authRequired(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      issuer: 'branchport-api',
      audience: 'branchport-client',
    });
    if (payload.type !== 'access') return res.status(401).json({ error: 'Invalid token type' });
    req.auth = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Forbidden for role ' + (req.auth?.role ?? 'unknown') });
    }
    next();
  };
}

export async function loadUserById(id) {
  const r = await query('SELECT * FROM users WHERE id = $1', [id]);
  return r.rows[0] || null;
}

// Public projection: NEVER includes password_hash. pos_activation_token is
// included only where the caller needs it (staff creation response, own
// profile) — the generic /api/users list strips it (see index.js).
export function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
}
