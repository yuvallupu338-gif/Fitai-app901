/**
 * זריעת נתוני הדוגמה.
 *
 * הקובץ ‎supabase/seed.sql‎ שומר את הסיסמאות כמציין־מקום (SEED_PLACEHOLDER)
 * ולא כ־Hash קבוע, משתי סיבות:
 *   1. מלח (salt) קבוע בקובץ SQL ציבורי הוא נוהג אבטחה גרוע.
 *   2. כל התקנה מקבלת Hash אקראי משלה.
 *
 * לכן אחרי הרצת ה־SQL חובה להחליף את מציין־המקום ב־Hash אמיתי — אחרת
 * אף משתמש דוגמה לא יוכל להתחבר. הלוגיקה יושבת כאן כדי ששני הסקריפטים
 * (‎db:seed‎ ו־‎db:reset‎) ישתמשו בדיוק באותו קוד.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scryptSync, randomBytes } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** הסיסמה של כל משתמשי הדוגמה. */
export const DEMO_PASSWORD = 'Demo1234';

/** מציין־המקום שמופיע ב־seed.sql במקום ה־Hash. */
const PLACEHOLDER = 'SEED_PLACEHOLDER';

// חייב להתאים ל־lib/auth/password.ts
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

/** יוצר Hash של סיסמה באותו פורמט שבו משתמשת האפליקציה. */
export function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password.normalize('NFKC'), salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 256 * 1024 * 1024,
  });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), derived.toString('base64')].join('$');
}

/**
 * מריץ את ‎seed.sql‎ ואז מחליף כל מציין־מקום ב־Hash אקראי ותקין.
 * @returns {Promise<number>} מספר המשתמשים שקיבלו סיסמה.
 */
export async function applySeed(client) {
  await client.query(readFileSync(join(root, 'supabase', 'seed.sql'), 'utf8'));

  const { rows } = await client.query('select id from public.profiles where password_hash = $1', [PLACEHOLDER]);
  for (const row of rows) {
    await client.query('update public.profiles set password_hash = $1 where id = $2', [
      hashPassword(DEMO_PASSWORD),
      row.id,
    ]);
  }

  return rows.length;
}
