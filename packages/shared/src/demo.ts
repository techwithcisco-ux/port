// Demo data layer (dev-only). Activated with VITE_DEMO_MODE=1 in either
// app's .env. Returns an object shaped like the Supabase client but backed
// by an in-memory dataset, so the whole product — dashboard + POS — runs
// with zero backend and realistic informal-market data. The production
// path (createSupabaseClient) is untouched; this exists purely so the
// system can be demoed before a real Supabase project is provisioned.
//
// Demo logins (any password):
//   owner@branchport.local     owner
//   manager@branchport.local   manager
//   staff@branchport.local     staff (Madina)
//   staff2@branchport.local    staff (Dansoman)
//   staff3@branchport.local    staff (Achimota)
//
// The dataset is seeded: 5 products with variants (cup/bag/sachet/bottle…),
// 3 suppliers, purchase intakes, branch allocations, ~30 days of sales with
// rotating customers, supplier payments/reconciliations and a query log.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppUser } from './types';

export const DEMO_ACCOUNTS = [
  'owner@branchport.local',
  'manager@branchport.local',
  'staff@branchport.local',
  'staff2@branchport.local',
  'staff3@branchport.local',
];

// ---- user persistence (cross-device via localStorage) ----------------
// In the demo mock the users table is the single source of truth for
// authentication.  We persist it to localStorage so that a staff account
// created on one device is immediately available on another (same
// browser profile) — the same guarantee the real Supabase DB provides
// in production.

const USERS_STORAGE_KEY = 'branchport-demo-users-v2';

function loadPersistedUsers(): Row[] {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Row[]) : [];
  } catch {
    return [];
  }
}

function savePersistedUsers(users: Row[]) {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch { /* quota exceeded — graceful degradation */ }
}

function mergePersistedUsers(seedUsers: Row[], persisted: Row[]): Row[] {
  const byId = new Map(seedUsers.map((u) => [u.id as string, u]));
  for (const pu of persisted) {
    if (!byId.has(pu.id as string)) byId.set(pu.id as string, pu);
    else {
      // Merged fields from the persisted copy — name/phone/password may
      // have been updated by the owner since the seed was written.
      const existing = byId.get(pu.id as string)!;
      for (const key of ['name', 'phone', 'password_hash', 'branch_id', 'role']) {
        if ((pu as Record<string, unknown>)[key] !== undefined) {
          (existing as Record<string, unknown>)[key] = (pu as Record<string, unknown>)[key];
        }
      }
    }
  }
  return Array.from(byId.values());
}

/**
 * Authenticate a user by phone and password against the demo users table.
 * Returns the user profile on success, or an error message on failure.
 */
export function authenticateUser(phone: string, password: string): { user: AppUser } | { error: string } {
  const cleanPhone = phone.replace(/\s+/g, '').replace(/[^+\d]/g, '');
  const allUsers = loadPersistedUsers();
  if (allUsers.length === 0) {
    // No persisted users yet — fall back to the seed dataset
    const seed = buildDataset();
    const merged = mergePersistedUsers(seed.users as Row[], []);
    savePersistedUsers(merged);
    return authenticateFromList(merged, cleanPhone, password);
  }
  return authenticateFromList(allUsers, cleanPhone, password);
}

function authenticateFromList(users: Row[], cleanPhone: string, password: string): { user: AppUser } | { error: string } {
  const match = users.find((u) => {
    const up = String(u.phone ?? '').replace(/\s+/g, '').replace(/[^+\d]/g, '');
    return up === cleanPhone;
  });
  if (match) {
    const stored = String(match.password_hash ?? '');
    if (stored && stored !== btoa(password)) return { error: 'Incorrect password.' };
    const { password_hash: _pw, ...rest } = match as Row & { password_hash?: string };
    return { user: rest as unknown as AppUser };
  }

  // Fallback: try email-based match (for demo seed accounts that use EMAIL_TO_UID)
  const emailKey = cleanPhone.replace(/[^a-z@]/g, '').toLowerCase();
  const emailMatch = EMAIL_TO_UID[emailKey];
  if (emailMatch) {
    const user = users.find((u) => u.id === emailMatch);
    if (!user) return { error: 'No account found for that phone number.' };
    const stored = String(user.password_hash ?? '');
    if (stored && stored !== btoa(password)) return { error: 'Incorrect password.' };
    const { password_hash: _pw, ...rest } = user as Row & { password_hash?: string };
    return { user: rest as unknown as AppUser };
  }

  return { error: 'No account found for that phone number.' };
}

// ── POS phone-only authentication ────────────────────────────────────────
// The POS uses phone-number-only auth. No password is needed — the
// owner activates a staff member's POS access by sending them a unique
// activation link. Once activated, the staff member logs in with just
// their phone number.

