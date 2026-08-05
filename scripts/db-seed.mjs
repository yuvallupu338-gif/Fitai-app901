#!/usr/bin/env node
/**
 * זורע נתוני דוגמה בעברית (‎supabase/seed.sql‎).
 * הסיסמאות של משתמשי הדוגמה נוצרות כאן עם אותו אלגוריתם scrypt
 * שבו משתמשת האפליקציה, כדי שאפשר יהיה להתחבר איתם באמת.
 */
import { config as loadEnv } from 'dotenv';

// טוען קודם ‎.env.local‎ (כמו Next.js) ואחר כך ‎.env‎ כגיבוי.
loadEnv({ path: '.env.local' });
loadEnv();
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scryptSync, randomBytes } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// חייב להתאים ל־lib/auth/password.ts
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password.normalize('NFKC'), salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 256 * 1024 * 1024,
  });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), derived.toString('base64')].join('$');
}

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('\n✖ חסר SUPABASE_DB_URL בקובץ .env.local\n');
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
});

await client.connect();

const sql = readFileSync(join(root, 'supabase', 'seed.sql'), 'utf8');
console.log('▶ זורע נתוני דוגמה …');
await client.query(sql);

// כל משתמשי הדוגמה מקבלים את הסיסמה Demo1234 עם hash אמיתי ונפרד.
const { rows } = await client.query(
  "select id from profiles where username in (select username from profiles) and password_hash = 'SEED_PLACEHOLDER'",
);
for (const row of rows) {
  await client.query('update profiles set password_hash = $1 where id = $2', [hashPassword('Demo1234'), row.id]);
}

console.log(`✓ נזרעו נתוני דוגמה. ${rows.length} משתמשים קיבלו את הסיסמה: Demo1234`);
await client.end();
