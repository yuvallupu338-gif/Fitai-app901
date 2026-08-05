'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, PlusSquare, MessageCircle, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRealtime } from '@/hooks/use-realtime';
import { UserAvatar } from '@/components/ui/avatar';
import type { SessionUser } from '@/lib/auth/session';

const ITEMS = [
  { href: '/', label: 'בית', icon: Home, exact: true },
  { href: '/search', label: 'חיפוש', icon: Search },
  { href: '/create', label: 'יצירה', icon: PlusSquare },
  { href: '/messages', label: 'הודעות', icon: MessageCircle, badge: 'messages' as const },
  { href: '/profile', label: 'פרופיל', icon: UserRound, avatar: true },
];

/** ניווט תחתון – ההתמצאות הראשית בטלפון. */
export function BottomNav({
  user,
  unreadMessages,
}: {
  user: SessionUser | null;
  unreadMessages: number;
}) {
  const pathname = usePathname();
  const [messages, setMessages] = React.useState(unreadMessages);

  React.useEffect(() => setMessages(unreadMessages), [unreadMessages]);

  // עדכון מיידי של תג ההודעות כשמגיעה הודעה חדשה.
  useRealtime<{ sender_id: string }>(
    { table: 'messages', event: 'INSERT', enabled: Boolean(user) },
    (payload) => {
      const senderId = (payload.new as { sender_id?: string } | null)?.sender_id;
      if (senderId && senderId !== user?.id && !pathname.startsWith('/messages')) {
        setMessages((count) => count + 1);
      }
    },
  );

  React.useEffect(() => {
    if (pathname.startsWith('/messages')) setMessages(0);
  }, [pathname]);

  if (!user) return null;

  return (
    <nav
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/95 backdrop-blur-lg lg:hidden"
      aria-label="ניווט ראשי"
    >
      <ul className="flex items-stretch justify-around">
        {ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const badgeCount = item.badge === 'messages' ? messages : 0;

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="relative">
                  {item.avatar && user.avatarUrl ? (
                    <UserAvatar
                      src={user.avatarUrl}
                      name={user.fullName}
                      className={cn('size-6', active && 'ring-2 ring-primary ring-offset-2 ring-offset-card')}
                    />
                  ) : (
                    <item.icon
                      className={cn('size-6 transition-transform', active && 'scale-110')}
                      strokeWidth={active ? 2.4 : 1.8}
                      aria-hidden
                    />
                  )}

                  {badgeCount > 0 ? (
                    <span
                      className="absolute -end-1.5 -top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
                      aria-label={`${badgeCount} הודעות שלא נקראו`}
                    >
                      {badgeCount > 9 ? '9+' : badgeCount}
                    </span>
                  ) : null}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