/**
 * Authenticate a POS user by phone number only (no password).
 * The user must have been activated via a POS activation link.
 * Returns the user profile on success, or an error message on failure.
 */
export function authenticatePOSUser(phone: string): { user: AppUser } | { error: string } {
  const cleanPhone = phone.replace(/\s+/g, '').replace(/[^+\d]/g, '');
  if (!cleanPhone) return { error: 'Phone number is required.' };
  const allUsers = loadPersistedUsers();
  if (allUsers.length === 0) {
    const seed = buildDataset();
    const merged = mergePersistedUsers(seed.users as Row[], []);
    savePersistedUsers(merged);
    return authenticatePOSFromList(merged, cleanPhone);
  }
  return authenticatePOSFromList(allUsers, cleanPhone);
}

function authenticatePOSFromList(users: Row[], cleanPhone: string): { user: AppUser } | { error: string } {
  // Find all users matching this phone number
  const matches = users.filter((u) => {
    const up = String(u.phone ?? '').replace(/\s+/g, '').replace(/[^+\d]/g, '');
    return up === cleanPhone;
  });
  if (matches.length === 0) return { error: 'No account found for that phone number.' };

  // Prefer an activated staff user (POS-specific login)
  const activated = matches.find((u) => u.role === 'staff' && u.pos_activated === true);
  if (activated) {
    const { password_hash: _pw, ...rest } = activated as Row & { password_hash?: string };
    return { user: rest as unknown as AppUser };
  }

  // Fallback: if the user exists but hasn't been activated yet
  const anyStaff = matches.find((u) => u.role === 'staff');
  if (anyStaff) {
    return { error: 'Your POS access has not been activated yet. Ask your manager to send you the activation link.' };
  }

  // If they're an owner/manager, let them through (they have dashboard access)
  const ownerOrManager = matches.find((u) => u.role === 'owner' || u.role === 'manager');
  if (ownerOrManager) {
    const { password_hash: _pw, ...rest } = ownerOrManager as Row & { password_hash?: string };
    return { user: rest as unknown as AppUser };
  }

  return { error: 'No POS account found for that phone number.' };
}

/**
 * Generate a POS activation link for a staff user.
 * The link contains a unique token that, when opened, activates POS
 * access for that user. Returns the activation URL.
 */
export function generatePOSActivationLink(userId: string): { url: string; token: string } | { error: string } {
  const allUsers = loadPersistedUsers();
  const user = allUsers.find((u) => u.id === userId);
  if (!user) return { error: 'User not found.' };

  // Generate a unique activation token
  const token = `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  // Store the token on the user record
  user.pos_activation_token = token;
  user.pos_activated = false;
  savePersistedUsers(allUsers);

  // Encode user data in the URL so it works on ANY device (cross-device activation).
  // The POS app will create the user locally when the link is opened.
  const userData = btoa(JSON.stringify({
    id: user.id,
    name: user.name,
    phone: user.phone,
    branch_id: user.branch_id,
    business_id: user.business_id,
    role: user.role,
  }));

  // Build the activation URL — in demo mode this points to the POS app
  const posBase = window?.location?.port === '5173'
    ? `${window.location.protocol}//${window.location.hostname}:5174`
    : `${window.location.origin}/pos`;
  const url = `${posBase}/activate?token=${token}&user=${userId}&d=${encodeURIComponent(userData)}`;

  return { url, token };
}

/**
 * Activate POS access for a user by their activation token.
 * Called when the staff member opens the activation link.
 * Returns the user profile on success.
 */
export function activatePOS(token: string): { user: AppUser } | { error: string } {
  if (!token) return { error: 'Activation token is required.' };
  const allUsers = loadPersistedUsers();
  const user = allUsers.find((u) => u.pos_activation_token === token);
  if (!user) return { error: 'Invalid or expired activation link.' };

  // Activate POS access and clear the token (one-time use)
  user.pos_activated = true;
  user.pos_activation_token = null;
  savePersistedUsers(allUsers);

  const { password_hash: _pw, ...rest } = user as Row & { password_hash?: string };
  return { user: rest as unknown as AppUser };
}

/**
 * Delete a user from the demo users table.
 */
export function deleteUser(userId: string): { error?: string } {
  const allUsers = loadPersistedUsers();
  const idx = allUsers.findIndex((u) => u.id === userId);
  if (idx === -1) return { error: 'User not found.' };
  allUsers.splice(idx, 1);
  savePersistedUsers(allUsers);
  // Also remove from the live in-memory dataset
  const dsIdx = _datasetUsers.findIndex((u) => u.id === userId);
  if (dsIdx !== -1) _datasetUsers.splice(dsIdx, 1);
  return {};
}

