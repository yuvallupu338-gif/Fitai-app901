'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getScopedClient, requireProfessional, requireSession } from '@/lib/auth/session';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { bookingSchema, cancelBookingSchema, proposeChangeSchema } from '@/lib/validations';
import { fail, guard, ok, parseInput } from '@/lib/actions/result';
import type { ActionResult, BookingStatus, SlotCheckResult } from '@/types/app';

const SLOT_ERRORS: Record<string, string> = {
  professional_not_found: 'בעל המקצוע לא נמצא',
  professional_inactive: 'הפרופיל של בעל המקצוע אינו פעיל כרגע',
  too_soon: 'המועד קרוב מדי. יש להזמין מראש בהתאם למדיניות בעל המקצוע.',
  too_far: 'המועד רחוק מדי. אפשר להזמין רק עד הטווח שבעל המקצוע הגדיר.',
  outside_working_hours: 'המועד מחוץ לשעות הפעילות',
  break_time: 'המועד חופף להפסקה של בעל המקצוע',
  blocked_date: 'בעל המקצוע חסם את התאריך הזה',
  slot_taken: 'המועד כבר תפוס. אפשר לבחור שעה אחרת.',
};

/** בדיקת פניות מועד – נקראת גם מהממשק לפני שליחת ההזמנה. */
export async function checkSlotAction(
  professionalId: string,
  serviceId: string,
  startIso: string,
): Promise<ActionResult<{ available: boolean; reason?: string }>> {
  return guard(async () => {
    const supabase = await getScopedClient();

    const { data: service } = await supabase
      .from('professional_services')
      .select('duration_minutes, buffer_minutes')
      .eq('id', serviceId)
      .maybeSingle();

    if (!service) return fail('השירות לא נמצא');

    const { data, error } = await supabase.rpc('check_booking_slot', {
      p_professional_id: professionalId,
      p_start: startIso,
      p_duration_minutes: service.duration_minutes,
      p_buffer_minutes: service.buffer_minutes,
    } as never);

    if (error) throw new Error(error.message);

    const result = data as unknown as SlotCheckResult;
    return ok({
      available: result.ok,
      reason: result.ok ? undefined : (SLOT_ERRORS[result.reason ?? ''] ?? 'המועד אינו זמין'),
    });
  });
}

/** רשימת המשבצות הפנויות ליום מסוים. */
export async function getAvailableSlotsAction(
  professionalId: string,
  serviceId: string,
  date: string,
): Promise<ActionResult<string[]>> {
  return guard(async () => {
    const supabase = await getScopedClient();

    const { data: service } = await supabase
      .from('professional_services')
      .select('duration_minutes, buffer_minutes')
      .eq('id', serviceId)
      .maybeSingle();

    if (!service) return fail('השירות לא נמצא');

    const { data, error } = await supabase.rpc('available_slots', {
      p_professional_id: professionalId,
      p_date: date,
      p_duration_minutes: service.duration_minutes,
      p_buffer_minutes: service.buffer_minutes,
      p_step_minutes: 30,
    } as never);

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as unknown as Array<{ slot: string }>;
    return ok(rows.map((r) => r.slot));
  });
}

