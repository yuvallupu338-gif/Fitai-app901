'use server';

import { revalidatePath } from 'next/cache';
import { getScopedClient, requireSession } from '@/lib/auth/session';
import { guard, ok } from '@/lib/actions/result';
import type { ActionResult } from '@/types/app';

export async function markNotificationReadAction(notificationId: string): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const supabase = await getScopedClient();

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('profile_id', session.user.id);

    if (error) throw new Error(error.message);

    revalidatePath('/notifications');
    return ok(undefined);
  });
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const supabase = await getScopedClient();

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('profile_id', session.user.id)
      .eq('is_read', false);

    if (error) throw new Error(error.message);

    revalidatePath('/notifications');
    return ok(undefined, 'כל ההתראות סומנו כנקראו');
  });
}

export async function deleteNotificationAction(notificationId: string): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const supabase = await getScopedClient();

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('profile_id', session.user.id);

    if (error) throw new Error(error.message);

    revalidatePath('/notifications');
    return ok(undefined);
  });
}

/** שמירת מנוי Push של הדפדפן. */
export async function savePushSubscriptionAction(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const supabase = await getScopedClient();

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        profile_id: session.user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: subscription.userAgent ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    );

    if (error) throw new Error(error.message);
    return ok(undefined, 'התראות Push הופעלו');
  });
}

export async function removePushSubscriptionAction(endpoint: string): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const supabase = await getScopedClient();

    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('profile_id', session.user.id);

    if (error) throw new Error(error.message);
    return ok(undefined, 'התראות Push בוטלו');
  });
}