/**
 * Update a user's details in the demo users table.
 */
export function updateUser(userId: string, updates: Partial<{ name: string; phone: string; branch_id: string | null }>): { user?: AppUser; error?: string } {
  const allUsers = loadPersistedUsers();
  const user = allUsers.find((u) => u.id === userId);
  if (!user) return { error: 'User not found.' };
  if (updates.name !== undefined) user.name = updates.name;
  if (updates.phone !== undefined) user.phone = updates.phone;
  if (updates.branch_id !== undefined) user.branch_id = updates.branch_id;
  savePersistedUsers(allUsers);
  // Also sync the live in-memory dataset
  const dsUser = _datasetUsers.find((u) => u.id === userId);
  if (dsUser) {
    if (updates.name !== undefined) dsUser.name = updates.name;
    if (updates.phone !== undefined) dsUser.phone = updates.phone;
    if (updates.branch_id !== undefined) dsUser.branch_id = updates.branch_id;
  }
  const { password_hash: _pw, ...rest } = user as Row & { password_hash?: string };
  return { user: rest as unknown as AppUser };
}

/**
 * Get the stored password for a user (decoded from base64).
 * Only for display in the owner's staff management view.
 */
export function getUserPassword(userId: string): string | null {
  const allUsers = loadPersistedUsers();
  const user = allUsers.find((u) => u.id === userId);
  if (!user || !user.password_hash) return null;
  try {
    return atob(String(user.password_hash));
  } catch {
    return null;
  }
}

/**
 * Create a new user in the demo users table (called by the owner from
 * Team.tsx or Managers.tsx). Returns the created profile and the
 * plaintext password to hand to the new user.
 */
export function createUser(params: {
  name: string;
  phone: string;
  role: 'staff' | 'manager';
  branch_id: string | null;
  business_id: string;
}): { user: AppUser; password: string } {
  const password = generatePassword();
  const id = `u-${params.role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const newUser: Row = {
    id,
    business_id: params.business_id,
    branch_id: params.branch_id,
    role: params.role,
    name: params.name,
    phone: params.phone,
    password_hash: btoa(password),
    pos_activated: false,
    pos_activation_token: null,
    created_at: new Date().toISOString(),
  };
  const allUsers = loadPersistedUsers();
  // Check for duplicate phone within the same business
  const cleanPhone = params.phone.replace(/\s+/g, '').replace(/[^+\d]/g, '');
  const dup = allUsers.find((u) => {
    const up = String(u.phone ?? '').replace(/\s+/g, '').replace(/[^+\d]/g, '');
    return up === cleanPhone && u.business_id === params.business_id;
  });
  if (dup) return { user: null as unknown as AppUser, password: '' };
  allUsers.push(newUser);
  savePersistedUsers(allUsers);
  // Also push into the live in-memory dataset
  _datasetUsers.push(newUser);
  const { password_hash: _pw, ...rest } = newUser;
  return { user: rest as unknown as AppUser, password };
}

/**
 * Create a new owner account with a business. Called during owner signup.
 * Creates a business, an owner user, a default branch, and returns the
 * user profile + the password they chose.
 */
export function createOwnerAccount(params: {
  businessName: string;
  businessType: string;
  businessForm?: string;
  businessCategories?: string[];
  phone: string;
  password: string;
  name: string;
}): { user: AppUser; password: string; error?: string } {
  const cleanPhone = params.phone.replace(/\s+/g, '').replace(/[^+\d]/g, '');
  if (!cleanPhone) return { user: null as unknown as AppUser, password: '', error: 'Phone number is required.' };
  if (params.password.length < 7) return { user: null as unknown as AppUser, password: '', error: 'Password must be at least 7 characters.' };
  if (!params.businessName.trim()) return { user: null as unknown as AppUser, password: '', error: 'Business name is required.' };
  if (!params.name.trim()) return { user: null as unknown as AppUser, password: '', error: 'Your name is required.' };

  const allUsers = loadPersistedUsers();
  // Check for duplicate phone within the same business only (like Supabase's
  // (business_id, phone) unique index). Since we're about to create a new
  // business, filter to only check against existing owner records; the real
  // Supabase DB enforces (business_id, phone) uniqueness at the schema level.
  const dup = allUsers.find((u) => 
    u.role === 'owner' && String(u.phone ?? '').replace(/\s+/g, '').replace(/[^+\d]/g, '') === cleanPhone
  );
  if (dup) return { user: null as unknown as AppUser, password: '', error: 'An account with this phone number already exists.' };

  // Load or create businesses list
  const bizKey = 'branchport-businesses';
  let businesses: Row[] = [];
  try {
    const raw = localStorage.getItem(bizKey);
    if (raw) businesses = JSON.parse(raw);
  } catch { /* empty */ }

  const bizId = `biz-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const userId = `u-owner-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const branchId = `br-${Date.now()}-main`;

  // Create business
  const newBiz: Row = {
    id: bizId,
    name: params.businessName.trim(),
    business_type: params.businessType,
    business_form: params.businessForm ?? null,
    business_categories: params.businessCategories ?? [],
    owner_user_id: userId,
    created_at: new Date().toISOString(),
  };
  businesses.push(newBiz);
  localStorage.setItem(bizKey, JSON.stringify(businesses));

  // Create owner user
  const newUser: Row = {
    id: userId,
    business_id: bizId,
    branch_id: null,
    role: 'owner',
    name: params.name.trim(),
    phone: cleanPhone,
    password_hash: btoa(params.password),
    created_at: new Date().toISOString(),
  };
  allUsers.push(newUser);
  savePersistedUsers(allUsers);

  // Create default branch
  const branchesKey = 'branchport-demo-branches';
  let branches: Row[] = [];
  try {
    const raw = localStorage.getItem(branchesKey);
    if (raw) branches = JSON.parse(raw);
  } catch { /* empty */ }
  branches.push({ id: branchId, business_id: bizId, name: 'Main Store', created_at: new Date().toISOString() });
  localStorage.setItem(branchesKey, JSON.stringify(branches));

  // Create default business in the dataset so intelligence engine sees it
  const datasetBizKey = 'branchport-demo-businesses';
  let datasetBiz: Row[] = [];
  try {
    const raw = localStorage.getItem(datasetBizKey);
    if (raw) datasetBiz = JSON.parse(raw);
  } catch { /* empty */ }
  datasetBiz.push(newBiz);
  localStorage.setItem(datasetBizKey, JSON.stringify(datasetBiz));

  const { password_hash: _pw, ...rest } = newUser;
  return { user: rest as unknown as AppUser, password: params.password };
}

/**
 * Create a new branch (store). Writes to both localStorage and the
 * in-memory demo dataset so supabase.from('branches') queries see it.
 */
export function createBranch(businessId: string, name: string): { branch?: Row; error?: string } {
  if (!name.trim()) return { error: 'Branch name is required.' };
  const branchesKey = 'branchport-demo-branches';
  let branches: Row[] = [];
  try {
    const raw = localStorage.getItem(branchesKey);
    if (raw) branches = JSON.parse(raw);
  } catch { /* empty */ }
  const id = `br-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const newBranch: Row = { id, business_id: businessId, name: name.trim(), created_at: new Date().toISOString() };
  branches.push(newBranch);
  localStorage.setItem(branchesKey, JSON.stringify(branches));
  // Also push into the live in-memory dataset so queries see it immediately
  _datasetBranches.push(newBranch);
  return { branch: newBranch };
}

