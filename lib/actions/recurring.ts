'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getScopedClient, requireProfessional, requireSession } from '@/lib/auth/session';
import { seriesSchema } from '@/lib/validations';
import { fail, guard, ok, parseInput } from '@/lib/actions/result';
import { FREQUENCY_WEEKS } from '@/lib/constants';
import type { ActionResult, SeriesPreviewDate } from '@/types/app';

/** תצוגה מקדימה של כל המועדים הצפויים – לפני יצירת הסדרה. */
export async function previewSeriesDatesAction(input: {
  startDate: string;
  weekday: number;
  startTime: string;
  frequency: string;
  intervalWeeks: number;
  endDate?: string | null;
  occurrences?: number | null;
}): Promise<ActionResult<SeriesPreviewDate[]>> {
  return guard(async () => {
    const supabase = await getScopedClient();

    const { data, error } = await supabase.rpc('preview_series_dates', {
      p_start_date: input.startDate,
      p_weekday: input.weekday,
      p_start_time: input.startTime,
      p_frequency: input.frequency,
      p_interval_weeks: input.intervalWeeks,
      p_end_date: input.endDate ?? null,
      p_count: input.occurrences ?? null,
    } as never);

    if (error) throw new Error(error.message);
    return ok((data ?? []) as unknown as SeriesPreviewDate[]);
  });
}

/**
 * יצירת סדרת מפגשים קבועה.
 * הסדרה נשמרת כ"ממתינה" ומחכה לאישור בעל המקצוע – לא נוצרים מפגשים לפני כן.
 */
