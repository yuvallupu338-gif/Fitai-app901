'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getScopedClient, requireProfessional, requireSession } from '@/lib/auth/session';
import {
  availabilitySchema,
  blockedDateSchema,
  professionRequestSchema,
  professionalDetailsSchema,
  serviceLocationSchema,
  serviceSchema,
} from '@/lib/validations';
import { fail, guard, ok, parseInput } from '@/lib/actions/result';
import type { ActionResult, ReadinessResult } from '@/types/app';

/**
 * שלב 1 – פרטים מקצועיים. יוצר את הפרופיל המקצועי אם אינו קיים.
 * הפרופיל נשמר תמיד כטיוטה עד שהמשתמש בוחר לפרסם.
 */
export async function saveProfessionalDetailsAction(
  input: unknown,
): Promise<ActionResult<{ professionalId: string; professionRequestSent: boolean }>> {
  return guard(async () => {
    const session = await requireSession();
    const parsed = parseInput(professionalDetailsSchema, input);
    if (!parsed.success) return parsed.result;

    const data = parsed.data;
    const supabase = await getScopedClient();
    const admin = createAdminClient();

    const values = {
      profile_id: session.user.id,
      business_name: data.businessName,
      headline: data.headline ?? null,
      bio: data.bio ?? null,
      city_id: data.cityId,
      years_experience: data.yearsExperience ?? null,
      avatar_url: data.avatarUrl,
      cover_url: data.coverUrl ?? null,
      website_url: data.websiteUrl || null,
      social_links: data.instagramUrl ? { instagram: data.instagramUrl } : {},
    };

    const { data: existing } = await supabase
      .from('professional_profiles')
      .select('id')
      .eq('profile_id', session.user.id)
      .maybeSingle();

    let professionalId = existing?.id ?? null;

    if (professionalId) {
      const { error } = await supabase.from('professional_profiles').update(values).eq('id', professionalId);
      if (error) throw new Error(error.message);
    } else {
      const { data: created, error } = await supabase
        .from('professional_profiles')
        .insert({ ...values, status: 'draft' })
        .select('id')
        .single();
      if (error || !created) throw new Error(error?.message ?? 'יצירת הפרופיל המקצועי נכשלה');
      professionalId = created.id;
    }

    // מספר טלפון נשמר בטבלה נפרדת ומוגנת.
    const { error: contactError } = await supabase
      .from('professional_contact_details')
      .upsert({ professional_id: professionalId, phone: data.phone }, { onConflict: 'professional_id' });
    if (contactError) throw new Error(contactError.message);

    // עדכון המקצועות שנבחרו.
    await supabase.from('professional_professions').delete().eq('professional_id', professionalId);
    if (data.professionIds.length > 0) {
      const { error: profError } = await supabase.from('professional_professions').insert(
        data.professionIds.map((id, index) => ({
          professional_id: professionalId!,
          profession_id: id,
          is_primary: index === 0,
        })),
      );
      if (profError) throw new Error(profError.message);
    }

    // "מקצוע אחר" – נשלח לאישור מנהל ולא נוצר מיד.
    let professionRequestSent = false;
    if (data.otherProfession && data.otherProfession.trim().length > 1) {
      const result = await submitProfessionRequest({ rawName: data.otherProfession, note: null });
      professionRequestSent = result.ok;
    }

    // סנכרון אזורי שירות עם עיר הבסיס אם אין עדיין אזורים.
    const { count } = await admin
      .from('service_areas')
      .select('id', { count: 'exact', head: true })
      .eq('professional_id', professionalId);

    if (!count) {
      await supabase.from('service_areas').insert({ professional_id: professionalId, city_id: data.cityId });
    }

    revalidatePath('/pro/onboarding');
    revalidatePath('/dashboard/pro');
    return ok({ professionalId, professionRequestSent }, 'הפרטים המקצועיים נשמרו');
  });
}

