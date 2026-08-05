'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Bookmark,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Repeat,
  Settings,
  Shield,
  Sparkles,
  Star,
  UserRound,
} from 'lucide-react';
import { UserAvatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logoutAction } from '@/lib/actions/auth';
import type { SessionUser } from '@/lib/auth/session';

export function UserMenu({ user }: { user: SessionUser }) {
  const [pending, startTransition] = React.useTransition();
  const isPro = user.isProfessional && user.activeMode === 'professional';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="תפריט המשתמש"
        >
          <UserAvatar src={user.avatarUrl} name={user.fullName} className="size-9" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center gap-2 py-3">
          <UserAvatar src={user.avatarUrl} name={user.fullName} className="size-9" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">{user.fullName}</span>
            <span className="block truncate text-xs" dir="ltr">
              @{user.username}
            </span>
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href={`/u/${user.username}`}>
            <UserRound aria-hidden />
            הפרופיל שלי
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/dashboard">
            <LayoutDashboard aria-hidden />
            לוח הבקרה שלי
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/dashboard/bookings">
            <CalendarDays aria-hidden />
            ההזמנות שלי
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/dashboard/recurring">
            <Repeat aria-hidden />
            מפגשים קבועים
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/profile/saved">
            <Bookmark aria-hidden />
            שמורים
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/profile/reviews">
            <Star aria-hidden />
            הביקורות שכתבתי
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {user.isProfessional ? (
          <DropdownMenuItem asChild>
            <Link href="/dashboard/pro">
              <Sparkles aria-hidden />
              {isPro ? 'לוח הבקרה המקצועי' : 'הפרופיל המקצועי שלי'}
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild>
            <Link href="/pro/onboarding">
              <Sparkles aria-hidden />
              הפוך לבעל מקצוע
            </Link>
          </DropdownMenuItem>
        )}

        {user.role === 'admin' || user.role === 'moderator' ? (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <Shield aria-hidden />
              פאנל ניהול
            </Link>
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden />
            הגדרות
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          destructive
          onSelect={(event) => {
            event.preventDefault();
            startTransition(() => {
              void logoutAction();
            });
          }}
          aria-disabled={pending}
        >
          <LogOut aria-hidden />
          {pending ? 'מתנתק…' : 'התנתקות'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