/**
 * Update a branch name.
 */
export function updateBranch(branchId: string, name: string): { error?: string } {
  if (!name.trim()) return { error: 'Branch name is required.' };
  const branchesKey = 'branchport-demo-branches';
  try {
    const raw = localStorage.getItem(branchesKey);
    if (!raw) return { error: 'Branch not found.' };
    const branches = JSON.parse(raw) as Row[];
    const branch = branches.find((b) => b.id === branchId);
    if (!branch) return { error: 'Branch not found.' };
    branch.name = name.trim();
    localStorage.setItem(branchesKey, JSON.stringify(branches));
    // Sync in-memory dataset
    const dsBranch = _datasetBranches.find((b) => b.id === branchId);
    if (dsBranch) dsBranch.name = name.trim();
    return {};
  } catch {
    return { error: 'Failed to update branch.' };
  }
}

/**
 * Delete a branch.
 */
export function deleteBranch(branchId: string): { error?: string } {
  const branchesKey = 'branchport-demo-branches';
  try {
    const raw = localStorage.getItem(branchesKey);
    if (!raw) return { error: 'Branch not found.' };
    const branches = JSON.parse(raw) as Row[];
    const filtered = branches.filter((b) => b.id !== branchId);
    localStorage.setItem(branchesKey, JSON.stringify(filtered));
    // Sync in-memory dataset
    const idx = _datasetBranches.findIndex((b) => b.id === branchId);
    if (idx !== -1) _datasetBranches.splice(idx, 1);
    return {};
  } catch {
    return { error: 'Failed to delete branch.' };
  }
}

// Live references to arrays inside the demo dataset.
// Initialized in createDemoSupabase so CRUD helpers can push/splice directly.
let _datasetBranches: Row[] = [];
let _datasetUsers: Row[] = [];

/**
 * Get the business info for a given business ID.
 */
