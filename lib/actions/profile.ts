'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getScopedClient, requireSession } from '@/lib/auth/session';
import { logSecurityEvent } from '@/lib/auth/rate-limit';
import {
  addressSchema,
  guardianSchema,
  notificationPrefsSchema,
  privacySchema,
  updateProfileSchema,
} from '@/lib/validations';
import { fail, guard, ok, parseInput } from '@/lib/actions/result';
import type { ActionResult } from '@/types/app';
import { compact } from '@/lib/utils';

/** עדכון פרטי הפרופיל האישי (כולל שינוי עיר ושם משתמש). */
export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const parsed = parseInput(updateProfileSchema, input);
    if (!parsed.success) return parsed.result;

    const admin = createAdminClient();
    const { fullName, username, cityId, bio, avatarUrl, birthDate } = parsed.data;

    if (username.toLowerCase() !== session.user.username.toLowerCase()) {
      const { data: taken } = await admin
        .from('usernames')
        .select('username, profile_id')
        .ilike('username', username)
        .maybeSingle();

      if (taken && taken.profile_id !== session.user.id) {
        return fail('שם המשתמש כבר תפוס', { username: ['שם המשתמש כבר תפוס'] });
      }
    }

    const { error } = await admin
      .from('profiles')
      .update(
        compact({
          full_name: fullName,
          username,
          city_id: cityId,
          bio: bio ?? null,
          avatar_url: avatarUrl ?? null,
          birth_date: birthDate || null,
        }),
      )
      .eq('id', session.user.id);

    if (error) throw new Error(error.message);

    revalidatePath('/', 'layout');
    revalidatePath(`/u/${username}`);
    return ok(undefined, 'הפרופיל עודכן');
  });
}

/** מעבר בין מצב משתמש רגיל למצב בעל מקצוע. */
export async function switchModeAction(mode: 'user' | 'professional'): Promise<ActionResult<{ mode: string }>> {
  return guard(async () => {
    const session = await requireSession();

    if (mode === 'professional' && !session.user.professionalId) {
      return fail('עדיין אין לך פרופיל מקצועי');
    }

    const supabase = await getScopedClient();
    const { error } = await supabase
      .from('profiles')
      .update({ active_mode: mode })
      .eq('id', session.user.id);

    if (error) throw new Error(error.message);

    revalidatePath('/', 'layout');
    return ok({ mode }, mode === 'professional' ? 'עברת למצב בעל מקצוע' : 'עברת למצב משתמש');
  });
}

export async function updatePrivacyAction(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const parsed = parseInput(privacySchema, input);
    if (!parsed.success) return parsed.result;

    const supabase = await getScopedClient();
    const { error } = await supabase
      .from('profiles')
      .update({ privacy: parsed.data })
      .eq('id', session.user.id);

    if (error) throw new Error(error.message);

    revalidatePath('/settings/privacy');
    return ok(undefined, 'הגדרות הפרטיות נשמרו');
  });
}

export async function updateNotificationPrefsAction(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const parsed = parseInput(notificationPrefsSchema, input);
    if (!parsed.success) return parsed.result;

    // notification_prefs אינו נגיש ללקוח (הרשאת עמודה) ולכן נכתב בשרת בלבד.
    const admin = createAdminClient();
    const { error } = await admin
      .from('profiles')
      .update({ notification_prefs: parsed.data })
      .eq('id', session.user.id);

    if (error) throw new Error(error.message);

    revalidatePath('/settings/notifications');
    return ok(undefined, 'העדפות ההתראות נשמרו');
  });
}

/** אישור הורה או אחראי – נדרש לקטינים לפני הזמנת בעל מקצוע לבית. */
export async function setGuardianApprovalAction(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const parsed = parseInput(guardianSchema, input);
    if (!parsed.success) return parsed.result;

    const admin = createAdminClient();
    const { error } = await admin
      .from('profiles')
      .update({
        guardian_name: parsed.data.guardianName,
        guardian_phone: parsed.data.guardianPhone,
        guardian_approved_at: new Date().toISOString(),
      })
      .eq('id', session.user.id);

    if (error) throw new Error(error.message);

    await logSecurityEvent(session.user.id, 'guardian_approval_added');
    revalidatePath('/settings');
    return ok(undefined, 'אישור ההורה נשמר');
  });
}

// ---------------------------------------------------------------------
// כתובות שירות
// ---------------------------------------------------------------------

