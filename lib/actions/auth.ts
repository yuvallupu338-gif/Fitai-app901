'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { issueRecoveryCode, verifyRecoveryCode } from '@/lib/auth/recovery';
import {
  createSession,
  destroySession,
  getSession,
  requireSession,
  revokeAllSessions,
} from '@/lib/auth/session';
import {
  consumeRateLimit,
  logLoginAttempt,
  logSecurityEvent,
  LOGIN_LOCK,
  RATE_LIMITS,
} from '@/lib/auth/rate-limit';
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  usernameSchema,
} from '@/lib/validations';
import { fail, guard, ok, parseInput } from '@/lib/actions/result';
import type { ActionResult } from '@/types/app';

/** בודק אם שם משתמש פנוי – נקרא מהטופס תוך כדי הקלדה. */
export async function checkUsernameAvailability(username: string): Promise<ActionResult<{ available: boolean }>> {
  return guard(async () => {
    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success) {
      return fail(parsed.error.errors[0]?.message ?? 'שם משתמש לא תקין');
    }

    const admin = createAdminClient();
    const { data } = await admin
      .from('usernames')
      .select('username')
      .ilike('username', parsed.data)
      .maybeSingle();

    return ok({ available: !data });
  });
}

/** מציג את שם המשתמש שייגזר מהשם — לתצוגה בטופס ההרשמה. */
export async function previewUsername(name: string): Promise<ActionResult<{ username: string }>> {
  return guard(async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('derive_username', { p_name: name });
    if (error || typeof data !== 'string') return fail('לא הצלחנו לגזור שם משתמש');
    return ok({ username: data });
  });
}

export type RegisterResult = {
  recoveryCode: string;
  username: string;
};

/** הרשמה ללא אימייל: שם מלא, שם משתמש, עיר וסיסמה. */
export async function registerAction(input: unknown): Promise<ActionResult<RegisterResult>> {
  return guard(async () => {
    const parsed = parseInput(registerSchema, input);
    if (!parsed.success) return parsed.result;

    if (!(await consumeRateLimit(RATE_LIMITS.register))) {
      return fail('בוצעו יותר מדי הרשמות מהכתובת הזו. נסו שוב בעוד שעה.');
    }

    const { fullName, cityId, password, avatarUrl, birthDate } = parsed.data;
    const admin = createAdminClient();

    // ההרשמה מבקשת שם וסיסמה בלבד. כשלא נשלח שם משתמש הוא נגזר מהשם
    // בתוך המסד, כך שבדיקת הייחודיות והיצירה קורות יחד.
    let username = parsed.data.username;

    if (!username) {
      const { data: derived, error: deriveError } = await admin
        .rpc('derive_username', { p_name: fullName });
      if (deriveError || typeof derived !== 'string') {
        throw new Error(deriveError?.message ?? 'גזירת שם המשתמש נכשלה');
      }
      username = derived;
    } else {
      const { data: taken } = await admin
        .from('usernames')
        .select('username')
        .ilike('username', username)
        .maybeSingle();

      if (taken) {
        return fail('שם המשתמש כבר תפוס', { username: ['שם המשתמש כבר תפוס'] });
      }
    }

    // העיר אינה חובה בהרשמה. אם נשלחה – היא חייבת להיות אמיתית.
    if (cityId) {
      const { data: city } = await admin.from('cities').select('id').eq('id', cityId).maybeSingle();
      if (!city) {
        return fail('יש לבחור עיר מהרשימה', { cityId: ['יש לבחור עיר מהרשימה'] });
      }
    }

    const bootstrapAdmin =
      process.env.ADMIN_BOOTSTRAP_USERNAME &&
      process.env.ADMIN_BOOTSTRAP_USERNAME.toLowerCase() === username.toLowerCase();

    const { data: profile, error } = await admin
      .from('profiles')
      .insert({
        username,
        full_name: fullName,
        city_id: cityId ?? null,
        password_hash: await hashPassword(password),
        avatar_url: avatarUrl ?? null,
        birth_date: birthDate || null,
        role: bootstrapAdmin ? 'admin' : 'user',
      })
      .select('id, username')
      .single();

    if (error || !profile) {
      throw new Error(error?.message ?? 'יצירת המשתמש נכשלה');
    }

    const recoveryCode = await issueRecoveryCode(profile.id);

    await createSession(profile.id, true);
    await logLoginAttempt(username, true, 'register');
    await logSecurityEvent(profile.id, 'account_created', { username });

    // בכוונה לא מבצעים כאן revalidate של ה־layout: המשתמש כבר מחובר,
    // וריענון היה מפעיל את ההפניה שב־(auth)/layout ומקפיץ אותו מהמסך
    // שבו מוצג קוד השחזור – הקוד מוצג פעם אחת בלבד.
    return ok({ recoveryCode, username: profile.username }, 'ברוכים הבאים!');
  });
}

