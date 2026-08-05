'use server';

import { revalidatePath } from 'next/cache';
import { getScopedClient, requireSession } from '@/lib/auth/session';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { reportSchema, savedSearchSchema } from '@/lib/validations';
import { fail, guard, ok, parseInput } from '@/lib/actions/result';
import type { ActionResult } from '@/types/app';

export async function toggleFollowAction(
  targetProfileId: string,
  follow: boolean,
): Promise<ActionResult<{ following: boolean }>> {
  return guard(async () => {
    const session = await requireSession();

    if (targetProfileId === session.user.id) {
      return fail('אי אפשר לעקוב אחרי עצמך');
    }
    if (!(await consumeRateLimit(RATE_LIMITS.follow, session.user.id))) {
      return fail('בוצעו יותר מדי פעולות מעקב. אפשר לנסות שוב מאוחר יותר.');
    }

    const supabase = await getScopedClient();

    if (follow) {
      const { error } = await supabase
        .from('follows')
        .insert({ follower_id: session.user.id, following_id: targetProfileId });
      if (error && !/duplicate key/.test(error.message)) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', session.user.id)
        .eq('following_id', targetProfileId);
      if (error) throw new Error(error.message);
    }

    revalidatePath('/');
    return ok({ following: follow });
  });
}

export async function toggleSaveProfessionalAction(
  professionalId: string,
  saved: boolean,
): Promise<ActionResult<{ saved: boolean }>> {
  return guard(async () => {
    const session = await requireSession();
    const supabase = await getScopedClient();

    if (saved) {
      const { error } = await supabase
        .from('saved_professionals')
        .insert({ professional_id: professionalId, profile_id: session.user.id });
      if (error && !/duplicate key/.test(error.message)) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from('saved_professionals')
        .delete()
        .eq('professional_id', professionalId)
        .eq('profile_id', session.user.id);
      if (error) throw new Error(error.message);
    }

    revalidatePath('/profile/saved');
    return ok({ saved }, saved ? 'בעל המקצוע נשמר' : 'הוסר מהשמורים');
  });
}

export async function toggleBlockUserAction(
  targetProfileId: string,
  block: boolean,
): Promise<ActionResult<{ blocked: boolean }>> {
  return guard(async () => {
    const session = await requireSession();
    if (targetProfileId === session.user.id) return fail('אי אפשר לחסום את עצמך');

    const supabase = await getScopedClient();

    if (block) {
      const { error } = await supabase
        .from('blocked_users')
        .insert({ blocker_id: session.user.id, blocked_id: targetProfileId });
      if (error && !/duplicate key/.test(error.message)) throw new Error(error.message);

      // חסימה מבטלת מעקב הדדי.
      await supabase
        .from('follows')
        .delete()
        .or(
          `and(follower_id.eq.${session.user.id},following_id.eq.${targetProfileId}),and(follower_id.eq.${targetProfileId},following_id.eq.${session.user.id})`,
        );
    } else {
      const { error } = await supabase
        .from('blocked_users')
        .delete()
        .eq('blocker_id', session.user.id)
        .eq('blocked_id', targetProfileId);
      if (error) throw new Error(error.message);
    }

    revalidatePath('/', 'layout');
    return ok({ blocked: block }, block ? 'המשתמש נחסם' : 'החסימה הוסרה');
  });
}

export async function reportAction(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const parsed = parseInput(reportSchema, input);
    if (!parsed.success) return parsed.result;

    if (!(await consumeRateLimit(RATE_LIMITS.report, session.user.id))) {
      return fail('שלחת הרבה דיווחים בזמן קצר. אפשר לנסות שוב מאוחר יותר.');
    }

    const supabase = await getScopedClient();
    const { error } = await supabase.from('reports').insert({
      reporter_id: session.user.id,
      target_type: parsed.data.targetType,
      target_id: parsed.data.targetId,
      reason: parsed.data.reason,
      details: parsed.data.details ?? null,
    });

    if (error) {
      if (/reports_unique_open/.test(error.message)) {
        return ok(undefined, 'כבר שלחת דיווח על הפריט הזה. הצוות בודק אותו.');
      }
      throw new Error(error.message);
    }

    return ok(undefined, 'הדיווח נשלח לצוות. תודה שעזרת לשמור על הקהילה.');
  });
}

/** רישום צפייה בפרופיל מקצועי (פעם ביום לכל צופה). */
export async function recordProfileViewAction(professionalId: string): Promise<void> {
  try {
    const supabase = await getScopedClient();
    await supabase.rpc('record_profile_view', { p_professional_id: professionalId } as never);
  } catch {
    // מדד בלבד – לא מפילים את הדף.
  }
}

// ---------------------------------------------------------------------
// חיפושים שמורים
// ---------------------------------------------------------------------

export async function saveSearchAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const session = await requireSession();
    const parsed = parseInput(savedSearchSchema, input);
    if (!parsed.success) return parsed.result;

    const supabase = await getScopedClient();
    const { data, error } = await supabase
      .from('saved_searches')
      .insert({
        profile_id: session.user.id,
        name: parsed.data.name,
        query: parsed.data.query as never,
        notify_on_match: parsed.data.notifyOnMatch,
      })
      .select('id')
      .single();

    if (error || !data) throw new Error(error?.message ?? 'שמירת החיפוש נכשלה');

    revalidatePath('/search');
    return ok(
      { id: data.id },
      parsed.data.notifyOnMatch
        ? 'החיפוש נשמר. נעדכן אותך כשיצטרף בעל מקצוע מתאים.'
        : 'החיפוש נשמר',
    );
  });
}

export async function deleteSavedSearchAction(id: string): Promise<ActionResult> {
  return guard(async () => {
    await requireSession();
    const supabase = await getScopedClient();
    const { error } = await supabase.from('saved_searches').delete().eq('id', id);
    if (error) throw new Error(error.message);

    revalidatePath('/search');
    return ok(undefined, 'החיפוש השמור נמחק');
  });
}

/** רישום מונח חיפוש – מזין את "חיפושים אחרונים" ואת "חיפושים פופולריים". */
export async function logSearchAction(term: string, resultsCount: number): Promise<void> {
  try {
    const supabase = await getScopedClient();
    await supabase.rpc('log_search', { p_term: term, p_results: resultsCount } as never);
  } catch {
    // לא קריטי.
  }
}

export async function clearSearchHistoryAction(): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const supabase = await getScopedClient();
    const { error } = await supabase.from('search_history').delete().eq('profile_id', session.user.id);
    if (error) throw new Error(error.message);

    revalidatePath('/search');
    return ok(undefined, 'היסטוריית החיפוש נמחקה');
  });
}
