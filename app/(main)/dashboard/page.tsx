import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Bell,
  Bookmark,
  CalendarCheck,
  CalendarClock,
  MapPin,
  Repeat,
  Sparkles,
  Star,
} from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { getUserDashboard } from '@/lib/data/dashboard';
import { getMyBookings } from '@/lib/data/bookings';
import { StatTile } from '@/components/dashboard/stat-tile';
import { BookingCard, type BookingCardData } from '@/components/booking/booking-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { RefreshOnFocus } from '@/components/shared/refresh-on-focus';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'לוח הבקרה שלי',
};

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [stats, upcoming, pending] = await Promise.all([
    getUserDashboard(),
    getMyBookings('upcoming'),
    getMyBookings('pending'),
  ]);

  return (
    <div className="space-y-6 px-4 py-4 lg:px-0">
      <RefreshOnFocus />

      <header>
        <h1 className="text-xl font-bold">שלום, {session.user.fullName.split(' ')[0]}</h1>
        <p className="text-sm text-muted-foreground">כל מה שקורה אצלך במקום אחד</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label="הזמנות קרובות"
          value={stats.upcomingBookings}
          icon={CalendarCheck}
          tone="primary"
          href="/dashboard/bookings"
        />
        <StatTile
          label="ממתינות לאישור"
          value={stats.pendingBookings}
          icon={CalendarClock}
          tone="warning"
          href="/dashboard/bookings?tab=pending"
        />
        <StatTile
          label="מפגשים קבועים"
          value={stats.activeSeries}
          icon={Repeat}
          href="/dashboard/recurring"
        />
        <StatTile
          label="בעלי מקצוע שמורים"
          value={stats.savedProfessionals}
          icon={Bookmark}
          href="/profile/saved"
        />
        <StatTile label="ביקורות שכתבתי" value={stats.reviewsWritten} icon={Star} href="/profile/reviews" />
        <StatTile
          label="התראות שלא נקראו"
          value={stats.unreadNotifications}
          icon={Bell}
          href="/notifications"
        />
      </div>

      {pending.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-semibold">ממתינות לאישור בעל המקצוע</h2>
          <ul className="space-y-3">
            {pending.map((booking) => (
              <li key={booking.id}>
                <BookingCard booking={booking as unknown as BookingCardData} viewer="client" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">ההזמנות הקרובות שלי</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/bookings">הכול</Link>
          </Button>
        </div>

        {upcoming.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title="אין הזמנות קרובות"
            description="מצאו בעל מקצוע שאהבתם והזמינו טיפול – חד־פעמי או קבוע."
            action={
              <Button asChild>
                <Link href="/search">חיפוש בעלי מקצוע</Link>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {upcoming.slice(0, 5).map((booking) => (
              <li key={booking.id}>
                <BookingCard booking={booking as unknown as BookingCardData} viewer="client" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link href="/settings/addresses" className="surface surface-hover flex items-center gap-3 p-4">
          <MapPin className="size-5 text-primary" aria-hidden />
          <span>
            <span className="block font-medium">הכתובות שלי</span>
            <span className="block text-xs text-muted-foreground">ניהול כתובות לביקורי בית</span>
          </span>
        </Link>

        {!session.user.isProfessional ? (
          <Link href="/pro/onboarding" className="surface surface-hover flex items-center gap-3 border-primary/30 bg-primary/5 p-4">
            <Sparkles className="size-5 text-primary" aria-hidden />
            <span>
              <span className="block font-medium">הפוך גם לבעל מקצוע</span>
              <span className="block text-xs text-muted-foreground">אותו חשבון, פרופיל מקצועי חדש</span>
            </span>
          </Link>
        ) : (
          <Link href="/dashboard/pro" className="surface surface-hover flex items-center gap-3 p-4">
            <Sparkles className="size-5 text-primary" aria-hidden />
            <span>
              <span className="block font-medium">לוח הבקרה המקצועי</span>
              <span className="block text-xs text-muted-foreground">הזמנות, יומן ולקוחות</span>
            </span>
          </Link>
        )}
      </section>
    </div>
  );
}