/** התחברות עם שם משתמש וסיסמה, כולל נעילה זמנית לאחר ניסיונות כושלים. */
export async function loginAction(input: unknown): Promise<ActionResult<{ redirectTo: string }>> {
  return guard(async () => {
    const parsed = parseInput(loginSchema, input);
    if (!parsed.success) return parsed.result;

    const { username, password, remember } = parsed.data;

    if (!(await consumeRateLimit(RATE_LIMITS.login))) {
      return fail('בוצעו יותר מדי ניסיונות התחברות. נסו שוב בעוד רבע שעה.');
    }
    if (!(await consumeRateLimit(RATE_LIMITS.loginPerUser, username.toLowerCase()))) {
      return fail('החשבון ננעל זמנית בעקבות ניסיונות מרובים. נסו שוב בעוד רבע שעה.');
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('id, username, password_hash, status, failed_login_count, locked_until, deleted_at')
      .ilike('username', username)
      .maybeSingle();

    const genericError = 'שם המשתמש או הסיסמה שגויים';

    if (!profile || profile.deleted_at) {
      await logLoginAttempt(username, false, 'unknown_user');
      return fail(genericError);
    }

    if (profile.locked_until && new Date(profile.locked_until) > new Date()) {
      const minutes = Math.max(
        1,
        Math.ceil((new Date(profile.locked_until).getTime() - Date.now()) / 60000),
      );
      await logLoginAttempt(username, false, 'locked');
      return fail(`החשבון נעול זמנית. אפשר לנסות שוב בעוד ${minutes} דקות.`);
    }

    if (profile.status === 'banned') {
      await logLoginAttempt(username, false, 'banned');
      return fail('החשבון חסום. לפרטים נוספים אפשר לפנות לתמיכה.');
    }
    if (profile.status === 'suspended') {
      await logLoginAttempt(username, false, 'suspended');
      return fail('החשבון מושעה זמנית.');
    }

    const valid = await verifyPassword(password, profile.password_hash);

    if (!valid) {
      const failures = profile.failed_login_count + 1;
      const shouldLock = failures >= LOGIN_LOCK.maxFailures;

      await admin
        .from('profiles')
        .update({
          failed_login_count: failures,
          locked_until: shouldLock
            ? new Date(Date.now() + LOGIN_LOCK.lockMinutes * 60_000).toISOString()
            : null,
        })
        .eq('id', profile.id);

      await logLoginAttempt(username, false, 'bad_password');

      if (shouldLock) {
        await logSecurityEvent(profile.id, 'account_locked', { failures });
        return fail(`החשבון ננעל למשך ${LOGIN_LOCK.lockMinutes} דקות בעקבות ניסיונות כושלים.`);
      }

      const left = LOGIN_LOCK.maxFailures - failures;
      return fail(`${genericError}. נותרו ${left} ניסיונות לפני נעילה זמנית.`);
    }

    await admin
      .from('profiles')
      .update({ failed_login_count: 0, locked_until: null, last_seen_at: new Date().toISOString() })
      .eq('id', profile.id);

    await createSession(profile.id, remember);
    await logLoginAttempt(username, true);
    await logSecurityEvent(profile.id, 'login');

    revalidatePath('/', 'layout');
    return ok({ redirectTo: '/' });
  });
}

export async function logoutAction() {
  const session = await getSession();
  if (session) {
    await logSecurityEvent(session.user.id, 'logout');
  }
  await destroySession();
  revalidatePath('/', 'layout');
  redirect('/login');
}

/** שינוי סיסמה מתוך ההגדרות. מנתק את שאר המכשירים. */
export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const parsed = parseInput(changePasswordSchema, input);
    if (!parsed.success) return parsed.result;

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('password_hash')
      .eq('id', session.user.id)
      .single();

    if (!profile || !(await verifyPassword(parsed.data.currentPassword, profile.password_hash))) {
      return fail('הסיסמה הנוכחית שגויה', { currentPassword: ['הסיסמה הנוכחית שגויה'] });
    }

    await admin
      .from('profiles')
      .update({
        password_hash: await hashPassword(parsed.data.newPassword),
        password_updated_at: new Date().toISOString(),
      })
      .eq('id', session.user.id);

    await revokeAllSessions(session.user.id, session.sessionId);
    await logSecurityEvent(session.user.id, 'password_changed');

    return ok(undefined, 'הסיסמה עודכנה. שאר המכשירים נותקו.');
  });
}

