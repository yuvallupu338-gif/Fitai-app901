'use server';

import { revalidatePath } from 'next/cache';
import { getScopedClient, requireProfessional, requireSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { commentSchema, postSchema } from '@/lib/validations';
import { fail, guard, ok, parseInput } from '@/lib/actions/result';
import type { ActionResult } from '@/types/app';

/** יצירה או עריכה של פוסט (עבודה) כולל המדיה שלו. */
export async function savePostAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const session = await requireSession();
    const { professionalId } = await requireProfessional();
    const parsed = parseInput(postSchema, input);
    if (!parsed.success) return parsed.result;

    if (!(await consumeRateLimit(RATE_LIMITS.post, session.user.id))) {
      return fail('פרסמת הרבה פוסטים בזמן קצר. אפשר לנסות שוב בעוד שעה.');
    }

    const data = parsed.data;
    const supabase = await getScopedClient();

    const values = {
      professional_id: professionalId,
      author_profile_id: session.user.id,
      service_id: data.serviceId ?? null,
      profession_id: data.professionId ?? null,
      city_id: data.cityId ?? session.user.cityId,
      title: data.title,
      description: data.description ?? null,
      tags: data.tags,
      price_estimate: data.priceEstimate ?? null,
      price_type: data.priceType,
      duration_minutes: data.durationMinutes ?? null,
      is_before_after: data.isBeforeAfter,
      consent_confirmed: data.consentConfirmed,
      status: data.status,
    };

    const { data: post, error } = data.id
      ? await supabase
          .from('professional_posts')
          .update(values)
          .eq('id', data.id)
          .eq('author_profile_id', session.user.id)
          .select('id')
          .single()
      : await supabase.from('professional_posts').insert(values).select('id').single();

    if (error || !post) throw new Error(error?.message ?? 'שמירת הפוסט נכשלה');

    // המדיה נכתבת מחדש בכל שמירה כדי לשמור על סדר עקבי.
    await supabase.from('post_media').delete().eq('post_id', post.id);
    const { error: mediaError } = await supabase.from('post_media').insert(
      data.media.map((m, index) => ({
        post_id: post.id,
        url: m.url,
        media_type: m.mediaType,
        thumbnail_url: m.thumbnailUrl ?? null,
        width: m.width ?? null,
        height: m.height ?? null,
        before_after_role: m.beforeAfterRole ?? null,
        alt_text: m.altText ?? null,
        position: index,
      })),
    );
    if (mediaError) throw new Error(mediaError.message);

    revalidatePath('/');
    revalidatePath(`/p/${post.id}`);
    revalidatePath(`/u/${session.user.username}`);

    return ok(
      { id: post.id },
      data.status === 'draft' ? 'הפוסט נשמר כטיוטה' : 'הפוסט פורסם ומופיע עכשיו בפיד',
    );
  });
}

export async function deletePostAction(postId: string): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const supabase = await getScopedClient();

    const { error } = await supabase
      .from('professional_posts')
      .update({ deleted_at: new Date().toISOString(), status: 'removed' })
      .eq('id', postId)
      .eq('author_profile_id', session.user.id);

    if (error) throw new Error(error.message);

    revalidatePath('/');
    revalidatePath(`/u/${session.user.username}`);
    return ok(undefined, 'הפוסט נמחק');
  });
}

/** הצמדת פוסט לראש הפרופיל (עד שלושה). */
export async function togglePinPostAction(postId: string, pin: boolean): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const { professionalId } = await requireProfessional();
    const supabase = await getScopedClient();

    if (!pin) {
      const { error } = await supabase
        .from('professional_posts')
        .update({ is_pinned: false, pinned_order: null })
        .eq('id', postId)
        .eq('author_profile_id', session.user.id);
      if (error) throw new Error(error.message);
      revalidatePath(`/u/${session.user.username}`);
      return ok(undefined, 'הפוסט הוסר מההצמדה');
    }

    const { data: pinned } = await supabase
      .from('professional_posts')
      .select('pinned_order')
      .eq('professional_id', professionalId)
      .eq('is_pinned', true)
      .is('deleted_at', null);

    const used = new Set((pinned ?? []).map((p) => p.pinned_order));
    const slot = [1, 2, 3].find((n) => !used.has(n));

    if (!slot) {
      return fail('אפשר להצמיד עד שלושה פוסטים. יש להסיר הצמדה מפוסט אחר קודם.');
    }

    const { error } = await supabase
      .from('professional_posts')
      .update({ is_pinned: true, pinned_order: slot })
      .eq('id', postId)
      .eq('author_profile_id', session.user.id);

    if (error) throw new Error(error.message);

    revalidatePath(`/u/${session.user.username}`);
    return ok(undefined, 'הפוסט הוצמד לראש הפרופיל');
  });
}

