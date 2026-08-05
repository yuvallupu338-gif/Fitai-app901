'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/session';
import { logSecurityEvent } from '@/lib/auth/rate-limit';
import { fail, guard, ok } from '@/lib/actions/result';
import type { ActionResult } from '@/types/app';

/** יוצר slug באנגלית עבור מקצוע חדש. */
function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9א-ת\s-]/g, '')
    .replace(/\s+/g, '-');
  const ascii = base.replace(/[^a-z0-9-]/g, '');
  return ascii.length >= 3 ? ascii : `profession-${Date.now().toString(36)}`;
}

/** אישור בקשת מקצוע חדש – מוסיף אותו לרשימה הראשית. */
export async function approveProfessionRequestAction(requestId: string): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireAdmin();
    const admin = createAdminClient();

    const { data: request } = await admin
      .from('profession_requests')
      .select('id, raw_name, requested_by, status')
      .eq('id', requestId)
      .maybeSingle();

    if (!request) return fail('הבקשה לא נמצאה');
    if (request.status !== 'pending') return fail('הבקשה כבר טופלה');

    const { data: profession, error } = await admin
      .from('professions')
      .insert({
        slug: slugify(request.raw_name),
        name: request.raw_name.trim(),
        category: 'beauty',
        is_active: true,
        created_by: request.requested_by,
        approved_by: session.user.id,
      })
      .select('id, name')
      .single();

    if (error || !profession) {
      if (/professions_name_norm_key/.test(error?.message ?? '')) {
        return fail('כבר קיים מקצוע עם שם דומה. אפשר לאחד את הבקשה במקום לאשר.');
      }
      throw new Error(error?.message ?? 'יצירת המקצוע נכשלה');
    }

    await admin
      .from('profession_requests')
      .update({
        status: 'approved',
        created_profession_id: profession.id,
        reviewed_by: session.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    // שיוך אוטומטי של מבקש המקצוע לקטגוריה החדשה.
    const { data: professional } = await admin
      .from('professional_profiles')
      .select('id')
      .eq('profile_id', request.requested_by)
      .maybeSingle();

    if (professional) {
      await admin
        .from('professional_professions')
        .insert({ professional_id: professional.id, profession_id: profession.id });
    }

    await admin.rpc('create_notification', {
      p_profile_id: request.requested_by,
      p_type: 'profession_approved',
      p_title: `המקצוע "${profession.name}" אושר והתווסף לרשימה`,
      p_actor_id: session.user.id,
      p_entity_type: 'profession',
      p_entity_id: profession.id,
      p_link: '/dashboard/pro/profile',
    } as never);

    revalidatePath('/admin/professions');
    return ok(undefined, `המקצוע "${profession.name}" נוסף לרשימה`);
  });
}

/** מיזוג בקשה למקצוע קיים – מונע כפילויות. */
export async function mergeProfessionRequestAction(
  requestId: string,
  targetProfessionId: string,
): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireAdmin();
    const admin = createAdminClient();

    const { data: request } = await admin
      .from('profession_requests')
      .select('id, requested_by')
      .eq('id', requestId)
      .maybeSingle();

    if (!request) return fail('הבקשה לא נמצאה');

    await admin
      .from('profession_requests')
      .update({
        status: 'merged',
        merged_into: targetProfessionId,
        reviewed_by: session.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    const { data: professional } = await admin
      .from('professional_profiles')
      .select('id')
      .eq('profile_id', request.requested_by)
      .maybeSingle();

    if (professional) {
      await admin
        .from('professional_professions')
        .upsert(
          { professional_id: professional.id, profession_id: targetProfessionId },
          { onConflict: 'professional_id,profession_id' },
        );
    }

    revalidatePath('/admin/professions');
    return ok(undefined, 'הבקשה מוזגה למקצוע הקיים');
  });
}

export async function rejectProfessionRequestAction(requestId: string, note: string): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireAdmin();
    const admin = createAdminClient();

    await admin
      .from('profession_requests')
      .update({
        status: 'rejected',
        admin_note: note,
        reviewed_by: session.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    revalidatePath('/admin/professions');
    return ok(undefined, 'הבקשה נדחתה');
  });
}

/** עדכון סטטוס פרופיל מקצועי (אישור / דחייה / השהיה). */
export async function setProfessionalReviewStatusAction(
  professionalId: string,
  status: 'active' | 'rejected' | 'paused',
  reason?: string,
): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireAdmin();
    const admin = createAdminClient();

    const { data: professional } = await admin
      .from('professional_profiles')
      .select('id, profile_id, business_name')
      .eq('id', professionalId)
      .maybeSingle();

    if (!professional) return fail('הפרופיל לא נמצא');

    const { error } = await admin
      .from('professional_profiles')
      .update({ status, rejection_reason: status === 'rejected' ? (reason ?? null) : null })
      .eq('id', professionalId);

    if (error) throw new Error(error.message);

    if (status === 'active') {
      await admin.rpc('create_notification', {
        p_profile_id: professional.profile_id,
        p_type: 'professional_approved',
        p_title: 'הפרופיל המקצועי שלך אושר ומופיע בחיפוש',
        p_actor_id: session.user.id,
        p_entity_type: 'professional',
        p_entity_id: professionalId,
        p_link: '/dashboard/pro',
      } as never);
    }

    revalidatePath('/admin/professionals');
    return ok(undefined, 'סטטוס הפרופיל עודכן');
  });
}