export function getBusinessInfo(businessId: string): Record<string, unknown> | null {
  const bizKey = 'branchport-businesses';
  try {
    const raw = localStorage.getItem(bizKey);
    if (!raw) return null;
    const businesses = JSON.parse(raw) as Row[];
    return businesses.find((b) => b.id === businessId) ?? null;
  } catch {
    return null;
  }
}

/**
 * Update business info (owner can edit from Account page).
 */
export function updateBusinessInfo(businessId: string, updates: Partial<{ name: string; business_type: string; business_form: string; business_categories: string[] }>): { error?: string } {
  const bizKey = 'branchport-businesses';
  try {
    const raw = localStorage.getItem(bizKey);
    if (!raw) return { error: 'Business not found.' };
    const businesses = JSON.parse(raw) as Row[];
    const biz = businesses.find((b) => b.id === businessId);
    if (!biz) return { error: 'Business not found.' };
    if (updates.name !== undefined) biz.name = updates.name;
    if (updates.business_type !== undefined) biz.business_type = updates.business_type;
    if (updates.business_form !== undefined) biz.business_form = updates.business_form;
    if (updates.business_categories !== undefined) biz.business_categories = updates.business_categories;
    localStorage.setItem(bizKey, JSON.stringify(businesses));
    // Also update the dataset copy
    const datasetBizKey = 'branchport-demo-businesses';
    try {
      const raw2 = localStorage.getItem(datasetBizKey);
      if (raw2) {
        const dsBiz = JSON.parse(raw2) as Row[];
        const dsEntry = dsBiz.find((b) => b.id === businessId);
        if (dsEntry) {
          Object.assign(dsEntry, updates);
          localStorage.setItem(datasetBizKey, JSON.stringify(dsBiz));
        }
      }
    } catch { /* ok */ }
    return {};
  } catch {
    return { error: 'Failed to update business.' };
  }
}

/**
 * Update the owner's profile (name, phone).
 */
export function updateUserProfile(userId: string, updates: Partial<{ name: string; phone: string }>): { error?: string } {
  const allUsers = loadPersistedUsers();
  const user = allUsers.find((u) => u.id === userId);
  if (!user) return { error: 'User not found.' };
  if (updates.name !== undefined) user.name = updates.name;
  if (updates.phone !== undefined) user.phone = updates.phone;
  savePersistedUsers(allUsers);
  return {};
}

/**
 * Get all registered users (for cross-app auto-login).
 */
