import 'server-only';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp } from '@/lib/auth/session';

export type RateLimitRule = {
  bucket: string;
  limit: number;
  windowSeconds: number;
};

/** מכסות לפעולות רגישות. השמירה מתבצעת במסד הנתונים כדי לעבוד גם בריבוי מופעים. */
export const RATE_LIMITS = {
  login: { bucket: 'login', limit: 10, windowSeconds: 15 * 60 },
  loginPerUser: { bucket: 'login_user', limit: 8, windowSeconds: 15 * 60 },
  register: { bucket: 'register', limit: 5, windowSeconds: 60 * 60 },
  recovery: { bucket: 'recovery', limit: 6, windowSeconds: 60 * 60 },
  message: { bucket: 'message', limit: 60, windowSeconds: 60 },
  post: { bucket: 'post', limit: 20, windowSeconds: 60 * 60 },
  comment: { bucket: 'comment', limit: 30, windowSeconds: 10 * 60 },
  booking: { bucket: 'booking', limit: 20, windowSeconds: 60 * 60 },
  upload: { bucket: 'upload', limit: 60, windowSeconds: 60 * 60 },
  report: { bucket: 'report', limit: 10, windowSeconds: 60 * 60 },
  follow: { bucket: 'follow', limit: 120, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitRule>;

/** נעילה זמנית לאחר ניסיונות התחברות כושלים. */
export const LOGIN_LOCK = { maxFailures: 5, lockMinutes: 15 } as const;

export async function getRequestIp(): Promise<string> {
  const headerList = await headers();
  return clientIp(headerList) ?? 'unknown';
}

/**
 * צורך יחידה מהמכסה. מחזיר true אם מותר להמשיך.
 * במקרה של תקלה בבדיקה – מאפשרים את הפעולה כדי לא לחסום משתמשים אמיתיים.
 */
export async function consumeRateLimit(rule: RateLimitRule, identifier?: string): Promise<boolean> {
  const id = identifier ?? (await getRequestIp());
  const admin = createAdminClient();

  const { data, error } = await admin.rpc('consume_rate_limit', {
    p_bucket: rule.bucket,
    p_identifier: id,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
  } as never);

  if (error) {
    console.error('[rate-limit] בדיקת מכסה נכשלה', error.message);
    return true;
  }

  return data !== false;
}

/** רושם ניסיון התחברות (מוצלח או כושל) לצורך היסטוריה וניטור. */
export async function logLoginAttempt(username: string, success: boolean, reason?: string) {
  const admin = createAdminClient();
  await admin.from('login_attempts').insert({
    username,
    success,
    reason: reason ?? null,
    ip_address: await getRequestIp(),
  });
}

/** מתעד אירוע אבטחה (שינוי סיסמה, החלפת קוד שחזור, מחיקת חשבון וכו'). */
export async function logSecurityEvent(
  profileId: string | null,
  event: string,
  details: Record<string, unknown> = {},
) {
  const headerList = await headers();
  const admin = createAdminClient();
  await admin.from('security_events').insert({
    profile_id: profileId,
    event,
    details: details as never,
    ip_address: clientIp(headerList),
    user_agent: headerList.get('user-agent')?.slice(0, 300) ?? null,
  });
}