/** שלב 2 – מקום מתן השירות, אזורי שירות ותוספת נסיעה. */
export async function saveServiceLocationAction(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    const { professionalId } = await requireProfessional();
    const parsed = parseInput(serviceLocationSchema, input);
    if (!parsed.success) return parsed.result;

    const data = parsed.data;
    const supabase = await getScopedClient();

    const { error } = await supabase
      .from('professional_profiles')
      .update({
        accepts_home_visits: data.acceptsHomeVisits,
        accepts_studio: data.acceptsStudio,
        accepts_events: data.acceptsEvents,
        accepts_online: data.acceptsOnline,
        max_travel_km: data.maxTravelKm ?? null,
        travel_fee_type: data.travelFeeType,
        travel_fee: data.travelFee,
      })
      .eq('id', professionalId);

    if (error) throw new Error(error.message);

    if (data.acceptsStudio && data.studioAddress) {
      await supabase
        .from('professional_contact_details')
        .upsert(
          { professional_id: professionalId, studio_address: data.studioAddress },
          { onConflict: 'professional_id' },
        );
    }

    await supabase.from('service_areas').delete().eq('professional_id', professionalId);
    if (data.serviceAreaCityIds.length > 0) {
      const { error: areaError } = await supabase.from('service_areas').insert(
        data.serviceAreaCityIds.map((cityId) => ({
          professional_id: professionalId,
          city_id: cityId,
          travel_fee: data.travelFeeType === 'per_city' ? data.travelFee : 0,
        })),
      );
      if (areaError) throw new Error(areaError.message);
    }

    revalidatePath('/pro/onboarding');
    return ok(undefined, 'מקום מתן השירות נשמר');
  });
}

/** שלב 3 – יצירה או עדכון של שירות. */
export async function saveServiceAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const { professionalId } = await requireProfessional();
    const parsed = parseInput(serviceSchema, input);
    if (!parsed.success) return parsed.result;

    const data = parsed.data;
    const supabase = await getScopedClient();

    const values = {
      professional_id: professionalId,
      profession_id: data.professionId ?? null,
      name: data.name,
      description: data.description ?? null,
      price_type: data.priceType,
      price_min: data.priceType === 'on_request' ? null : (data.priceMin ?? null),
      price_max: data.priceType === 'range' ? (data.priceMax ?? null) : null,
      duration_minutes: data.durationMinutes,
      buffer_minutes: data.bufferMinutes,
      at_client_home: data.atClientHome,
      at_studio: data.atStudio,
      at_event: data.atEvent,
      supports_recurring: data.supportsRecurring,
      image_url: data.imageUrl ?? null,
      is_active: data.isActive,
    };

    const query = data.id
      ? supabase
          .from('professional_services')
          .update(values)
          .eq('id', data.id)
          .eq('professional_id', professionalId)
          .select('id')
          .single()
      : supabase.from('professional_services').insert(values).select('id').single();

    const { data: saved, error } = await query;
    if (error || !saved) throw new Error(error?.message ?? 'שמירת השירות נכשלה');

    revalidatePath('/pro/onboarding');
    revalidatePath('/dashboard/pro/services');
    return ok({ id: saved.id }, 'השירות נשמר');
  });
}

export async function deleteServiceAction(serviceId: string): Promise<ActionResult> {
  return guard(async () => {
    const { professionalId } = await requireProfessional();
    const supabase = await getScopedClient();

    const { error } = await supabase
      .from('professional_services')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', serviceId)
      .eq('professional_id', professionalId);

    if (error) throw new Error(error.message);

    revalidatePath('/dashboard/pro/services');
    return ok(undefined, 'השירות הוסר');
  });
}