/** איפוס סיסמה באמצעות שם משתמש וקוד שחזור (במקום אימייל). */
export async function resetPasswordAction(input: unknown): Promise<ActionResult<{ recoveryCode: string }>> {
  return guard(async () => {
    const parsed = parseInput(resetPasswordSchema, input);
    if (!parsed.success) return parsed.result;

    if (!(await consumeRateLimit(RATE_LIMITS.recovery))) {
      return fail('בוצעו יותר מדי ניסיונות שחזור. נסו שוב מאוחר יותר.');
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('id, status')
      .ilike('username', parsed.data.username)
      .maybeSingle();

    if (!profile) {
      return fail('שם המשתמש או קוד השחזור שגויים');
    }

    const valid = await verifyRecoveryCode(profile.id, parsed.data.recoveryCode, true);
    if (!valid) {
      await logSecurityEvent(profile.id, 'recovery_failed');
      return fail('שם המשתמש או קוד השחזור שגויים');
    }

    await admin
      .from('profiles')
      .update({
        password_hash: await hashPassword(parsed.data.newPassword),
        password_updated_at: new Date().toISOString(),
        failed_login_count: 0,
        locked_until: null,
      })
      .eq('id', profile.id);

    await revokeAllSessions(profile.id);
    await logSecurityEvent(profile.id, 'password_reset');

    // קוד השחזור נוצל – מנפיקים חדש ומציגים אותו פעם אחת.
    const recoveryCode = await issueRecoveryCode(profile.id);

    return ok({ recoveryCode }, 'הסיסמה אופסה בהצלחה');
  });
}

/** יצירת קוד שחזור חדש מתוך ההגדרות (מבטל את הקודם). */
export async function regenerateRecoveryCodeAction(
  currentPassword: string,
): Promise<ActionResult<{ recoveryCode: string }>> {
  return guard(async () => {
    const session = await requireSession();

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('password_hash')
      .eq('id', session.user.id)
      .single();

    if (!profile || !(await verifyPassword(currentPassword, profile.password_hash))) {
      return fail('הסיסמה שגויה', { currentPassword: ['הסיסמה שגויה'] });
    }

    const recoveryCode = await issueRecoveryCode(session.user.id);
    await logSecurityEvent(session.user.id, 'recovery_code_replaced');

    return ok({ recoveryCode }, 'נוצר קוד שחזור חדש. הקוד הקודם בוטל.');
  });
}

/** ניתוק סשן מסוים מרשימת ההתחברויות. */
export async function revokeSessionAction(sessionId: string): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const admin = createAdminClient();

    const { error } = await admin
      .from('auth_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('profile_id', session.user.id);

    if (error) throw new Error(error.message);

    revalidatePath('/settings/security');
    return ok(undefined, 'המכשיר נותק');
  });
}