/** תג "בעל מקצוע מאומת". */
export async function setVerifiedAction(professionalId: string, verified: boolean): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireAdmin();
    const admin = createAdminClient();

    const { error } = await admin
      .from('professional_profiles')
      .update({ is_verified: verified, verified_at: verified ? new Date().toISOString() : null })
      .eq('id', professionalId);

    if (error) throw new Error(error.message);

    const { data: professional } = await admin
      .from('professional_profiles')
      .select('profile_id')
      .eq('id', professionalId)
      .maybeSingle();

    if (verified && professional) {
      await admin.rpc('create_notification', {
        p_profile_id: professional.profile_id,
        p_type: 'verification_approved',
        p_title: 'קיבלת תג בעל מקצוע מאומת ✔',
        p_actor_id: session.user.id,
        p_entity_type: 'professional',
        p_entity_id: professionalId,
        p_link: '/dashboard/pro',
      } as never);
    }

    revalidatePath('/admin/professionals');
    return ok(undefined, verified ? 'בעל המקצוע אומת' : 'תג האימות הוסר');
  });
}

export async function reviewVerificationAction(
  verificationId: string,
  status: 'approved' | 'rejected',
  note?: string,
): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireAdmin();
    const admin = createAdminClient();

    const { data: verification } = await admin
      .from('professional_verifications')
      .select('id, professional_id, kind')
      .eq('id', verificationId)
      .maybeSingle();

    if (!verification) return fail('הבקשה לא נמצאה');

    await admin
      .from('professional_verifications')
      .update({
        status,
        note: note ?? null,
        reviewed_by: session.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', verificationId);

    if (status === 'approved') {
      const patch =
        verification.kind === 'phone'
          ? { phone_verified: true }
          : { is_verified: true, verified_at: new Date().toISOString() };
      await admin.from('professional_profiles').update(patch).eq('id', verification.professional_id);
    }

    revalidatePath('/admin/verifications');
    return ok(undefined, status === 'approved' ? 'האימות אושר' : 'הבקשה נדחתה');
  });
}

/** השעיה או חסימה של חשבון. */
export async function setAccountStatusAction(
  profileId: string,
  status: 'active' | 'suspended' | 'banned',
  reason?: string,
): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireAdmin();
    if (profileId === session.user.id) return fail('אי אפשר לשנות את הסטטוס של החשבון שלך');

    const admin = createAdminClient();
    const { error } = await admin.from('profiles').update({ status }).eq('id', profileId);
    if (error) throw new Error(error.message);

    if (status !== 'active') {
      await admin
        .from('auth_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('profile_id', profileId)
        .is('revoked_at', null);

      await admin.from('professional_profiles').update({ status: 'paused' }).eq('profile_id', profileId);
    }

    await logSecurityEvent(profileId, `account_${status}`, { by: session.user.id, reason });

    revalidatePath('/admin/users');
    return ok(undefined, 'סטטוס החשבון עודכן');
  });
}

/** טיפול בדיווח – הסתרת התוכן או סגירת הדיווח. */
export async function resolveReportAction(
  reportId: string,
  action: 'hide_content' | 'dismiss' | 'resolve',
  note?: string,
): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireAdmin();
    const admin = createAdminClient();

    const { data: report } = await admin
      .from('reports')
      .select('id, target_type, target_id, status')
      .eq('id', reportId)
      .maybeSingle();

    if (!report) return fail('הדיווח לא נמצא');

    if (action === 'hide_content') {
      switch (report.target_type) {
        case 'post':
          await admin.from('professional_posts').update({ status: 'hidden' }).eq('id', report.target_id);
          break;
        case 'comment':
          await admin.from('post_comments').update({ is_hidden: true }).eq('id', report.target_id);
          break;
        case 'review':
          await admin.from('reviews').update({ is_hidden: true }).eq('id', report.target_id);
          break;
        case 'professional':
          await admin.from('professional_profiles').update({ status: 'paused' }).eq('id', report.target_id);
          break;
        default:
          break;
      }
    }

    await admin
      .from('reports')
      .update({
        status: action === 'dismiss' ? 'dismissed' : 'resolved',
        handled_by: session.user.id,
        handled_at: new Date().toISOString(),
        resolution_note: note ?? null,
      })
      .eq('id', reportId);

    revalidatePath('/admin/reports');
    return ok(undefined, action === 'dismiss' ? 'הדיווח נסגר' : 'הטיפול בדיווח הושלם');
  });
}

/** ניהול קטלוג המקצועות. */
export async function toggleProfessionActiveAction(
  professionId: string,
  isActive: boolean,
): Promise<ActionResult> {
  return guard(async () => {
    await requireAdmin();
    const admin = createAdminClient();

    const { error } = await admin
      .from('professions')
      .update({ is_active: isActive })
      .eq('id', professionId);

    if (error) throw new Error(error.message);

    revalidatePath('/admin/professions');
    return ok(undefined, isActive ? 'המקצוע הופעל' : 'המקצוע הוסתר');
  });
}

/** הסתרת פוסט או ביקורת ישירות מהפאנל. */
export async function moderateContentAction(
  kind: 'post' | 'comment' | 'review',
  id: string,
  hide: boolean,
): Promise<ActionResult> {
  return guard(async () => {
    await requireAdmin();
    const admin = createAdminClient();

    if (kind === 'post') {
      await admin.from('professional_posts').update({ status: hide ? 'hidden' : 'published' }).eq('id', id);
    } else if (kind === 'comment') {
      await admin.from('post_comments').update({ is_hidden: hide }).eq('id', id);
    } else {
      await admin.from('reviews').update({ is_hidden: hide }).eq('id', id);
    }

    revalidatePath('/admin/content');
    return ok(undefined, hide ? 'התוכן הוסתר' : 'התוכן הוחזר');
  });
}
