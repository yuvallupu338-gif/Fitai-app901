'use client';

import * as React from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/format';
import { useRealtimeRefresh } from '@/hooks/use-realtime';
import type { ConversationSummary } from '@/types/app';

/** רשימת השיחות – מתעדכנת בזמן אמת כשמגיעה הודעה חדשה. */
export function ConversationList({
  conversations,
  currentUserId,
}: {
  conversations: ConversationSummary[];
  currentUserId: string;
}) {
  const [query, setQuery] = React.useState('');

  useRealtimeRefresh({ table: 'messages', event: 'INSERT' });

  const filtered = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((conversation) => {
      const name = conversation.other?.businessName ?? conversation.other?.fullName ?? '';
      return (
        name.toLowerCase().includes(term) ||
        (conversation.other?.username ?? '').toLowerCase().includes(term) ||
        (conversation.lastMessagePreview ?? '').toLowerCase().includes(term)
      );
    });
  }, [conversations, query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="חיפוש בשיחות…"
          className="ps-10"
          aria-label="חיפוש בשיחות"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">לא נמצאו שיחות מתאימות</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border/70 bg-card">
          {filtered.map((conversation) => {
            const name = conversation.other?.businessName ?? conversation.other?.fullName ?? 'משתמש';
            const unread = conversation.unreadCount > 0;

            return (
              <li key={conversation.id}>
                <Link
                  href={`/messages/${conversation.id}`}
                  className="flex items-center gap-3 p-3 transition-colors hover:bg-muted/60"
                >
                  <UserAvatar src={conversation.other?.avatarUrl} name={name} className="size-12" />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={cn('truncate', unread ? 'font-bold' : 'font-medium')}>{name}</p>
                      <time
                        className="shrink-0 text-xs text-muted-foreground"
                        dateTime={conversation.lastMessageAt}
                      >
                        {formatRelativeTime(conversation.lastMessageAt)}
                      </time>
                    </div>
                    <p
                      className={cn(
                        'truncate text-sm',
                        unread ? 'font-medium text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {conversation.lastSenderId === currentUserId ? 'את/ה: ' : ''}
                      {conversation.lastMessagePreview ?? 'התחילו שיחה'}
                    </p>
                  </div>

                  {unread ? (
                    <span className="flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                      {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