export async function createSeriesAction(input: unknown): Promise<ActionResult<{ id: string; conflicts: number }>> {
  return guard(async () => {
    const session = await requireSession();
    const parsed = parseInput(seriesSchema, input);
    if (!parsed.success) return parsed.result;

    const data = parsed.data;
    const supabase = await getScopedClient();

    const { data: service } = await supabase
      .from('professional_services')
      .select('id, duration_minutes, price_min, price_type, supports_recurring, professional_id')
      .eq('id', data.serviceId)
      .eq('professional_id', data.professionalId)
      .maybeSingle();

    if (!service) return fail('השירות שנבחר אינו זמין');
    if (!service.supports_recurring) return fail('השירות הזה אינו זמין כמפגש קבוע');

    if (data.locationType === 'client_home' && session.user.isMinor && !session.user.guardianApproved) {
      return fail('סדרת ביקורי בית עבור משתמש מתחת לגיל 18 מחייבת אישור הורה או אחראי בהגדרות.');
    }

    const { data: professional } = await supabase
      .from('professional_profiles')
      .select('profile_id, travel_fee, travel_fee_type')
      .eq('id', data.professionalId)
      .single();

    const { data: conversationId } = await supabase.rpc('get_or_create_direct_conversation', {
      p_other: professional!.profile_id,
    } as never);

    const { data: series, error } = await supabase
      .from('recurring_booking_series')
      .insert({
        client_id: session.user.id,
        professional_id: data.professionalId,
        service_id: data.serviceId,
        address_id: data.addressId ?? null,
        conversation_id: (conversationId as unknown as string) ?? null,
        location_type: data.locationType,
        frequency: data.frequency,
        interval_weeks:
          data.frequency === 'custom'
            ? data.intervalWeeks
            : FREQUENCY_WEEKS[data.frequency as keyof typeof FREQUENCY_WEEKS],
        weekday: data.weekday,
        start_time: data.startTime,
        duration_minutes: service.duration_minutes,
        start_date: data.startDate,
        end_date: data.endDate || null,
        planned_occurrences: data.plannedOccurrences ?? null,
        price_amount: data.priceAmount ?? service.price_min,
        travel_fee:
          data.locationType === 'client_home' && professional?.travel_fee_type !== 'none'
            ? Number(professional?.travel_fee ?? 0)
            : 0,
        notes: data.notes ?? null,
        approval_mode: data.approvalMode,
        status: 'pending',
        client_approved_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error || !series) throw new Error(error?.message ?? 'יצירת הסדרה נכשלה');

    // יצירת המופעים המתוכננים (עדיין לא הזמנות).
    const { error: genError } = await supabase.rpc('generate_series_occurrences', {
      p_series_id: series.id,
    } as never);
    if (genError) throw new Error(genError.message);

    // הסרת מועדים שהמשתמש ביקש לדלג עליהם.
    if (data.skipSequences.length > 0) {
      await supabase
        .from('recurring_booking_occurrences')
        .update({ status: 'skipped', note: 'הוסר על ידי הלקוח לפני האישור' })
        .eq('series_id', series.id)
        .in('sequence', data.skipSequences);
    }

    // בדיקת התנגשויות לצורך הצגה למשתמש (לא חוסמת).
    const { data: occurrences } = await supabase
      .from('recurring_booking_occurrences')
      .select('scheduled_start')
      .eq('series_id', series.id)
      .eq('status', 'planned');

    let conflicts = 0;
    for (const occurrence of occurrences ?? []) {
      const { data: check } = await supabase.rpc('check_booking_slot', {
        p_professional_id: data.professionalId,
        p_start: occurrence.scheduled_start,
        p_duration_minutes: service.duration_minutes,
        p_buffer_minutes: 0,
      } as never);
      if (!(check as unknown as { ok: boolean })?.ok) conflicts += 1;
    }

    revalidatePath('/dashboard/recurring');
    return ok(
      { id: series.id, conflicts },
      'הבקשה למפגשים קבועים נשלחה. הסדרה תיכנס לתוקף לאחר אישור בעל המקצוע.',
    );
  });
}

/** אישור הסדרה על ידי בעל המקצוע – רק אז נוצרים המפגשים בפועל. */
export async function approveSeriesAction(seriesId: string): Promise<ActionResult<{ created: number }>> {
  return guard(async () => {
    const { professionalId } = await requireProfessional();
    const supabase = await getScopedClient();

    const { data: series } = await supabase
      .from('recurring_booking_series')
      .select('id, professional_id, client_approved_at, status')
      .eq('id', seriesId)
      .maybeSingle();

    if (!series || series.professional_id !== professionalId) return fail('הסדרה לא נמצאה');
    if (!series.client_approved_at) return fail('הלקוח עדיין לא אישר את הסדרה');

    const { error } = await supabase
      .from('recurring_booking_series')
      .update({ professional_approved_at: new Date().toISOString() })
      .eq('id', seriesId);

    if (error) throw new Error(error.message);

    const { data: created, error: matError } = await supabase.rpc('materialize_series_bookings', {
      p_series_id: seriesId,
    } as never);

    if (matError) throw new Error(matError.message);

    revalidatePath('/dashboard/pro/recurring');
    revalidatePath('/dashboard/recurring');

    const count = Number(created ?? 0);
    return ok({ created: count }, `הסדרה אושרה ונוצרו ${count} מפגשים ביומן`);
  });
}

/** השהיה, חידוש, ביטול או סיום של סדרה. */
export async function updateSeriesStatusAction(
  seriesId: string,
  status: 'active' | 'paused' | 'cancelled' | 'completed',
): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const supabase = await getScopedClient();

    const { data: series } = await supabase
      .from('recurring_booking_series')
      .select('id, client_id, professional_id, client_approved_at, professional_approved_at')
      .eq('id', seriesId)
      .maybeSingle();

    if (!series) return fail('הסדרה לא נמצאה');

    if (status === 'active' && (!series.client_approved_at || !series.professional_approved_at)) {
      return fail('אי אפשר להפעיל סדרה לפני אישור שני הצדדים');
    }

    const { error } = await supabase
      .from('recurring_booking_series')
      .update({
        status,
        cancelled_by: status === 'cancelled' ? session.user.id : null,
        completed_at: status === 'completed' ? new Date().toISOString() : null,
      })
      .eq('id', seriesId);

    if (error) throw new Error(error.message);

    // ביטול סדרה מבטל את כל המפגשים העתידיים שטרם התקיימו.
    if (status === 'cancelled') {
      await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_by: session.user.id,
          cancel_reason: 'הסדרה הקבועה בוטלה',
        })
        .eq('series_id', seriesId)
        .gt('scheduled_start', new Date().toISOString())
        .in('status', ['pending', 'confirmed', 'change_proposed']);
    }

    // הפעלה מחדש יוצרת מפגשים עתידיים חדשים במקום אלו שחלפו.
    if (status === 'active') {
      await supabase.rpc('generate_series_occurrences', { p_series_id: seriesId } as never);
      await supabase.rpc('materialize_series_bookings', { p_series_id: seriesId } as never);
    }

    revalidatePath('/dashboard/recurring');
    revalidatePath('/dashboard/pro/recurring');

    const messages = {
      active: 'הסדרה הופעלה מחדש',
      paused: 'הסדרה הושהתה. המפגשים העתידיים נשמרו.',
      cancelled: 'הסדרה בוטלה וכל המפגשים העתידיים בוטלו',
      completed: 'הסדרה סומנה כהסתיימה',
    } as const;

    return ok(undefined, messages[status]);
  });
}

