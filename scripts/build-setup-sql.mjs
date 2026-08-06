#!/usr/bin/env node
/**
 * מרכיב קובץ SQL אחד להתקנה ידנית ב־SQL Editor של Supabase.
 *
 * מיועד למי שאין לו Node ולא רוצה להריץ סקריפטים: מדביקים קובץ אחד,
 * לוחצים Run, ומסד הנתונים מוכן — כולל נתוני הדגמה.
 *
 *   node scripts/build-setup-sql.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrations = join(root, 'supabase', 'migrations');

const files = readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort();

const header = `-- ==========================================================
--  יופי — התקנה מלאה בקובץ אחד
-- ==========================================================
--
--  מה עושים:
--    1. פותחים ב־Supabase את SQL Editor  →  New query
--    2. מדביקים את כל הקובץ הזה
--    3. לוחצים Run
--
--  זהו. נוצרים כל הטבלאות, ההרשאות, הפונקציות ונתוני ההדגמה.
--
--  ⚠ נשאר צעד אחד אחרון בסוף הקובץ: להדביק את ה־JWT Secret שלכם
--    (Project Settings → API → JWT Settings → JWT Secret).
--    בלעדיו ההתחברות לא תעבוד. חפשו למטה: PASTE_YOUR_JWT_SECRET_HERE
--
--  אפשר להריץ את הקובץ שוב בבטחה — הוא אינו מוחק נתונים קיימים.
--
--  נוצר אוטומטית מתוך supabase/migrations ו־supabase/seed.sql.
--  אין לערוך אותו ידנית — יש לערוך את המקור ולהריץ:
--    node scripts/build-setup-sql.mjs
-- ==========================================================

`;

const parts = [header];

for (const file of files) {
  parts.push(`\n-- ==========================================================\n-- ${file}\n-- ==========================================================\n`);
  parts.push(readFileSync(join(migrations, file), 'utf8'));
}

parts.push(`\n-- ==========================================================
-- נתוני הדגמה בעברית
-- ==========================================================
`);
parts.push(readFileSync(join(root, 'supabase', 'seed.sql'), 'utf8'));

// ה־seed שומר מציין־מקום במקום hash של סיסמה, כדי שלא יישמר מלח קבוע
// בקובץ ציבורי. כאן מייצרים hash אמיתי ואקראי לכל משתמש דוגמה.
parts.push(`
-- ==========================================================
-- סיסמאות למשתמשי ההדגמה
-- כל משתמש מקבל hash אקראי משלו. הסיסמה לכולם: Demo1234
-- ==========================================================

update public.profiles
   set password_hash = public.hash_password('Demo1234')
 where password_hash = 'SEED_PLACEHOLDER';

`);

parts.push(`-- ==========================================================
--  ⬅⬅⬅  הצעד האחרון — חובה  ➡➡➡
--
--  החליפו את PASTE_YOUR_JWT_SECRET_HERE במפתח האמיתי שלכם:
--    Project Settings → API → JWT Settings → JWT Secret
--
--  המפתח נשמר בטבלה ‎app_secrets‎ שאין עליה שום הרשאה למשתמשים,
--  ומשמש לחתימת אסימוני ההתחברות בתוך מסד הנתונים בלבד.
-- ==========================================================

select public.set_app_secret('jwt_secret', 'PASTE_YOUR_JWT_SECRET_HERE');

-- ==========================================================
--  סיימתם. מה הלאה?
--
--  1. Project Settings → API — העתיקו את Project URL ואת מפתח ה־anon
--  2. פתחו את index.html והדביקו אותם בשתי השורות שבראש הקובץ
--  3. פתחו את הקובץ בדפדפן — האפליקציה מוכנה
--
--  משתמשי הדגמה (הסיסמה לכולם: Demo1234):
--    admin_yofi     — מנהל מערכת
--    shirley_hair   — מעצבת שיער עם פרופיל מלא
--    yael_client    — לקוחה עם הזמנות וסדרה קבועה
-- ==========================================================
`);

const output = join(root, 'supabase', 'setup.sql');
writeFileSync(output, parts.join('\n'), 'utf8');

const lines = parts.join('\n').split('\n').length;
console.log(`✓ נוצר supabase/setup.sql — ${files.length} מיגרציות + זריעה, ${lines} שורות`);
