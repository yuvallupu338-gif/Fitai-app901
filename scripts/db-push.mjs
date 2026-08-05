#!/usr/bin/env node
/**
 * מריץ את כל קובצי המיגרציה מול מסד הנתונים של Supabase.
 *
 *   npm run db:push              – מיגרציות בלבד
 *   npm run db:reset             – מיגרציות + נתוני דוגמה
 *
 * דורש SUPABASE_DB_URL בקובץ ‎.env.local‎ (Project Settings → Database → URI).
 */
import { config as loadEnv } from 'dotenv';

// טוען קודם ‎.env.local‎ (כמו Next.js) ואחר כך ‎.env‎ כגיבוי.
loadEnv({ path: '.env.local' });
loadEnv();
import pg from 'pg';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const withSeed = process.argv.includes('--with-seed');

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('\n✖ חסר SUPABASE_DB_URL. העתיקו את .env.example ל־.env.local ומלאו את הערך.\n');
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
});

await client.connect();
console.log('✓ מחובר למסד הנתונים');

const dir = join(root, 'supabase', 'migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

for (const file of files) {
  process.stdout.write(`▶ ${file} … `);
  try {
    await client.query(readFileSync(join(dir, file), 'utf8'));
    console.log('הושלם');
  } catch (error) {
    console.log('נכשל');
    console.error(`\n✖ שגיאה בקובץ ${file}:\n${error.message}\n`);
    await client.end();
    process.exit(1);
  }
}

if (withSeed) {
  const seed = join(root, 'supabase', 'seed.sql');
  if (existsSync(seed)) {
    process.stdout.write('▶ seed.sql … ');
    try {
      await client.query(readFileSync(seed, 'utf8'));
      console.log('הושלם');
    } catch (error) {
      console.log('נכשל');
      console.error(`\n✖ שגיאה בזריעת הנתונים:\n${error.message}\n`);
      await client.end();
      process.exit(1);
    }
  }
}

await client.end();
console.log('\n✓ מסד הנתונים מעודכן.\n');