/** דילוג על מפגש בודד בסדרה, בלי לשנות את שאר הסדרה. */
export async function skipOccurrenceAction(occurrenceId: string): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const supabase = await getScopedClient();

    const { data: occurrence } = await supabase
      .from('recurring_booking_occurrences')
      .select('id, booking_id, series_id')
      .eq('id', occurrenceId)
      .maybeSingle();

    if (!occurrence) return fail('המפגש לא נמצא');

    if (occurrence.booking_id) {
      const { error } = await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_by: session.user.id,
          cancel_reason: 'המפגש דולג בסדרה הקבועה',
        })
        .eq('id', occurrence.booking_id);
      if (error) throw new Error(error.message);
    }

    const { error } = await supabase
      .from('recurring_booking_occurrences')
      .update({ status: 'skipped' })
      .eq('id', occurrenceId);

    if (error) throw new Error(error.message);

    revalidatePath('/dashboard/recurring');
    return ok(undefined, 'המפגש דולג. שאר הסדרה נשארה ללא שינוי.');
  });
}

/**
 * שינוי מועד של מפגש בודד, או של כל המפגשים העתידיים.
 * ברירת המחדל היא מפגש בודד – שינוי הסדרה כולה מחייב בחירה מפורשת.
 */
export async function moveOccurrenceAction(
  occurrenceId: string,
  newStartIso: string,
  applyToFuture = false,
): Promise<ActionResult<{ moved: number }>> {
  return guard(async () => {
    await requireSession();
    const supabase = await getScopedClient();
    const admin = createAdminClient();

    const { data: occurrence } = await supabase
      .from('recurring_booking_occurrences')
      .select('id, booking_id, series_id, sequence, scheduled_start')
      .eq('id', occurrenceId)
      .maybeSingle();

    if (!occurrence) return fail('המפגש לא נמצא');

    const { data: series } = await supabase
      .from('recurring_booking_series')
      .select('id, professional_id, service_id, duration_minutes, client_id')
      .eq('id', occurrence.series_id)
      .maybeSingle();

    if (!series) return fail('הסדרה לא נמצאה');

    const newStart = new Date(newStartIso);

    const { data: check } = await supabase.rpc('check_booking_slot', {
      p_professional_id: series.professional_id,
      p_start: newStart.toISOString(),
      p_duration_minutes: series.duration_minutes,
      p_buffer_minutes: 0,
      p_exclude_booking_id: occurrence.booking_id,
    } as never);

    if (!(check as unknown as { ok: boolean })?.ok) {
      return fail('המועד החדש אינו פנוי ביומן של בעל המקצוע');
    }

    const newEnd = new Date(newStart.getTime() + series.duration_minutes * 60_000);

    await supabase
      .from('recurring_booking_occurrences')
      .update({
        scheduled_start: newStart.toISOString(),
        scheduled_date: newStart.toISOString().slice(0, 10),
        status: occurrence.booking_id ? 'booked' : 'moved',
      })
      .eq('id', occurrenceId);

    if (occurrence.booking_id) {
      await supabase
        .from('bookings')
        .update({ scheduled_start: newStart.toISOString(), scheduled_end: newEnd.toISOString() })
        .eq('id', occurrence.booking_id);
    }

    let moved = 1;

    if (applyToFuture) {
      // הזזת שאר המפגשים באותו הפרש זמן, בהתאם לאישור מפורש של המשתמש.
      const shiftMs = newStart.getTime() - new Date(occurrence.scheduled_start).getTime();

      const { data: future } = await admin
        .from('recurring_booking_occurrences')
        .select('id, booking_id, scheduled_start')
        .eq('series_id', occurrence.series_id)
        .gt('sequence', occurrence.sequence)
        .in('status', ['planned', 'booked']);

      for (const item of future ?? []) {
        const shifted = new Date(new Date(item.scheduled_start).getTime() + shiftMs);
        await admin
          .from('recurring_booking_occurrences')
          .update({
            scheduled_start: shifted.toISOString(),
            scheduled_date: shifted.toISOString().slice(0, 10),
          })
          .eq('id', item.id);

        if (item.booking_id) {
          await admin
            .from('bookings')
            .update({
              scheduled_start: shifted.toISOString(),
              scheduled_end: new Date(shifted.getTime() + series.duration_minutes * 60_000).toISOString(),
            })
            .eq('id', item.booking_id);
        }
        moved += 1;
      }

      await admin
        .from('recurring_booking_series')
        .update({ start_time: newStart.toTimeString().slice(0, 5), weekday: newStart.getDay() })
        .eq('id', occurrence.series_id);
    }

    revalidatePath('/dashboard/recurring');
    revalidatePath('/dashboard/pro/recurring');

    return ok(
      { moved },
      applyToFuture ? `עודכנו ${moved} מפגשים בסדרה` : 'המפגש הוזז. שאר הסדרה לא השתנתה.',
    );
  });
}