export async function saveAddressAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const session = await requireSession();
    const parsed = parseInput(addressSchema, input);
    if (!parsed.success) return parsed.result;

    const supabase = await getScopedClient();
    const values = {
      profile_id: session.user.id,
      label: parsed.data.label,
      city_id: parsed.data.cityId,
      street: parsed.data.street,
      house_number: parsed.data.houseNumber ?? null,
      apartment: parsed.data.apartment ?? null,
      floor: parsed.data.floor ?? null,
      entrance_code: parsed.data.entranceCode ?? null,
      arrival_notes: parsed.data.arrivalNotes ?? null,
      has_parking: parsed.data.hasParking ?? null,
      is_default: parsed.data.isDefault,
    };

    // רק כתובת אחת יכולה להיות ברירת מחדל.
    if (parsed.data.isDefault) {
      await supabase
        .from('service_addresses')
        .update({ is_default: false })
        .eq('profile_id', session.user.id);
    }

    const query = parsed.data.id
      ? supabase.from('service_addresses').update(values).eq('id', parsed.data.id).select('id').single()
      : supabase.from('service_addresses').insert(values).select('id').single();

    const { data, error } = await query;
    if (error || !data) throw new Error(error?.message ?? 'שמירת הכתובת נכשלה');

    revalidatePath('/settings/addresses');
    return ok({ id: data.id }, 'הכתובת נשמרה');
  });
}

export async function deleteAddressAction(addressId: string): Promise<ActionResult> {
  return guard(async () => {
    await requireSession();
    const supabase = await getScopedClient();

    const { error } = await supabase
      .from('service_addresses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', addressId);

    if (error) throw new Error(error.message);

    revalidatePath('/settings/addresses');
    return ok(undefined, 'הכתובת נמחקה');
  });
}

// ---------------------------------------------------------------------
// חשבון
// ---------------------------------------------------------------------

/** ייצוא נתוני החשבון (זכות המשתמש לקבל את המידע שלו). */
export async function exportAccountDataAction(): Promise<ActionResult<Record<string, unknown>>> {
  return guard(async () => {
    const session = await requireSession();
    const admin = createAdminClient();
    const id = session.user.id;

    const [profile, posts, bookings, reviews, messages, follows, addresses, notifications] = await Promise.all([
      admin
        .from('profiles')
        .select('id, username, full_name, city_id, bio, avatar_url, created_at, privacy, notification_prefs')
        .eq('id', id)
        .single(),
      admin.from('professional_posts').select('*').eq('author_profile_id', id),
      admin.from('bookings').select('*').eq('client_id', id),
      admin.from('reviews').select('*').eq('client_id', id),
      admin.from('messages').select('id, conversation_id, body, created_at').eq('sender_id', id),
      admin.from('follows').select('following_id, created_at').eq('follower_id', id),
      admin.from('service_addresses').select('*').eq('profile_id', id),
      admin.from('notifications').select('type, title, created_at').eq('profile_id', id).limit(500),
    ]);

    await logSecurityEvent(id, 'data_exported');

    return ok({
      exportedAt: new Date().toISOString(),
      profile: profile.data,
      posts: posts.data ?? [],
      bookings: bookings.data ?? [],
      reviews: reviews.data ?? [],
      messages: messages.data ?? [],
      follows: follows.data ?? [],
      addresses: addresses.data ?? [],
      notifications: notifications.data ?? [],
    });
  });
}

/** מחיקת חשבון – מחיקה רכה ששומרת על שלמות הזמנות והיסטוריה. */
export async function deleteAccountAction(confirmUsername: string): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();

    if (confirmUsername.trim().toLowerCase() !== session.user.username.toLowerCase()) {
      return fail('יש להקליד את שם המשתמש במדויק כדי לאשר את המחיקה');
    }

    const admin = createAdminClient();
    const now = new Date().toISOString();

    await admin
      .from('profiles')
      .update({ status: 'deleted', deleted_at: now, active_mode: 'user' })
      .eq('id', session.user.id);

    await admin
      .from('professional_profiles')
      .update({ status: 'paused', deleted_at: now })
      .eq('profile_id', session.user.id);

    await admin
      .from('auth_sessions')
      .update({ revoked_at: now })
      .eq('profile_id', session.user.id)
      .is('revoked_at', null);

    await logSecurityEvent(session.user.id, 'account_deleted');

    return ok(undefined, 'החשבון נמחק');
  });
}