/** שלב 4 – שעות פעילות, הפסקות ומדיניות הזמנה. */
export async function saveAvailabilityAction(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    const { professionalId } = await requireProfessional();
    const parsed = parseInput(availabilitySchema, input);
    if (!parsed.success) return parsed.result;

    const supabase = await getScopedClient();

    await supabase.from('professional_availability').delete().eq('professional_id', professionalId);

    const { error } = await supabase.from('professional_availability').insert(
      parsed.data.windows.map((w) => ({
        professional_id: professionalId,
        weekday: w.weekday,
        start_time: w.startTime,
        end_time: w.endTime,
        is_break: w.isBreak,
      })),
    );
    if (error) throw new Error(error.message);

    const { error: profileError } = await supabase
      .from('professional_profiles')
      .update({
        min_lead_time_minutes: parsed.data.minLeadTimeMinutes,
        max_lead_time_days: parsed.data.maxLeadTimeDays,
        cancellation_policy: parsed.data.cancellationPolicy ?? null,
      })
      .eq('id', professionalId);
    if (profileError) throw new Error(profileError.message);

    revalidatePath('/pro/onboarding');
    revalidatePath('/dashboard/pro/schedule');
    return ok(undefined, 'שעות הפעילות נשמרו');
  });
}

/** סימון "זמין היום" / "זמין עכשיו". */
export async function setQuickAvailabilityAction(
  availableToday: boolean,
  availableNow: boolean,
  hours = 3,
): Promise<ActionResult> {
  return guard(async () => {
    const { professionalId } = await requireProfessional();
    const supabase = await getScopedClient();

    const { error } = await supabase
      .from('professional_profiles')
      .update({
        available_today: availableToday,
        available_now: availableNow,
        available_now_until: availableNow ? new Date(Date.now() + hours * 3600_000).toISOString() : null,
      })
      .eq('id', professionalId);

    if (error) throw new Error(error.message);

    revalidatePath('/dashboard/pro');
    return ok(undefined, availableNow ? 'סומנת כזמין עכשיו' : 'הזמינות עודכנה');
  });
}

/** חסימת תאריכים או יציאה לחופשה. */
export async function saveBlockedDateAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const { professionalId } = await requireProfessional();
    const parsed = parseInput(blockedDateSchema, input);
    if (!parsed.success) return parsed.result;

    const supabase = await getScopedClient();
    const { data, error } = await supabase
      .from('unavailable_dates')
      .insert({
        professional_id: professionalId,
        start_at: new Date(parsed.data.startAt).toISOString(),
        end_at: new Date(parsed.data.endAt).toISOString(),
        reason: parsed.data.reason ?? null,
        is_vacation: parsed.data.isVacation,
      })
      .select('id')
      .single();

    if (error || !data) throw new Error(error?.message ?? 'חסימת התאריכים נכשלה');

    revalidatePath('/dashboard/pro/schedule');
    return ok({ id: data.id }, parsed.data.isVacation ? 'החופשה נשמרה' : 'הזמן נחסם ביומן');
  });
}

export async function deleteBlockedDateAction(id: string): Promise<ActionResult> {
  return guard(async () => {
    const { professionalId } = await requireProfessional();
    const supabase = await getScopedClient();

    const { error } = await supabase
      .from('unavailable_dates')
      .delete()
      .eq('id', id)
      .eq('professional_id', professionalId);

    if (error) throw new Error(error.message);

    revalidatePath('/dashboard/pro/schedule');
    return ok(undefined, 'החסימה הוסרה');
  });
}

/** פרסום הפרופיל המקצועי – רק לאחר שכל שדות החובה הושלמו. */
export async function publishProfessionalProfileAction(): Promise<ActionResult<ReadinessResult>> {
  return guard(async () => {
    const { professionalId } = await requireProfessional();
    const supabase = await getScopedClient();

    const { data: readiness } = await supabase.rpc('professional_readiness', {
      p_professional_id: professionalId,
    } as never);

    const status = readiness as unknown as ReadinessResult;

    if (!status?.ready) {
      return fail('עדיין חסרים פרטים כדי לפרסם את הפרופיל');
    }

    const { error } = await supabase
      .from('professional_profiles')
      .update({ status: 'active' })
      .eq('id', professionalId);

    if (error) throw new Error(error.message);

    // מרגע הפרסום, ברירת המחדל היא להציג את האפליקציה במצב בעל מקצוע.
    await supabase.from('profiles').update({ active_mode: 'professional' }).eq('id', (await requireSession()).user.id);

    revalidatePath('/', 'layout');
    return ok(status, 'הפרופיל המקצועי פורסם! מעכשיו הוא מופיע בחיפוש.');
  });
}

