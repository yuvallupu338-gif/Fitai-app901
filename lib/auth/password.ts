import 'server-only';
import { scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

/** תקרת זיכרון לאימות סיסמאות בפורמט הישן. */
const MAX_MEM = 256 * 1024 * 1024;

/**
 * יוצר hash לסיסמה.
 *
 * ה־hash נוצר בתוך מסד הנתונים (bcrypt דרך pgcrypto) ולא כאן, כדי
 * שאותם משתמשים יוכלו להתחבר גם מאפליקציית Next.js וגם מהלקוח שרץ
 * רק בדפדפן (‎index.html‎). לדפדפן אין דרך לגזור סיסמה בבטחה, ולכן
 * מסד הנתונים הוא המקום היחיד שבו הלוגיקה הזו חיה.
 *
 * הסיסמה עצמה לעולם אינה נשמרת.
 */
export async function hashPassword(password: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('hash_password', { p_password: password });

  if (error || typeof data !== 'string') {
    throw new Error(error?.message ?? 'יצירת ה־hash של הסיסמה נכשלה');
  }

  return data;
}

/**
 * משווה סיסמה מול hash שמור.
 *
 * תומך בשני הפורמטים: bcrypt (הפורמט הנוכחי, נבדק במסד) ו־scrypt
 * (הפורמט הישן, נבדק כאן). כך חשבונות ותיקים ממשיכים לעבוד גם אחרי
 * המעבר, בלי לאלץ אף אחד לאפס סיסמה.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;

  if (stored.startsWith('$2')) {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('verify_password', {
      p_password: password,
      p_stored: stored,
    });
    return !error && data === true;
  }

  return verifyLegacyScrypt(password, stored);
}

/** אימות סיסמאות בפורמט הישן: scrypt$N$r$p$salt$hash */
async function verifyLegacyScrypt(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = stored.split('$');
    if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;

    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');

    const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: MAX_MEM,
    });

    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * מד חוזק סיסמה (0–4) – משמש גם בשרת לוודא עמידה בדרישות המינימום.
 */
export function passwordStrength(password: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  meetsMinimum: boolean;
} {
  const hasLetter = /[A-Za-zא-ת]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9א-ת]/.test(password);
  const meetsMinimum = password.length >= 8 && hasLetter && hasDigit;

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (hasLetter && hasDigit) score += 1;
  if (hasSymbol || password.length >= 16) score += 1;

  if (!meetsMinimum) score = Math.min(score, 1);

  const labels = ['חלשה מאוד', 'חלשה', 'בינונית', 'טובה', 'חזקה מאוד'];
  return { score: score as 0 | 1 | 2 | 3 | 4, label: labels[score], meetsMinimum };
}
