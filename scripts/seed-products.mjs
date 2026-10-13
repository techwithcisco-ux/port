// Generates product image tiles into assets/product-images/ and seeds the
// catalog (products + images + variants + supplier + intake + allocations)
// into the local BranchPort Postgres. Run:  node scripts/seed-products.mjs
// The owner's restocking photos follow the same path later: ProductSetup /
// StockIntake save a downscaled JPEG base64 into products.image, the POS
// pulls it, and the tile shows the photo offline (PWA + Dexie cache).

import bcrypt from 'bcryptjs';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const IMAGE_DIR = path.join(ROOT, 'assets', 'product-images');

// name, emoji, tile color, retail unit, bulk unit, units per bulk,
// retail price, bulk price, bulk cost
const CATALOG = [
  ['Ghana Sugar',      '🍬', '#FDE68A', 'cup',    'bag',    10,  60,  520,  430],
  ['Rice',             '🍚', '#EBCA7B', 'cup',    'bag',    30,   8,  220,  170],
  ['Cooking Oil',      '🛢️', '#E8B04B', 'bottle', 'carton', 12,  45,  480,  390],
  ['Milo',             '🍫', '#7A4A2B', 'sachet', 'carton', 24,  15,  330,  270],
  ['Peak Milk',        '🥛', '#4A90D9', 'tin',    'crate',  24,  12,  260,  210],
  ['Bread',            '🍞', '#D9A05B', 'loaf',   'tray',   20,  12,  220,  170],
  ['Coca-Cola',        '🥤', '#DC7670', 'bottle', 'crate',  24,   5,  110,   85],
  ['Indomie Noodles',  '🍜', '#E67E22', 'pack',   'carton', 40,   8,  290,  235],
  ['Tomato Paste',     '🍅', '#C0392B', 'tin',    'carton', 24,   7,  150,  120],
  ['Fresh Pepper',     '🌶️', '#E74C3C', 'small bag', 'basket', 50, 10, 420,  330],
  ['Gari',             '🥘', '#F0E68C', 'cup',    'bag',    40,   6,  210,  165],
  ['Maize',            '🌽', '#F1C40F', 'piece',  'bag',   100,   4,  300,  240],
  ['Yam',              '🍠', '#B08968', 'piece',  'crate',  12,  25,  260,  210],
  ['Plantain',         '🍌', '#E9C46A', 'piece',  'bunch',  12,   3,   55,   40],
  ['Eggs',             '🥚', '#F3D5B5', 'crate',  'carton',  4,  55,  210,  175],
  ['Sardines',         '🐟', '#5B9BD5', 'tin',    'carton', 50,  12,  540,  450],
  ['Chicken',          '🍗', '#E67E22', 'piece',  'bag',    10,  40,  370,  320],
  ['Salt',             '🧂', '#CBD5E1', 'pack',   'bag',    20,   5,   90,   70],
  ['Tea Bags',         '☕', '#84B69D', 'box',    'carton', 24,  30,  650,  540],
  ['Biscuits',         '🍪', '#F5B041', 'pack',   'carton', 36,   4,  130,  105],
  ['Toilet Roll',      '🧻', '#E2E8F0', 'roll',   'bale',   24,   8,  175,  140],
  ['Toothpaste',       '🪥', '#A58BD6', 'tube',   'carton', 24,  22,  480,  400],
  ['Maggi Cubes',      '🍖', '#F39C12', 'pack',   'carton', 60,   6,  330,  270],
  ['Omo Soap',         '🧼', '#5DADE2', 'bar',    'carton', 48,   7,  310,  250],
  ['Bottled Water',    '💧', '#74C0E8', 'bottle', 'crate',  12,   3,   32,   24],
  ['Blue Band Butter', '🧈', '#F7DC6F', 'tub',    'carton', 24,  28,  620,  520],
];

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function svgFor(name, emoji, color, retailUnit) {
  const nameSize = name.length > 13 ? 44 : name.length > 9 ? 54 : 64;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0.75"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" rx="56" fill="url(#g)"/>
  <circle cx="300" cy="250" r="170" fill="rgba(255,255,255,0.45)"/>
  <circle cx="300" cy="250" r="170" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="6"/>
  <text x="300" y="330" font-size="210" text-anchor="middle">${emoji}</text>
  <text x="300" y="505" font-size="${nameSize}" font-weight="700" text-anchor="middle" fill="#111827" font-family="Segoe UI, Arial, sans-serif">${name}</text>
  <text x="300" y="552" font-size="34" text-anchor="middle" fill="#374151" font-family="Segoe UI, Arial, sans-serif">per ${retailUnit}</text>
</svg>
`;
}

// ── Phase 1: image folder ────────────────────────────────────────────────
fs.mkdirSync(IMAGE_DIR, { recursive: true });
for (const [name, emoji, color, retailUnit] of CATALOG) {
  const file = path.join(IMAGE_DIR, `${slug(name)}.svg`);
  fs.writeFileSync(file, svgFor(name, emoji, color, retailUnit), 'utf8');
}
console.log(`Wrote ${CATALOG.length} image tiles to ${path.relative(ROOT, IMAGE_DIR)}/`);

// ── Phase 2: seed the database ───────────────────────────────────────────
const env = fs.readFileSync(path.join(ROOT, 'apps', 'api', '.env'), 'utf8');
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1];
if (!url) throw new Error('DATABASE_URL missing in apps/api/.env');

const dataUrl = (name) =>
  'data:image/svg+xml;base64,' +
  Buffer.from(fs.readFileSync(path.join(IMAGE_DIR, `${slug(name)}.svg`), 'utf8')).toString('base64');

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  const { rows: biz } = await client.query('SELECT id FROM businesses LIMIT 1');
  const { rows: branch } = await client.query('SELECT id FROM branches LIMIT 1');
  const { rows: owner } = await client.query(
    "SELECT id FROM users WHERE role = 'owner' ORDER BY created_at LIMIT 1"
  );
  if (!biz.length || !branch.length || !owner.length) throw new Error('Need a business, branch and owner first.');
  const businessId = biz[0].id, branchId = branch[0].id, ownerId = owner[0].id;

  // Supplier for the intake ledger
  let { rows: sup } = await client.query('SELECT id FROM suppliers WHERE business_id = $1 LIMIT 1', [businessId]);
  if (!sup.length) {
    const r = await client.query(
      'INSERT INTO suppliers (id, business_id, name) VALUES (gen_random_uuid(), $1, $2) RETURNING id',
      [businessId, 'Melcom Wholesale']
    );
    sup = r.rows;
  }
  const supplierId = sup[0].id;

  let created = 0, updated = 0;
  for (const [name, , , , , upb, retail, bulk, cost] of CATALOG) {
    const img = dataUrl(name);
    let { rows } = await client.query('SELECT id FROM products WHERE business_id = $1 AND name = $2', [businessId, name]);
    let productId;
    if (rows.length) {
      productId = rows[0].id;
      await client.query('UPDATE products SET image = $1 WHERE id = $2', [img, productId]);
      updated++;
    } else {
      const r = await client.query(
        `INSERT INTO products (id, business_id, name, bulk_unit_name, retail_unit_name, units_per_bulk,
           bulk_cost_price, bulk_sell_price, retail_sell_price, image)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [businessId, name, CATALOG.find((c) => c[0] === name)[4], CATALOG.find((c) => c[0] === name)[3],
         upb, cost, bulk, retail, img]
      );
      productId = r.rows[0].id;
      created++;
    }

    // Canonical variant pair: retail first (base), bulk second
    await client.query('DELETE FROM product_variants WHERE product_id = $1', [productId]);
    await client.query(
      `INSERT INTO product_variants (id, product_id, name, price, base_units, sort_order)
       VALUES (gen_random_uuid(), $1, $2, $3, 1, 0), (gen_random_uuid(), $1, $4, $5, $6, 1)`,
      [productId, `${CATALOG.find((c) => c[0] === name)[3]}`, retail, `${CATALOG.find((c) => c[0] === name)[4]}`, bulk, upb]
    );

    // Restock record (owner bought 10 bulk units, paid in full)
    await client.query(
      `INSERT INTO inventory_intake (id, business_id, supplier_id, product_id, bulk_quantity,
         cost_price_total, amount_paid, created_by)
       SELECT gen_random_uuid(), $1, $2, $3, 10, $4, $4, $5
       WHERE NOT EXISTS (SELECT 1 FROM inventory_intake WHERE product_id = $3)`,
      [businessId, supplierId, productId, cost * 10, ownerId]
    );

    // Stock on the branch's till (10 bulk units → retail equivalent)
    await client.query(
      `INSERT INTO inventory_allocations (id, product_id, branch_id, bulk_quantity,
         retail_quantity_equivalent, allocated_by)
       SELECT gen_random_uuid(), $1, $2, 10, $3, $4
       WHERE NOT EXISTS (SELECT 1 FROM inventory_allocations WHERE product_id = $1 AND branch_id = $2)`,
      [productId, branchId, 10 * upb, ownerId]
    );
  }

  const { rows: [{ n }] } = await client.query('SELECT count(*)::int AS n FROM products');
  console.log(`Products: ${created} created, ${updated} updated (image refreshed). Catalog now ${n} items.`);
  console.log('Each product has retail+bulk variants, an intake record, and stock allocated to Main Store.');
} finally {
  await client.end();
}
