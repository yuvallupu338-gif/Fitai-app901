import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { NotificationSettingsForm } from '@/components/settings/notification-settings-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'הגדרות התראות' };

export default async function NotificationSettingsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return <NotificationSettingsForm prefs={session.user.notificationPrefs} />;
}
