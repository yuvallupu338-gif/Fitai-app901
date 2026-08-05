#!/usr/bin/env node
/**
 * זורע נתוני דוגמה בעברית (‎supabase/seed.sql‎).
 * הסיסמאות של משתמשי הדוגמה נוצרות עם אותו אלגוריתם scrypt שבו משתמשת
 * האפליקציה, כדי שאפשר יהיה להתחבר איתם באמת (ראו ‎scripts/seed-lib.mjs‎).
 */
import { config as loadEnv } from 'dotenv';

// טוען קודם ‎.env.local‎ (כמו Next.js) ואחר כך ‎.env‎ כגיבוי.
loadEnv({ path: '.env.local' });
loadEnv();
import pg from 'pg';
import { applySeed, DEMO_PASSWORD } from './seed-lib.mjs';

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

console.log('▶ זורע נתוני דוגמה …');
const seeded = await applySeed(client);

console.log(`✓ נזרעו נתוני דוגמה. ${seeded} משתמשים קיבלו את הסיסמה: ${DEMO_PASSWORD}`);
await client.end();