export function getAllRegisteredUsers(): AppUser[] {
  const allUsers = loadPersistedUsers();
  return allUsers.map((u) => {
    const { password_hash: _pw, ...rest } = u as Row & { password_hash?: string };
    return rest as unknown as AppUser;
  });
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pw = '';
  for (let i = 0; i < 8; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

type Row = Record<string, unknown>;
type Rows = Row[];

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const daysAgo = (d: number, h = 10) => new Date(Date.now() - d * DAY - h * HOUR).toISOString();

const BIZ = 'biz-001';
const OWNER = 'u-owner';
const MANAGER = 'u-manager';
const MADINA = 'u-staff-madina';
const DANSOMAN = 'u-staff-dansoman';
const ACHIMOTA = 'u-staff-achimota';
const BR_MADINA = 'br-madina';
const BR_DANSOMAN = 'br-dansoman';
const BR_ACHIMOTA = 'br-achimota';

const STAFF_BY_BRANCH: Record<string, string> = {
  [BR_MADINA]: MADINA,
  [BR_DANSOMAN]: DANSOMAN,
  [BR_ACHIMOTA]: ACHIMOTA,
};

const EMAIL_TO_UID: Record<string, string> = {
  'owner@branchport.local': OWNER,
  'manager@branchport.local': MANAGER,
  'staff@branchport.local': MADINA,
  'staff2@branchport.local': DANSOMAN,
  'staff3@branchport.local': ACHIMOTA,
};

// Deterministic PRNG so the demo dataset is stable between reloads.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CUSTOMERS = [
  '', '', 'Ama Adjei', 'Kwame Boateng', 'Efua Asante', 'Yaw Osei', 'Abena Mensah',
  'Kofi Agyeman', 'Akosua Darko', 'Kojo Antwi', 'Maame Serwaa', 'Nana Ama', 'Joe Annan',
];

interface SeedVariant { id: string; name: string; price: number; base: number; sort: number }
interface SeedProduct {
  id: string; name: string; cost: number;
  variants: SeedVariant[];
}

const PRODUCT_SEEDS: SeedProduct[] = [
  {
    id: 'p-rice', name: 'Royal Rice', cost: 40,
    variants: [
      { id: 'pv-rice-cup', name: 'cup', price: 2, base: 1, sort: 0 },
      { id: 'pv-rice-bag', name: 'bag (1kg)', price: 48, base: 24, sort: 1 },
    ],
  },
  {
    id: 'p-sugar', name: 'Sugar', cost: 30,
    variants: [
      { id: 'pv-sugar-cup', name: 'cup', price: 1.5, base: 1, sort: 0 },
      { id: 'pv-sugar-bag', name: 'bag', price: 36, base: 24, sort: 1 },
      { id: 'pv-sugar-sachet', name: 'sachet', price: 0.5, base: 1, sort: 2 },
    ],
  },
  {
    id: 'p-oil', name: 'Frytol Cooking Oil', cost: 100,
    variants: [
      { id: 'pv-oil-sachet', name: 'sachet', price: 2, base: 1, sort: 0 },
      { id: 'pv-oil-bottle', name: 'bottle 500ml', price: 15, base: 8, sort: 1 },
      { id: 'pv-oil-gallon', name: 'gallon', price: 120, base: 60, sort: 2 },
    ],
  },
  {
    id: 'p-gari', name: 'Gari', cost: 48,
    variants: [
      { id: 'pv-gari-cup', name: 'cup', price: 1, base: 1, sort: 0 },
      { id: 'pv-gari-mudu', name: 'mudu', price: 12, base: 12, sort: 1 },
      { id: 'pv-gari-bag', name: 'bag', price: 60, base: 60, sort: 2 },
    ],
  },
  {
    id: 'p-milk', name: 'Peak Milk', cost: 14,
    variants: [
      { id: 'pv-milk-sachet', name: 'sachet', price: 1.5, base: 1, sort: 0 },
      { id: 'pv-milk-carton', name: 'carton', price: 18, base: 12, sort: 1 },
    ],
  },
];

const BRANCH_WEIGHT: Array<[string, number]> = [
  [BR_MADINA, 0.42],
  [BR_DANSOMAN, 0.33],
  [BR_ACHIMOTA, 0.25],
];

// ---- branch persistence (cross-device via localStorage) -----------
const BRANCHES_STORAGE_KEY = 'branchport-demo-branches';
const ALLOCATIONS_STORAGE_KEY = 'branchport-demo-allocations';
const PRODUCTS_STORAGE_KEY = 'branchport-demo-products';
const SALES_STORAGE_KEY = 'branchport-demo-sales';

function loadPersisted(key: string): Row[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Row[]) : [];
  } catch {
    return [];
  }
}

function savePersisted(key: string, rows: Row[]) {
  try {
    localStorage.setItem(key, JSON.stringify(rows));
  } catch { /* quota exceeded */ }
}

// Map of table names to their localStorage keys — only these tables
// are persisted so the POS and dashboard share the same data.
const PERSISTED_TABLES: Record<string, string> = {
  branches: BRANCHES_STORAGE_KEY,
  inventory_allocations: ALLOCATIONS_STORAGE_KEY,
  products: PRODUCTS_STORAGE_KEY,
  sales: SALES_STORAGE_KEY,
};

function persistTable(tableName: string, rows: Row[]) {
  const key = PERSISTED_TABLES[tableName];
  if (key) savePersisted(key, rows);
}

function loadPersistedBranches(): Row[] { return loadPersisted(BRANCHES_STORAGE_KEY); }
function loadPersistedAllocations(): Row[] { return loadPersisted(ALLOCATIONS_STORAGE_KEY); }
function loadPersistedProducts(): Row[] { return loadPersisted(PRODUCTS_STORAGE_KEY); }
function loadPersistedSales(): Row[] { return loadPersisted(SALES_STORAGE_KEY); }

// ---- dataset construction --------------------------------------------

function buildDataset(): Dataset {
  // Load persisted data from localStorage so both dashboard and POS
  // apps see the same data (they're separate Vite instances).
  const branches: Rows = loadPersistedBranches();
  const users: Rows = [];
  const products: Rows = loadPersistedProducts();
  const productVariants: Rows = [];
  const suppliers: Rows = [];
  const intake: Rows = [];
  const allocations: Rows = loadPersistedAllocations();
  const supplierPayments: Rows = [];
  const supplierReconciliations: Rows = [];
  const sales: Rows = loadPersistedSales();
  const audit: Rows = [];
  const backdated: Rows = [];
  const queryLog: Rows = [];
  const expenses: Rows = [];
  const expensePayments: Rows = [];
  const debtors: Rows = [];
  const creditors: Rows = [];
  const usersWithAuth: Rows = [];

  return {
    branches,
    products,
    product_variants: productVariants,
    businesses: [],
    suppliers,
    users: usersWithAuth,
    inventory_intake: intake,
    inventory_allocations: allocations,
    sales,
    audit_events: audit,
    flagged_backdated_events: backdated,
    supplier_payments: supplierPayments,
    supplier_reconciliations: supplierReconciliations,
    query_log: queryLog,
    invoices: [],
    expenses,
    expense_payments: expensePayments,
    debtors,
    debtor_payments: [],
    creditors,
    creditor_payments: [],
  };
}

