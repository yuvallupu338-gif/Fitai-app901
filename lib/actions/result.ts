import 'server-only';
import { ZodError, type ZodType, type ZodTypeDef } from 'zod';
import type { ActionResult } from '@/types/app';
import { AuthError } from '@/lib/auth/session';

export function ok<T = undefined>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: string, fieldErrors?: Record<string, string[]>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/**
 * מאמת קלט מול סכימת Zod ומחזיר שגיאות לפי שדה.
 * שלושת הפרמטרים הגנריים נדרשים כדי שערכי ברירת מחדל (‎.default()‎)
 * יוחזרו כערכים ודאיים ולא כ־undefined.
 */
export function parseInput<TOut, TDef extends ZodTypeDef, TIn>(
  schema: ZodType<TOut, TDef, TIn>,
  input: unknown,
): { success: true; data: TOut } | { success: false; result: ActionResult<never> } {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return { success: true, data: parsed.data };
  }

  const flattened = parsed.error.flatten();
  const fieldErrors = flattened.fieldErrors as Record<string, string[] | undefined>;
  const firstError =
    Object.values(fieldErrors).flat().find((message): message is string => Boolean(message)) ??
    flattened.formErrors[0] ??
    'הנתונים שהוזנו אינם תקינים';

  return {
    success: false,
    result: fail(firstError, fieldErrors as Record<string, string[]>),
  };
}

/** תרגום שגיאות Postgres נפוצות להודעות ברורות בעברית. */
export function translateDbError(message: string): string {
  const map: Array<[RegExp, string]> = [
    [/duplicate key value.*usernames_pkey|profiles_username_key/i, 'שם המשתמש כבר תפוס'],
    [/bookings_no_overlap|exclusion/i, 'המועד הזה כבר תפוס ביומן של בעל המקצוע'],
    [/reports_unique_open/i, 'כבר שלחת דיווח על הפריט הזה'],
    [/posts_pinned_unique/i, 'אפשר להצמיד עד שלושה פוסטים'],
    [/service_addresses_one_default/i, 'כבר קיימת כתובת ברירת מחדל'],
    [/profession_requests_pending_unique/i, 'כבר קיימת בקשה ממתינה למקצוע דומה'],
    [/reviews_booking_id_key/i, 'כבר כתבת ביקורת על הטיפול הזה'],
    [/review_replies_review_id_key/i, 'כבר הגבת לביקורת הזו'],
    [/violates row-level security/i, 'אין לך הרשאה לבצע את הפעולה הזו'],
    [/violates foreign key/i, 'אחד הפריטים שנבחרו כבר לא קיים'],
    [/duplicate key value/i, 'הפריט כבר קיים'],
  ];

  for (const [pattern, translation] of map) {
    if (pattern.test(message)) return translation;
  }

  // הודעות שאנחנו עצמנו זורקים מהמסד כבר בעברית.
  if (/[א-ת]/.test(message)) return message;

  return 'הפעולה נכשלה. אפשר לנסות שוב.';
}

/** עוטף Server Action ומחזיר תמיד ActionResult במקום לזרוק חריגה. */
export async function guard<T>(handler: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.message);
    }
    if (error instanceof ZodError) {
      const flattened = error.flatten();
      return fail(
        Object.values(flattened.fieldErrors).flat()[0] ?? 'הנתונים שהוזנו אינם תקינים',
        flattened.fieldErrors as Record<string, string[]>,
      );
    }
    if (error instanceof Error) {
      // שגיאת ניווט של Next (redirect) חייבת להמשיך להיזרק.
      if ('digest' in error && typeof error.digest === 'string' && error.digest.startsWith('NEXT_')) {
        throw error;
      }
      console.error('[action]', error);
      return fail(translateDbError(error.message));
    }
    console.error('[action] שגיאה לא צפויה', error);
    return fail('אירעה שגיאה בלתי צפויה');
  }
}
