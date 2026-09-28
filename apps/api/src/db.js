import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn('[api] DATABASE_URL not set — API will fail on first DB call.');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === '0' ? false : { rejectUnauthorized: false },
  max: 10,
});

export async function query(text, params) {
  return pool.query(text, params);
}
