import 'server-only';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

/**
 * פרמטרים לגזירת המפתח. ערכים אלו מאוזנים בין אבטחה לזמן תגובה בשרת.
 * שינוי הפרמטרים אינו שובר סיסמאות קיימות – הם נשמרים בתוך ה־hash עצמו.
 */
const PARAMS = { N: 16_384, r: 8, p: 1, keylen: 64 } as const;
const MAX_MEM = 256 * 1024 * 1024;

/**
 * יוצר hash לסיסמה בפורמט: scrypt$N$r$p$salt$hash
 * הסיסמה עצמה לעולם אינה נשמרת.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize('NFKC'), salt, PARAMS.keylen, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
    maxmem: MAX_MEM,
  });

  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), derived.toString('base64')].join('$');
}

/**
 * משווה סיסמה מול hash שמור. ההשוואה מתבצעת בזמן קבוע כדי למנוע דליפת מידע.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
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