/** השהיית הפרופיל המקצועי בלי למחוק את החשבון האישי. */
export async function setProfessionalStatusAction(status: 'active' | 'paused'): Promise<ActionResult> {
  return guard(async () => {
    const { professionalId } = await requireProfessional();
    const supabase = await getScopedClient();

    const { error } = await supabase
      .from('professional_profiles')
      .update({ status })
      .eq('id', professionalId);

    if (error) throw new Error(error.message);

    revalidatePath('/', 'layout');
    return ok(
      undefined,
      status === 'paused'
        ? 'הפרופיל המקצועי הושהה והוסר מהחיפוש. החשבון האישי נשאר פעיל.'
        : 'הפרופיל המקצועי חזר לפעילות',
    );
  });
}

/** בקשה להוספת מקצוע חדש ("מקצוע אחר"). */
export async function submitProfessionRequest(input: unknown): Promise<ActionResult<{ status: string }>> {
  return guard(async () => {
    const session = await requireSession();
    const parsed = parseInput(professionRequestSchema, input);
    if (!parsed.success) return parsed.result;

    const admin = createAdminClient();

    // מניעת כפילויות: אם כבר קיים מקצוע דומה, משייכים אליו במקום ליצור חדש.
    const { data: similar } = await admin.rpc('search_suggestions', {
      p_term: parsed.data.rawName,
      p_limit: 3,
    } as never);

    const suggestions = (similar ?? []) as Array<{ kind: string; id: string; label: string; score: number }>;
    const closeMatch = suggestions.find((s) => s.kind === 'profession' && s.score > 0.75);

    if (closeMatch) {
      return ok(
        { status: 'existing' },
        `המקצוע "${closeMatch.label}" כבר קיים במערכת – אפשר לבחור אותו מהרשימה.`,
      );
    }

    const supabase = await getScopedClient();
    const { error } = await supabase.from('profession_requests').insert({
      requested_by: session.user.id,
      raw_name: parsed.data.rawName,
      note: parsed.data.note ?? null,
    });

    if (error) {
      if (/profession_requests_pending_unique/.test(error.message)) {
        return ok({ status: 'pending' }, 'כבר קיימת בקשה ממתינה למקצוע הזה. נעדכן כשתאושר.');
      }
      throw new Error(error.message);
    }

    return ok({ status: 'submitted' }, 'הבקשה נשלחה לאישור מנהל. נעדכן אותך כשהמקצוע יתווסף.');
  });
}

/** שליחת תעודה מקצועית או בקשת אימות. */
export async function submitVerificationAction(
  kind: 'phone' | 'certificate' | 'identity',
  documentUrl: string | null,
  title: string | null,
): Promise<ActionResult> {
  return guard(async () => {
    const { professionalId } = await requireProfessional();
    const supabase = await getScopedClient();

    const { error } = await supabase.from('professional_verifications').insert({
      professional_id: professionalId,
      kind,
      document_url: documentUrl,
      title,
    });

    if (error) throw new Error(error.message);

    revalidatePath('/dashboard/pro/verification');
    return ok(undefined, 'הבקשה נשלחה לבדיקה');
  });
}

/** שמירת הערה פרטית של בעל המקצוע על לקוח. */
export async function saveCustomerNoteAction(clientId: string, note: string): Promise<ActionResult> {
  return guard(async () => {
    const { professionalId } = await requireProfessional();
    if (!note.trim()) return fail('אי אפשר לשמור הערה ריקה');

    const supabase = await getScopedClient();
    const { error } = await supabase.from('customer_notes').insert({
      professional_id: professionalId,
      client_id: clientId,
      note: note.trim(),
    });

    if (error) throw new Error(error.message);

    revalidatePath('/dashboard/pro/clients');
    return ok(undefined, 'ההערה נשמרה');
  });
}
