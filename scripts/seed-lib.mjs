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

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** הסיסמה של כל משתמשי הדוגמה. */
export const DEMO_PASSWORD = 'Demo1234';

/** מציין־המקום שמופיע ב־seed.sql במקום ה־Hash. */
const PLACEHOLDER = 'SEED_PLACEHOLDER';

/**
 * מריץ את ‎seed.sql‎ ואז מחליף כל מציין־מקום ב־Hash אקראי ותקין.
 *
 * ה־Hash נוצר על ידי ‎hash_password()‎ שבמסד – אותה פונקציה שמשמשת
 * את ההרשמה האמיתית – כך שמשתמשי הדוגמה יכולים להתחבר גם מאפליקציית
 * Next.js וגם מהלקוח שבדפדפן, עם אותה סיסמה בדיוק.
 *
 * @returns {Promise<number>} מספר המשתמשים שקיבלו סיסמה.
 */
export async function applySeed(client) {
  await client.query(readFileSync(join(root, 'supabase', 'seed.sql'), 'utf8'));

  const { rowCount } = await client.query(
    'update public.profiles set password_hash = public.hash_password($1) where password_hash = $2',
    [DEMO_PASSWORD, PLACEHOLDER],
  );

  return rowCount;
}
