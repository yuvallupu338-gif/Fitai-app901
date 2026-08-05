import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getNotifications } from '@/lib/data/dashboard';
import { NotificationsList } from '@/components/shared/notifications-list';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'התראות',
};

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const notifications = await getNotifications(50);

  return (
    <div className="px-4 py-4 lg:px-0">
      <NotificationsList initial={notifications} profileId={session.user.id} />
    </div>
  );
}
