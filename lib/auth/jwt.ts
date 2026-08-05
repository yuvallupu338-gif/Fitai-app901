import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * חתימת אסימוני גישה ל־Supabase.
 *
 * האפליקציה מנהלת אימות משלה (שם משתמש + סיסמה) ולא Supabase Auth.
 * כדי ש־Row Level Security ו־Realtime יאכפו את ההרשאות בדיוק כמו במערכת
 * רגילה, אנחנו חותמים JWT באותו סוד של הפרויקט עם claim‏ sub = מזהה הפרופיל.
 * PostgREST מאמת את החתימה, ו־public.current_profile_id() קורא את ה־sub.
 */

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function getSecret(): string {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error(
      'חסר SUPABASE_JWT_SECRET. יש להעתיק אותו מ־Supabase → Project Settings → API → JWT Secret.',
    );
  }
  return secret;
}

export const SUPABASE_TOKEN_TTL_SECONDS = 60 * 60; // שעה

export type SupabaseTokenClaims = {
  sub: string;
  role: 'authenticated';
  aud: 'authenticated';
  iat: number;
  exp: number;
  app_role: string;
};

/** חותם אסימון גישה קצר־מועד עבור משתמש. */
export function signSupabaseToken(profileId: string, appRole = 'user'): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: SupabaseTokenClaims = {
    sub: profileId,
    role: 'authenticated',
    aud: 'authenticated',
    iat: now,
    exp: now + SUPABASE_TOKEN_TTL_SECONDS,
    app_role: appRole,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = base64url(createHmac('sha256', getSecret()).update(data).digest());

  return `${data}.${signature}`;
}

/** מאמת אסימון שחתמנו ומחזיר את התוכן, או null אם אינו תקין. */
export function verifySupabaseToken(token: string): SupabaseTokenClaims | null {
  try {
    const [encodedHeader, encodedPayload, signature] = token.split('.');
    if (!encodedHeader || !encodedPayload || !signature) return null;

    const expected = base64url(
      createHmac('sha256', getSecret()).update(`${encodedHeader}.${encodedPayload}`).digest(),
    );

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()) as SupabaseTokenClaims;
    if (payload.exp * 1000 < Date.now()) return null;

    return payload;
  } catch {
    return null;
  }
}
