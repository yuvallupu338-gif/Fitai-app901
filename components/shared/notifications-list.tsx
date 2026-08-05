'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BellRing, CheckCheck, Settings, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/format';
import {
  deleteNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/lib/actions/notifications';
import { useRealtime } from '@/hooks/use-realtime';
import type { Tables } from '@/types/database';

type NotificationRow = Tables<'notifications'> & {
  profiles: { id: string; username: string; full_name: string; avatar_url: string | null } | null;
};

/** מרכז ההתראות – מתעדכן בזמן אמת. */
export function NotificationsList({
  initial,
  profileId,
}: {
  initial: NotificationRow[];
  profileId: string;
}) {
  const router = useRouter();
  const [notifications, setNotifications] = React.useState(initial);
  const [filter, setFilter] = React.useState<'all' | 'unread'>('all');

  React.useEffect(() => setNotifications(initial), [initial]);

  useRealtime<NotificationRow>(
    { table: 'notifications', event: 'INSERT', filter: `profile_id=eq.${profileId}` },
    () => router.refresh(),
  );

  const visible = filter === 'unread' ? notifications.filter((n) => !n.is_read) : notifications;
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAll = async () => {
    const result = await markAllNotificationsReadAction();
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setNotifications((current) => current.map((n) => ({ ...n, is_read: true })));
    toast.success('כל ההתראות סומנו כנקראו');
  };

  const open = async (notification: NotificationRow) => {
    if (!notification.is_read) {
      setNotifications((current) =>
        current.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)),
      );
      void markNotificationReadAction(notification.id);
    }
    if (notification.link) router.push(notification.link);
  };

  const remove = async (id: string) => {
    setNotifications((current) => current.filter((n) => n.id !== id));
    void deleteNotificationAction(id);
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">התראות</h1>
        <div className="flex items-center gap-1">
          {unreadCount > 0 ? (
            <Button variant="ghost" size="sm" onClick={markAll}>
              <CheckCheck className="size-4" aria-hidden />
              סמן הכול כנקרא
            </Button>
          ) : null}
          <Button variant="ghost" size="icon-sm" asChild aria-label="הגדרות התראות">
            <Link href="/settings/notifications">
              <Settings className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex gap-1.5">
        {(
          [
            { value: 'all', label: 'הכול' },
            { value: 'unread', label: `שלא נקראו${unreadCount ? ` (${unreadCount})` : ''}` },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            aria-pressed={filter === option.value}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              filter === option.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={BellRing}
          title={filter === 'unread' ? 'אין התראות שלא נקראו' : 'אין עדיין התראות'}
          description="כאן יופיעו לייקים, תגובות, עוקבים חדשים, הזמנות, תזכורות וביקורות."
        />
      ) : (
        <ul className="space-y-1.5">
          {visible.map((notification) => (
            <li key={notification.id}>
              <div
                className={cn(
                  'group flex items-start gap-3 rounded-2xl border p-3 transition-colors',
                  notification.is_read
                    ? 'border-border/60 bg-card'
                    : 'border-primary/30 bg-primary/5',
                )}
              >
                <button
                  type="button"
                  onClick={() => open(notification)}
                  className="flex min-w-0 flex-1 items-start gap-3 text-start"
                >
                  {notification.profiles ? (
                    <UserAvatar
                      src={notification.profiles.avatar_url}
                      name={notification.profiles.full_name}
                      className="size-10 shrink-0"
                    />
                  ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <BellRing className="size-5" aria-hidden />
                    </span>
                  )}

                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-sm', notification.is_read ? '' : 'font-semibold')}>
                      {notification.title}
                    </span>
                    {notification.body ? (
                      <span className="block truncate text-sm text-muted-foreground">{notification.body}</span>
                    ) : null}
                    <time className="mt-0.5 block text-xs text-muted-foreground" dateTime={notification.created_at}>
                      {formatRelativeTime(notification.created_at)}
                    </time>
                  </span>
                </button>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(notification.id)}
                  aria-label="מחיקת ההתראה"
                  className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