/** יצירת הזמנה חד־פעמית. */
export async function createBookingAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const session = await requireSession();
    const parsed = parseInput(bookingSchema, input);
    if (!parsed.success) return parsed.result;

    if (!(await consumeRateLimit(RATE_LIMITS.booking, session.user.id))) {
      return fail('נשלחו יותר מדי בקשות הזמנה. אפשר לנסות שוב בעוד שעה.');
    }

    const data = parsed.data;
    const supabase = await getScopedClient();

    const { data: service } = await supabase
      .from('professional_services')
      .select('id, professional_id, duration_minutes, buffer_minutes, price_type, price_min, at_client_home, at_studio, at_event')
      .eq('id', data.serviceId)
      .eq('professional_id', data.professionalId)
      .maybeSingle();

    if (!service) return fail('השירות שנבחר אינו זמין');

    if (data.locationType === 'client_home' && !service.at_client_home) {
      return fail('השירות הזה אינו זמין בבית הלקוח');
    }
    if (data.locationType === 'studio' && !service.at_studio) {
      return fail('השירות הזה אינו זמין בסטודיו');
    }
    if (data.locationType === 'event' && !service.at_event) {
      return fail('השירות הזה אינו זמין לאירועים');
    }

    // בטיחות קטינים: הזמנת ביקור בית מחייבת אישור הורה.
    if (data.locationType === 'client_home' && session.user.isMinor && !session.user.guardianApproved) {
      return fail('הזמנת בעל מקצוע לבית עבור משתמש מתחת לגיל 18 מחייבת אישור הורה או אחראי בהגדרות.');
    }

    const start = new Date(data.scheduledStart);
    const slot = await checkSlotAction(data.professionalId, data.serviceId, start.toISOString());
    if (!slot.ok) return slot;
    if (!slot.data.available) return fail(slot.data.reason ?? 'המועד אינו זמין');

    const { data: professional } = await supabase
      .from('professional_profiles')
      .select('profile_id, travel_fee, travel_fee_type')
      .eq('id', data.professionalId)
      .single();

    const travelFee =
      data.locationType === 'client_home' && professional?.travel_fee_type !== 'none'
        ? Number(professional?.travel_fee ?? 0)
        : 0;

    // שיחה משותפת לתיאום – נוצרת מראש כדי שהודעות המערכת ייכנסו אליה.
    const { data: conversationId } = await supabase.rpc('get_or_create_direct_conversation', {
      p_other: professional!.profile_id,
    } as never);

    const end = new Date(start.getTime() + service.duration_minutes * 60_000);

    const { data: booking, error } = await supabase
      .from('bookings')
      .insert({
        client_id: session.user.id,
        professional_id: data.professionalId,
        service_id: data.serviceId,
        address_id: data.addressId ?? null,
        conversation_id: (conversationId as unknown as string) ?? null,
        source_post_id: data.sourcePostId ?? null,
        location_type: data.locationType,
        status: 'pending',
        scheduled_start: start.toISOString(),
        scheduled_end: end.toISOString(),
        duration_minutes: service.duration_minutes,
        buffer_minutes: service.buffer_minutes,
        price_type: service.price_type,
        price_amount: service.price_type === 'on_request' ? null : service.price_min,
        travel_fee: travelFee,
        people_count: data.peopleCount,
        notes: data.notes ?? null,
        inspiration_url: data.inspirationUrl ?? null,
        event_address: data.eventAddress ?? null,
        guardian_contact: data.guardianContact ?? null,
        shared_with_contact: data.shareWithContact ?? null,
      })
      .select('id')
      .single();

    if (error || !booking) throw new Error(error?.message ?? 'יצירת ההזמנה נכשלה');

    revalidatePath('/dashboard/bookings');
    return ok({ id: booking.id }, 'הבקשה נשלחה לבעל המקצוע');
  });
}

/** עדכון סטטוס הזמנה על ידי בעל המקצוע. */
export async function updateBookingStatusAction(
  bookingId: string,
  status: BookingStatus,
): Promise<ActionResult> {
  return guard(async () => {
    await requireProfessional();
    const supabase = await getScopedClient();

    const allowed: BookingStatus[] = [
      'confirmed',
      'on_the_way',
      'arrived',
      'in_progress',
      'completed',
      'no_show',
    ];
    if (!allowed.includes(status)) {
      return fail('סטטוס לא חוקי');
    }

    const { error } = await supabase.from('bookings').update({ status }).eq('id', bookingId);
    if (error) throw new Error(error.message);

    revalidatePath('/dashboard/pro/bookings');
    revalidatePath(`/dashboard/pro/bookings/${bookingId}`);
    revalidatePath('/dashboard/bookings');

    const messages: Partial<Record<BookingStatus, string>> = {
      confirmed: 'ההזמנה אושרה והכתובת נחשפה לך',
      on_the_way: 'הלקוח קיבל עדכון שאתה בדרך',
      arrived: 'סומן שהגעת',
      in_progress: 'הטיפול התחיל',
      completed: 'הטיפול סומן כהושלם',
      no_show: 'סומן שהמפגש לא התקיים',
    };

    return ok(undefined, messages[status] ?? 'הסטטוס עודכן');
  });
}

/** דחיית הזמנה על ידי בעל המקצוע. */
export async function rejectBookingAction(bookingId: string, reason?: string): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireProfessional();
    const supabase = await getScopedClient();

    const { error } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancel_reason: reason ?? 'בעל המקצוע לא יכול בשעה זו',
        cancelled_by: session.user.id,
      })
      .eq('id', bookingId);

    if (error) throw new Error(error.message);

    revalidatePath('/dashboard/pro/bookings');
    return ok(undefined, 'ההזמנה נדחתה והלקוח קיבל עדכון');
  });
}

