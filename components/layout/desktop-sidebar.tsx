'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  Bookmark,
  CalendarClock,
  CalendarDays,
  Home,
  LayoutDashboard,
  MessageCircle,
  PlusSquare,
  Repeat,
  Search,
  Settings,
  Shield,
  Sparkles,
  TrendingUp,
  UserRound,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { SessionUser } from '@/lib/auth/session';

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  exact?: boolean;
  badge?: number;
};

/** ניווט צדדי – מוצג בטאבלט ובמחשב בלבד. */
export function DesktopSidebar({
  user,
  unreadMessages,
  unreadNotifications,
}: {
  user: SessionUser | null;
  unreadMessages: number;
  unreadNotifications: number;
}) {
  const pathname = usePathname();

  if (!user) return null;

  const isProMode = user.isProfessional && user.activeMode === 'professional';

  const mainItems: NavItem[] = [
    { href: '/', label: 'בית', icon: Home, exact: true },
    { href: '/search', label: 'חיפוש', icon: Search },
    { href: '/create', label: 'יצירה', icon: PlusSquare },
    { href: '/messages', label: 'הודעות', icon: MessageCircle, badge: unreadMessages },
    { href: '/notifications', label: 'התראות', icon: Bell, badge: unreadNotifications },
    { href: `/u/${user.username}`, label: 'הפרופיל שלי', icon: UserRound },
  ];

  const userItems: NavItem[] = [
    { href: '/dashboard', label: 'לוח הבקרה', icon: LayoutDashboard, exact: true },
    { href: '/dashboard/bookings', label: 'ההזמנות שלי', icon: CalendarDays },
    { href: '/dashboard/recurring', label: 'מפגשים קבועים', icon: Repeat },
    { href: '/profile/saved', label: 'שמורים', icon: Bookmark },
  ];

  const proItems: NavItem[] = [
    { href: '/dashboard/pro', label: 'לוח בקרה מקצועי', icon: Sparkles, exact: true },
    { href: '/dashboard/pro/bookings', label: 'הזמנות', icon: CalendarDays },
    { href: '/dashboard/pro/schedule', label: 'לוח זמנים', icon: CalendarClock },
    { href: '/dashboard/pro/clients', label: 'לקוחות קבועים', icon: Users },
    { href: '/dashboard/pro/stats', label: 'נתונים מקצועיים', icon: TrendingUp },
  ];

  const renderItems = (items: NavItem[]) =>
    items.map((item) => {
      const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
      return (
        <li key={item.href}>
          <Link
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
              active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <item.icon className="size-5 shrink-0" strokeWidth={active ? 2.3 : 1.8} aria-hidden />
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge ? (
              <span className="flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            ) : null}
          </Link>
        </li>
      );
    });

  return (
    <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-64 shrink-0 overflow-y-auto py-6 lg:block">
      <nav aria-label="ניווט צדדי" className="space-y-6">
        <ul className="space-y-1">{renderItems(mainItems)}</ul>

        {isProMode ? (
          <div className="space-y-1">
            <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              מצב בעל מקצוע
            </p>
            <ul className="space-y-1">{renderItems(proItems)}</ul>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">האזור שלי</p>
            <ul className="space-y-1">{renderItems(userItems)}</ul>
          </div>
        )}

        <div className="space-y-1">
          <ul className="space-y-1">
            {renderItems([
              { href: '/settings', label: 'הגדרות', icon: Settings },
              ...(user.role === 'admin' || user.role === 'moderator'
                ? [{ href: '/admin', label: 'פאנל ניהול', icon: Shield }]
                : []),
            ])}
          </ul>
        </div>

        {!user.isProfessional ? (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-semibold">גם אתם בעלי מקצוע?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              פרסמו את העבודות שלכם, קבלו עוקבים והזמנות – באותו חשבון.
            </p>
            <Button size="sm" className="mt-3 w-full" asChild>
              <Link href="/pro/onboarding">יצירת פרופיל מקצועי</Link>
            </Button>
          </div>
        ) : null}
      </nav>
    </aside>
  );
}
