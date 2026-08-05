'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Sparkles } from 'lucide-react';
import { APP_NAME } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { ModeSwitcher } from '@/components/layout/mode-switcher';
import { UserMenu } from '@/components/layout/user-menu';
import { useRealtime } from '@/hooks/use-realtime';
import type { SessionUser } from '@/lib/auth/session';

export function TopBar({
  user,
  unreadNotifications,
}: {
  user: SessionUser | null;
  unreadNotifications: number;
}) {
  const pathname = usePathname();
  const [notifications, setNotifications] = React.useState(unreadNotifications);

  React.useEffect(() => setNotifications(unreadNotifications), [unreadNotifications]);

  useRealtime(
    { table: 'notifications', event: 'INSERT', enabled: Boolean(user), filter: user ? `profile_id=eq.${user.id}` : undefined },
    () => setNotifications((count) => count + 1),
  );

  React.useEffect(() => {
    if (pathname === '/notifications') setNotifications(0);
  }, [pathname]);

  return (
    <header className="safe-top sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-lg">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 lg:px-6">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <span className="hidden sm:inline">{APP_NAME}</span>
        </Link>

        <div className="flex items-center gap-1">
          {user ? (
            <>
              {user.isProfessional ? <ModeSwitcher user={user} /> : null}

              <Button variant="ghost" size="icon" asChild className="relative">
                <Link href="/notifications" aria-label={`התראות${notifications ? `, ${notifications} חדשות` : ''}`}>
                  <Bell className="size-5" aria-hidden />
                  {notifications > 0 ? (
                    <span
                      className={cn(
                        'absolute end-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1',
                        'text-[10px] font-bold text-primary-foreground',
                      )}
                    >
                      {notifications > 9 ? '9+' : notifications}
                    </span>
                  ) : null}
                </Link>
              </Button>

              <ThemeToggle />
              <UserMenu user={user} />
            </>
          ) : (
            <>
              <ThemeToggle />
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">התחברות</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/register">הרשמה</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