/** הצעת מועד או מחיר אחר. */
export async function proposeBookingChangeAction(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireProfessional();
    const parsed = parseInput(proposeChangeSchema, input);
    if (!parsed.success) return parsed.result;

    if (!parsed.data.proposedStart && parsed.data.proposedPrice === null) {
      return fail('יש להציע מועד חדש או מחיר חדש');
    }

    const supabase = await getScopedClient();
    const { error } = await supabase
      .from('bookings')
      .update({
        status: 'change_proposed',
        proposed_start: parsed.data.proposedStart ? new Date(parsed.data.proposedStart).toISOString() : null,
        proposed_price: parsed.data.proposedPrice ?? null,
        proposed_by: session.user.id,
        proposed_note: parsed.data.note ?? null,
      })
      .eq('id', parsed.data.bookingId);

    if (error) throw new Error(error.message);

    revalidatePath('/dashboard/pro/bookings');
    return ok(undefined, 'ההצעה נשלחה ללקוח');
  });
}

/** אישור הצעת השינוי על ידי הלקוח. */
export async function acceptProposalAction(bookingId: string): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const supabase = await getScopedClient();

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, client_id, status, proposed_start, proposed_price, duration_minutes, professional_id, service_id, buffer_minutes')
      .eq('id', bookingId)
      .maybeSingle();

    if (!booking || booking.client_id !== session.user.id) return fail('ההזמנה לא נמצאה');
    if (booking.status !== 'change_proposed') return fail('אין הצעת שינוי פתוחה להזמנה הזו');

    const newStart = booking.proposed_start ? new Date(booking.proposed_start) : null;

    if (newStart) {
      const slot = await checkSlotAction(booking.professional_id, booking.service_id, newStart.toISOString());
      if (!slot.ok) return slot;
      if (!slot.data.available) return fail(slot.data.reason ?? 'המועד שהוצע כבר אינו פנוי');
    }

    // המחיר מתעדכן בהרשאות שרת: הלקוח אינו רשאי לשנות מחיר בעצמו,
    // אבל אישור הצעה של בעל המקצוע הוא פעולה לגיטימית.
    const admin = createAdminClient();
    const { error } = await admin
      .from('bookings')
      .update({
        status: 'confirmed',
        scheduled_start: newStart ? newStart.toISOString() : undefined,
        scheduled_end: newStart
          ? new Date(newStart.getTime() + booking.duration_minutes * 60_000).toISOString()
          : undefined,
        price_amount: booking.proposed_price ?? undefined,
        proposed_start: null,
        proposed_price: null,
        proposed_by: null,
        proposed_note: null,
      })
      .eq('id', bookingId);

    if (error) throw new Error(error.message);

    revalidatePath('/dashboard/bookings');
    return ok(undefined, 'ההצעה אושרה וההזמנה נקבעה');
  });
}

/** ביטול הזמנה על ידי אחד הצדדים. */
export async function cancelBookingAction(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const parsed = parseInput(cancelBookingSchema, input);
    if (!parsed.success) return parsed.result;

    const supabase = await getScopedClient();
    const { error } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancel_reason: parsed.data.reason ?? null,
        cancelled_by: session.user.id,
      })
      .eq('id', parsed.data.bookingId);

    if (error) throw new Error(error.message);

    revalidatePath('/dashboard/bookings');
    revalidatePath('/dashboard/pro/bookings');
    return ok(undefined, 'ההזמנה בוטלה');
  });
}

/** שינוי מועד על ידי הלקוח (לפני אישור או בתיאום). */
export async function rescheduleBookingAction(
  bookingId: string,
  newStartIso: string,
): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const supabase = await getScopedClient();

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, client_id, professional_id, service_id, duration_minutes, status')
      .eq('id', bookingId)
      .maybeSingle();

    if (!booking) return fail('ההזמנה לא נמצאה');

    const start = new Date(newStartIso);
    const slot = await checkSlotAction(booking.professional_id, booking.service_id, start.toISOString());
    if (!slot.ok) return slot;
    if (!slot.data.available) return fail(slot.data.reason ?? 'המועד אינו זמין');

    const isClient = booking.client_id === session.user.id;

    const { error } = await supabase
      .from('bookings')
      .update({
        scheduled_start: start.toISOString(),
        scheduled_end: new Date(start.getTime() + booking.duration_minutes * 60_000).toISOString(),
        // שינוי מועד על ידי הלקוח מחזיר את ההזמנה לאישור בעל המקצוע.
        status: isClient && booking.status === 'confirmed' ? 'pending' : booking.status,
      })
      .eq('id', bookingId);

    if (error) throw new Error(error.message);

    revalidatePath('/dashboard/bookings');
    revalidatePath('/dashboard/pro/bookings');
    return ok(undefined, 'המועד עודכן');
  });
}