/** שינוי סדר תיק העבודות. */
export async function reorderPortfolioAction(orderedIds: string[]): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    await requireProfessional();
    const supabase = await getScopedClient();

    // הסדר נשמר באמצעות published_at כך שהפיד והפרופיל יציגו את אותו סדר.
    const base = Date.now();
    await Promise.all(
      orderedIds.map((id, index) =>
        supabase
          .from('professional_posts')
          .update({ published_at: new Date(base - index * 1000).toISOString() })
          .eq('id', id)
          .eq('author_profile_id', session.user.id),
      ),
    );

    revalidatePath(`/u/${session.user.username}`);
    return ok(undefined, 'סדר תיק העבודות עודכן');
  });
}

// ---------------------------------------------------------------------
// אינטראקציות
// ---------------------------------------------------------------------

export async function toggleLikeAction(postId: string, liked: boolean): Promise<ActionResult<{ liked: boolean }>> {
  return guard(async () => {
    const session = await requireSession();
    const supabase = await getScopedClient();

    if (liked) {
      const { error } = await supabase
        .from('post_likes')
        .insert({ post_id: postId, profile_id: session.user.id });
      // לייק כפול אינו שגיאה מבחינת המשתמש.
      if (error && !/duplicate key/.test(error.message)) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from('post_likes')
        .delete()
        .eq('post_id', postId)
        .eq('profile_id', session.user.id);
      if (error) throw new Error(error.message);
    }

    return ok({ liked });
  });
}

export async function toggleSavePostAction(postId: string, saved: boolean): Promise<ActionResult<{ saved: boolean }>> {
  return guard(async () => {
    const session = await requireSession();
    const supabase = await getScopedClient();

    if (saved) {
      const { error } = await supabase
        .from('saved_posts')
        .insert({ post_id: postId, profile_id: session.user.id });
      if (error && !/duplicate key/.test(error.message)) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from('saved_posts')
        .delete()
        .eq('post_id', postId)
        .eq('profile_id', session.user.id);
      if (error) throw new Error(error.message);
    }

    revalidatePath('/profile/saved');
    return ok({ saved }, saved ? 'הפוסט נשמר' : 'הפוסט הוסר מהשמורים');
  });
}

export async function addCommentAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const session = await requireSession();
    const parsed = parseInput(commentSchema, input);
    if (!parsed.success) return parsed.result;

    if (!(await consumeRateLimit(RATE_LIMITS.comment, session.user.id))) {
      return fail('שלחת הרבה תגובות בזמן קצר. אפשר לנסות שוב בעוד כמה דקות.');
    }

    const supabase = await getScopedClient();
    const { data, error } = await supabase
      .from('post_comments')
      .insert({
        post_id: parsed.data.postId,
        profile_id: session.user.id,
        parent_id: parsed.data.parentId ?? null,
        body: parsed.data.body,
      })
      .select('id')
      .single();

    if (error || !data) throw new Error(error?.message ?? 'שליחת התגובה נכשלה');

    revalidatePath(`/p/${parsed.data.postId}`);
    return ok({ id: data.id });
  });
}

export async function deleteCommentAction(commentId: string): Promise<ActionResult> {
  return guard(async () => {
    await requireSession();
    const supabase = await getScopedClient();

    const { error } = await supabase
      .from('post_comments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', commentId);

    if (error) throw new Error(error.message);
    return ok(undefined, 'התגובה נמחקה');
  });
}

/** רישום צפייה בפוסט – פעם ביום לכל צופה. */
export async function recordPostViewAction(postId: string): Promise<void> {
  try {
    const session = await requireSession();
    if (!session) return;
    const supabase = await getScopedClient();
    await supabase.rpc('record_post_view', { p_post_id: postId } as never);
  } catch {
    // צפיות אינן קריטיות – לא מפילים את הדף בגללן.
  }
}

/**
 * מונה שיתופים. מתבצע עם הרשאות שרת כי כל אחד יכול לשתף פוסט,
 * אך רק בעל הפוסט רשאי לערוך אותו – ולכן העדכון אינו יכול לעבור דרך RLS.
 */
export async function recordShareAction(postId: string): Promise<ActionResult> {
  return guard(async () => {
    const admin = createAdminClient();
    const { data } = await admin
      .from('professional_posts')
      .select('shares_count, status')
      .eq('id', postId)
      .maybeSingle();

    if (data && data.status === 'published') {
      await admin
        .from('professional_posts')
        .update({ shares_count: data.shares_count + 1 })
        .eq('id', postId);
    }

    return ok(undefined);
  });
}
