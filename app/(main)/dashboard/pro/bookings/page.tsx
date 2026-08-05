import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarX } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { getProfessionalBookings } from '@/lib/data/bookings';
import { BookingCard, type BookingCardData } from '@/components/booking/booking-card';
import { EmptyState } from '@/components/ui/empty-state';
import { RealtimeRefresh } from '@/components/shared/realtime-refresh';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'הזמנות' };

const TABS = [
  { value: 'new', label: 'חדשות' },
  { value: 'today', label: 'היום' },
  { value: 'upcoming', label: 'קרובות' },
  { value: 'past', label: 'היסטוריה' },
] as const;

type Props = { searchParams: Promise<{ tab?: string }> };

export default async function ProBookingsPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.user.professionalId) redirect('/pro/onboarding');

  const params = await searchParams;
  const tab = (TABS.find((t) => t.value === params.tab)?.value ?? 'new') as
    | 'new'
    | 'today'
    | 'upcoming'
    | 'past';

  const bookings = await getProfessionalBookings(session.user.professionalId, tab);

  return (
    <div className="space-y-4 px-4 py-4 lg:px-0">
      <RealtimeRefresh table="bookings" filter={`professional_id=eq.${session.user.professionalId}`} />

      <h1 className="text-xl font-bold">הזמנות</h1>

      <nav className="scroll-x" aria-label="סינון הזמנות">
        {TABS.map((item) => (
          <Link
            key={item.value}
            href={`/dashboard/pro/bookings?tab=${item.value}`}
            aria-current={tab === item.value ? 'page' : undefined}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              tab === item.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {bookings.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title="אין הזמנות בקטגוריה הזו"
          description="ברגע שלקוח ישלח בקשה היא תופיע כאן ותקבלו התראה."
        />
      ) : (
        <ul className="space-y-3">
          {bookings.map((booking) => (
            <li key={booking.id}>
              <BookingCard booking={booking as unknown as BookingCardData} viewer="professional" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