/** הצעה של בעל המקצוע ללקוח להפוך טיפול חד־פעמי לסדרה קבועה. */
export async function suggestRecurringAction(bookingId: string): Promise<ActionResult> {
  return guard(async () => {
    const { professionalId, user } = await requireProfessional();
    const supabase = await getScopedClient();

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, client_id, professional_id, service_id, conversation_id, scheduled_start')
      .eq('id', bookingId)
      .maybeSingle();

    if (!booking || booking.professional_id !== professionalId) return fail('ההזמנה לא נמצאה');

    const admin = createAdminClient();

    await admin.rpc('create_notification', {
      p_profile_id: booking.client_id,
      p_type: 'series_created',
      p_title: 'האם תרצה לקבוע את הטיפול הזה באופן קבוע?',
      p_body: 'בעל המקצוע מציע להפוך את הטיפול למפגש קבוע',
      p_actor_id: user.id,
      p_entity_type: 'booking',
      p_entity_id: booking.id,
      p_link: `/book/recurring?booking=${booking.id}`,
    } as never);

    if (booking.conversation_id) {
      await admin.from('messages').insert({
        conversation_id: booking.conversation_id,
        sender_id: user.id,
        body: 'שמחתי לטפל בך! רוצה שנקבע את הטיפול הזה באופן קבוע?',
      });
    }

    return ok(undefined, 'ההצעה נשלחה ללקוח. הסדרה תיווצר רק אם הוא יאשר.');
  });
}