type Dataset = Record<string, Rows>;

// ---- tiny query engine (just enough of PostgREST's surface) -----------

// Tables with a real create/update audit trigger (0003 + 0007 + 0008 + 0011).
const TRACKED_TABLES = new Set([
  'products',
  'suppliers',
  'inventory_intake',
  'inventory_allocations',
  'sales',
  'supplier_payments',
  'supplier_reconciliations',
  'branches',
  'product_variants',
  'invoices',
  'expenses',
  'expense_payments',
  'debtors',
  'debtor_payments',
  'creditors',
  'creditor_payments',
]);

function tableQuery(name: string, dataset: Dataset, getActor: () => string | null) {
  const state: {
    filters: Array<(r: Row) => boolean>;
    orderCol: string | null;
    orderAsc: boolean;
    lim: number | null;
    single: boolean;
    selectCols: string[] | null;
    countExact: boolean;
    updates: Row | null;
  } = {
    filters: [],
    orderCol: null,
    orderAsc: true,
    lim: null,
    single: false,
    selectCols: null,
    countExact: false,
    updates: null,
  };

  let rowsRef = dataset[name] ?? [];
  const tableName = name;

  // Mirror of the Postgres audit trigger: every insert/update to a tracked
  // table appends a row to audit_events so the activity log stays complete
  // even while running on the demo dataset.
  function mirrorAudit(op: 'insert' | 'update', row: Row, before?: Row) {
    if (!TRACKED_TABLES.has(tableName)) return;
    let business_id = BIZ;
    if (tableName === 'supplier_payments' || tableName === 'supplier_reconciliations') {
      business_id = String((dataset.suppliers as Rows).find((s) => s.id === row.supplier_id)?.business_id ?? BIZ);
    } else if (tableName === 'product_variants') {
      business_id = String((dataset.products as Rows).find((s) => s.id === row.product_id)?.business_id ?? BIZ);
    } else if ((tableName === 'inventory_allocations' || tableName === 'sales') && row.branch_id) {
      business_id = String((dataset.branches as Rows).find((b) => b.id === row.branch_id)?.business_id ?? BIZ);
    } else if (row.business_id) {
      business_id = String(row.business_id);
    }
    const ev: Row = {
      id: `a-auto-${Math.random().toString(36).slice(2, 10)}`,
      business_id,
      actor_user_id: getActor() ?? 'unknown',
      action_type: op,
      entity_type: tableName,
      entity_id: row.id,
      before_state: op === 'update' && before ? before : null,
      after_state: op === 'update' ? row : row,
      occurred_at: new Date().toISOString(),
      client_reported_at: null,
    };
    (dataset.audit_events as Rows).push(ev);
  }

  const run = () => {
    // For persisted tables, re-read from localStorage so separate app
    // instances (dashboard ↔ POS) always see each other's writes.
    const persistedKey = PERSISTED_TABLES[tableName];
    if (persistedKey) {
      const fresh = loadPersisted(persistedKey);
      rowsRef = fresh;
      (dataset[tableName] as Rows) = fresh;
    }
    let out = rowsRef.filter((r) => state.filters.every((f) => f(r)));
    if (state.orderCol) {
      const col = state.orderCol;
      const asc = state.orderAsc;
      out = [...out].sort((a, b) => {
        const av = a[col] as number | string;
        const bv = b[col] as number | string;
        if (typeof av === 'string' && typeof bv === 'string') return asc ? av.localeCompare(bv) : bv.localeCompare(av);
        return asc ? Number(av) - Number(bv) : Number(bv) - Number(av);
      });
    }
    if (state.lim) out = out.slice(0, state.lim);
    const project = (r: Row): Row => {
      if (!state.selectCols) return r;
      const out: Row = {};
      for (const c of state.selectCols) if (c in r) out[c] = r[c];
      return out;
    };
    return {
      data: state.single ? (out.length ? project(out[0]) : null) : out.map(project),
      count: state.countExact ? out.length : null,
      error: null,
    };
  };

  const runUpdate = () => {
    const updates = state.updates!;
    const updated = rowsRef.filter((r) => state.filters.every((f) => f(r)));
    for (const r of updated) {
      const before = { ...r };
      Object.assign(r, updates);
      mirrorAudit('update', r, before);
    }
    (dataset[tableName] as Rows) = rowsRef;
    return {
      data: updated.map((r) => ({ ...r }) as Row),
      count: updated.length,
      error: null,
    };
  };

  const chain = {
    eq(col: string, v: unknown) { state.filters.push((r) => r[col] === v); return chain; },
    gte(col: string, v: unknown) { state.filters.push((r) => (r[col] as string) >= (v as string)); return chain; },
    lte(col: string, v: unknown) { state.filters.push((r) => (r[col] as string) <= (v as string)); return chain; },
    order(col: string, o?: { ascending?: boolean }) { state.orderCol = col; state.orderAsc = o?.ascending ?? true; return chain; },
    limit(n: number) { state.lim = n; return chain; },
    single() { state.single = true; return chain; },
    select(cols?: string, opts?: { count?: 'exact'; head?: boolean }) {
      if (cols && cols !== '*') state.selectCols = cols.split(',').map((c) => c.trim());
      state.countExact = opts?.count === 'exact';
      return chain;
    },
    insert(rows: Row | Row[]) {
      const arr = (Array.isArray(rows) ? rows : [rows]).map((r) => ({
        id: r.id ?? `demo-${Math.random().toString(36).slice(2, 10)}`,
        ...r,
      }));
      rowsRef = rowsRef.concat(arr);
      (dataset[tableName] as Rows) = rowsRef;
      for (const r of arr) mirrorAudit('insert', r);
      // Persist to localStorage so the POS app (separate instance) sees the data
      persistTable(tableName, rowsRef);
      return Promise.resolve({ data: arr.map((r) => ({ ...r })), error: null });
    },
    update(values: Row) {
      state.updates = values;
      return chain;
    },
    then(
      onFulfilled?: (v: { data: unknown; count: number | null; error: { message: string } | null }) => unknown,
      onRejected?: (e: unknown) => unknown
    ) {
      const result = state.updates ? runUpdate() : run();
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };

  return chain;
}

// ---- mock client ------------------------------------------------------

export function createDemoSupabase(): SupabaseClient {
  const builtDataset = buildDataset();
  // Merge any previously persisted users (from localStorage) into the
  // seed dataset so accounts created on another device survive.
  const persistedUsers = loadPersistedUsers();
  if (persistedUsers.length > 0) {
    builtDataset.users = mergePersistedUsers(builtDataset.users as Row[], persistedUsers);
  }
  savePersistedUsers(builtDataset.users as Row[]);
  const dataset: Dataset = builtDataset as unknown as Dataset;
  // Point the CRUD helpers at the live arrays so inserts/updates/deletes
  // are immediately visible to supabase.from('...').select('*') queries.
  _datasetBranches = dataset.branches as Row[];
  _datasetUsers = dataset.users as Row[];
  let currentUserId: string | null = null;
  const listeners: Array<(event: string, session: { user: { id: string } } | null) => void> = [];

  const mock = {
    auth: {
      async getSession() {
        return { data: { session: currentUserId ? { user: { id: currentUserId } } : null } };
      },
      async getUser() {
        return { data: { user: currentUserId ? { id: currentUserId } : null } };
      },
      onAuthStateChange(cb: (event: string, session: { user: { id: string } } | null) => void) {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async signInWithPassword(opts: { email: string }) {
        const uid = EMAIL_TO_UID[opts.email.trim().toLowerCase()];
        if (!uid) {
          return { error: { message: `Unknown account. Demo accounts: ${DEMO_ACCOUNTS.join(', ')}` } };
        }
        currentUserId = uid;
        listeners.forEach((cb) => cb('SIGNED_IN', { user: { id: uid } }));
        return { error: null };
      },
      async signOut() {
        currentUserId = null;
        listeners.forEach((cb) => cb('SIGNED_OUT', null));
      },
    },
    from(table: string) {
      return tableQuery(table, dataset, () => currentUserId);
    },
    functions: {
      async invoke(fn: string, opts: { body?: unknown } = {}) {
        if (fn !== 'invite-staff') return { data: null, error: { message: 'Unknown function' } };
        const body = (opts.body ?? {}) as { branch_id?: string; name?: string; role?: string };
        const role = body.role === 'manager' ? 'manager' : 'staff';
        const uid = `u-invited-${Math.random().toString(36).slice(2, 8)}`;
        if (body.branch_id && body.name) {
          (dataset.users as Rows).push({
            id: uid,
            business_id: BIZ,
            branch_id: body.branch_id,
            role,
            name: body.name,
            created_at: new Date().toISOString(),
          });
        }
        return {
          data: { user_id: uid, name: body.name ?? 'New hire', branch_id: body.branch_id, role, invite_url: `https://branchport.invalid/invite/${uid}` },
          error: null,
        };
      },
    },
  };

  return mock as unknown as SupabaseClient;
}