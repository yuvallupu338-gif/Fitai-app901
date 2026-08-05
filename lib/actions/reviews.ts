'use server';

import { revalidatePath } from 'next/cache';
import { getScopedClient, requireProfessional, requireSession } from '@/lib/auth/session';
import { reviewReplySchema, reviewSchema } from '@/lib/validations';
import { guard, ok, parseInput, fail } from '@/lib/actions/result';
import type { ActionResult } from '@/types/app';

/** כתיבת ביקורת – אפשרית רק לאחר הזמנה שסומנה כהושלמה. */
export async function submitReviewAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const session = await requireSession();
    const parsed = parseInput(reviewSchema, input);
    if (!parsed.success) return parsed.result;

    const supabase = await getScopedClient();

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, client_id, professional_id, service_id, status')
      .eq('id', parsed.data.bookingId)
      .maybeSingle();

    if (!booking || booking.client_id !== session.user.id) {
      return fail('ההזמנה לא נמצאה');
    }
    if (booking.status !== 'completed') {
      return fail('אפשר לכתוב ביקורת רק לאחר שהטיפול סומן כהושלם');
    }

    const { data, error } = await supabase
      .from('reviews')
      .insert({
        booking_id: booking.id,
        professional_id: booking.professional_id,
        client_id: session.user.id,
        service_id: booking.service_id,
        rating: parsed.data.rating,
        body: parsed.data.body ?? null,
        image_urls: parsed.data.imageUrls,
      })
      .select('id')
      .single();

    if (error || !data) throw new Error(error?.message ?? 'שמירת הביקורת נכשלה');

    revalidatePath('/dashboard/bookings');
    revalidatePath('/profile/reviews');
    return ok({ id: data.id }, 'תודה! הביקורת פורסמה.');
  });
}

export async function updateReviewAction(
  reviewId: string,
  rating: number,
  body: string | null,
): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const supabase = await getScopedClient();

    const { error } = await supabase
      .from('reviews')
      .update({ rating, body })
      .eq('id', reviewId)
      .eq('client_id', session.user.id);

    if (error) throw new Error(error.message);

    revalidatePath('/profile/reviews');
    return ok(undefined, 'הביקורת עודכנה');
  });
}

export async function deleteReviewAction(reviewId: string): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const supabase = await getScopedClient();

    const { error } = await supabase
      .from('reviews')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', reviewId)
      .eq('client_id', session.user.id);

    if (error) throw new Error(error.message);

    revalidatePath('/profile/reviews');
    return ok(undefined, 'הביקורת נמחקה');
  });
}

/** תגובת בעל המקצוע – אחת לכל ביקורת. */
export async function replyToReviewAction(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    const { professionalId } = await requireProfessional();
    const parsed = parseInput(reviewReplySchema, input);
    if (!parsed.success) return parsed.result;

    const supabase = await getScopedClient();
    const { error } = await supabase.from('review_replies').insert({
      review_id: parsed.data.reviewId,
      professional_id: professionalId,
      body: parsed.data.body,
    });

    if (error) {
      if (/review_replies_review_id_key/.test(error.message)) {
        return fail('כבר הגבת לביקורת הזו');
      }
      throw new Error(error.message);
    }

    revalidatePath('/dashboard/pro/reviews');
    return ok(undefined, 'התגובה פורסמה');
  });
}
