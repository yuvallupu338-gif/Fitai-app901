import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarX } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { getMyBookings } from '@/lib/data/bookings';
import { BookingCard, type BookingCardData } from '@/components/booking/booking-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { RealtimeRefresh } from '@/components/shared/realtime-refresh';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ההזמנות שלי',
};

const TABS = [
  { value: 'upcoming', label: 'קרובות' },
  { value: 'pending', label: 'ממתינות לאישור' },
  { value: 'past', label: 'היסטוריה' },
] as const;

type Props = { searchParams: Promise<{ tab?: string }> };

export default async function MyBookingsPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');

  const params = await searchParams;
  const tab = (TABS.find((t) => t.value === params.tab)?.value ?? 'upcoming') as
    | 'upcoming'
    | 'pending'
    | 'past';

  const bookings = await getMyBookings(tab);

  return (
    <div className="space-y-4 px-4 py-4 lg:px-0">
      <RealtimeRefresh table="bookings" filter={`client_id=eq.${session.user.id}`} />

      <h1 className="text-xl font-bold">ההזמנות שלי</h1>

      <nav className="flex gap-1.5" aria-label="סינון הזמנות">
        {TABS.map((item) => (
          <Link
            key={item.value}
            href={`/dashboard/bookings?tab=${item.value}`}
            aria-current={tab === item.value ? 'page' : undefined}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
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
          title={tab === 'past' ? 'אין עדיין היסטוריית טיפולים' : 'אין הזמנות להצגה'}
          description="כשתזמינו בעל מקצוע, ההזמנה תופיע כאן עם כל הפרטים והסטטוס העדכני."
          action={
            <Button asChild>
              <Link href="/search">חיפוש בעלי מקצוע</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {bookings.map((booking) => (
            <li key={booking.id}>
              <BookingCard booking={booking as unknown as BookingCardData} viewer="client" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
