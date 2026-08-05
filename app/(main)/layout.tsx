import { getSession } from '@/lib/auth/session';
import { getUnreadNotificationCount } from '@/lib/data/dashboard';
import { getUnreadMessageCount } from '@/lib/data/messages';
import { TopBar } from '@/components/layout/top-bar';
import { BottomNav } from '@/components/layout/bottom-nav';
import { DesktopSidebar } from '@/components/layout/desktop-sidebar';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  // מונים ראשוניים מהשרת; מכאן ואילך הם מתעדכנים בזמן אמת.
  const [unreadMessages, unreadNotifications] = session
    ? await Promise.all([getUnreadMessageCount(), getUnreadNotificationCount()])
    : [0, 0];

  return (
    <div className="min-h-dvh">
      <TopBar user={session?.user ?? null} unreadNotifications={unreadNotifications} />

      <div className="mx-auto flex w-full max-w-7xl gap-6 px-0 lg:px-6">
        <DesktopSidebar
          user={session?.user ?? null}
          unreadMessages={unreadMessages}
          unreadNotifications={unreadNotifications}
        />

        <main id="main" className="min-w-0 flex-1 pb-24 lg:pb-10">
          {children}
        </main>
      </div>

      <BottomNav user={session?.user ?? null} unreadMessages={unreadMessages} />
    </div>
  );
}
