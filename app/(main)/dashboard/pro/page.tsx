import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Bookmark,
  CalendarCheck,
  CalendarClock,
  Eye,
  Heart,
  Repeat,
  Star,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { getProfessionalDashboard } from '@/lib/data/dashboard';
import { getProfessionalBookings } from '@/lib/data/bookings';
import { getProfessionalReadiness } from '@/lib/data/profiles';
import { StatTile } from '@/components/dashboard/stat-tile';
import { BookingCard, type BookingCardData } from '@/components/booking/booking-card';
import { QuickAvailability } from '@/components/dashboard/quick-availability';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { RealtimeRefresh } from '@/components/shared/realtime-refresh';
import { formatPrice, formatRating, formatResponseTime } from '@/lib/format';
import { PROFESSIONAL_STATUS_LABELS, READINESS_LABELS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'לוח הבקרה המקצועי' };

export default async function ProDashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.user.professionalId) redirect('/pro/onboarding');

  const professionalId = session.user.professionalId;

  const [stats, newRequests, today, readiness] = await Promise.all([
    getProfessionalDashboard(professionalId),
    getProfessionalBookings(professionalId, 'new'),
    getProfessionalBookings(professionalId, 'today'),
    getProfessionalReadiness(professionalId),
  ]);

  const profile = stats.profile;

  return (
    <div className="space-y-6 px-4 py-4 lg:px-0">
      <RealtimeRefresh table="bookings" filter={`professional_id=eq.${professionalId}`} />

      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">לוח הבקרה המקצועי</h1>
          <p className="text-sm text-muted-foreground">
            סטטוס הפרופיל:{' '}
            <Badge variant={profile?.status === 'active' ? 'success' : 'warning'}>
              {PROFESSIONAL_STATUS_LABELS[profile?.status ?? 'draft']}
            </Badge>
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/pro/onboarding">עריכת הפרופיל</Link>
        </Button>
      </header>

      {readiness && !readiness.ready ? (
        <section className="surface space-y-2 border-warning/40 bg-warning/5 p-4">
          <div className="flex items-center justify-between">
            <p className="font-medium">הפרופיל שלך עדיין לא מופיע בחיפוש</p>
            <span className="font-bold text-primary">{readiness.completion}%</span>
          </div>
          <Progress value={readiness.completion} />
          <p className="text-sm text-muted-foreground">
            חסר: {readiness.missing.map((item) => READINESS_LABELS[item] ?? item).join(', ')}
          </p>
          <Button size="sm" asChild>
            <Link href="/pro/onboarding">השלמת הפרופיל</Link>
          </Button>
        </section>
      ) : (
        <QuickAvailability
          availableToday={profile?.available_today ?? false}
          availableNow={profile?.available_now ?? false}
          availableNowUntil={profile?.available_now_until ?? null}
        />
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile
          label="בקשות חדשות"
          value={stats.newRequests}
          icon={CalendarClock}
          tone="warning"
          href="/dashboard/pro/bookings?tab=new"
        />
        <StatTile
          label="הזמנות היום"
          value={stats.todayBookings}
          icon={CalendarCheck}
          tone="primary"
          href="/dashboard/pro/schedule"
        />
        <StatTile
          label="מפגשים קבועים"
          value={stats.activeSeries}
          icon={Repeat}
          href="/dashboard/pro/clients"
        />
        <StatTile
          label="הכנסה משוערת החודש"
          value={formatPrice(stats.estimatedRevenue, { compact: true })}
          icon={Wallet}
          tone="success"
          href="/dashboard/pro/stats"
        />
        <StatTile
          label="דירוג"
          value={profile?.rating_count ? formatRating(profile.rating_avg) : '—'}
          icon={Star}
          hint={`${profile?.rating_count ?? 0} ביקורות`}
          href="/dashboard/pro/reviews"
        />
        <StatTile
          label="לקוחות"
          value={profile?.clients_count ?? 0}
          icon={Users}
          href="/dashboard/pro/clients"
        />
        <StatTile label="צפיות בפרופיל" value={profile?.profile_views_count ?? 0} icon={Eye} />
        <StatTile label="לייקים" value={stats.totalLikes} icon={Heart} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="עוקבים חדשים השבוע" value={stats.newFollowers} icon={TrendingUp} />
        <StatTile label="שמירות" value={stats.totalSaves} icon={Bookmark} />
        <StatTile
          label="הזמנות שהגיעו מפוסטים"
          value={stats.bookingsFromPosts}
          icon={CalendarCheck}
        />
      </div>

      {profile?.response_time_minutes ? (
        <p className="text-sm text-muted-foreground">
          זמן תגובה ממוצע: {formatResponseTime(profile.response_time_minutes)}
        </p>
      ) : null}

      {newRequests.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-semibold">בקשות שממתינות לך</h2>
          <ul className="space-y-3">
            {newRequests.map((booking) => (
              <li key={booking.id}>
                <BookingCard booking={booking as unknown as BookingCardData} viewer="professional" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">היום ביומן</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/pro/schedule">לוח הזמנים</Link>
          </Button>
        </div>

        {today.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title="אין הזמנות להיום"
            description="זה זמן טוב לפרסם עבודה חדשה או לעדכן זמינות."
            action={
              <Button asChild>
                <Link href="/create">פרסום עבודה</Link>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {today.map((booking) => (
              <li key={booking.id}>
                <BookingCard booking={booking as unknown as BookingCardData} viewer="professional" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { href: '/dashboard/pro/services', label: 'שירותים ומחירים' },
          { href: '/dashboard/pro/schedule', label: 'זמינות וחסימות' },
          { href: '/dashboard/pro/reviews', label: 'ביקורות' },
          { href: '/dashboard/pro/settings', label: 'הגדרות מקצועיות' },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="surface surface-hover p-4 text-center text-sm font-medium">
            {item.label}
          </Link>
        ))}
      </section>
    </div>
  );
}
