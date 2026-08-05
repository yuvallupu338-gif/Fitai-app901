import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Repeat } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { getMySeries } from '@/lib/data/bookings';
import { SeriesCard, type SeriesCardData } from '@/components/booking/series-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { RealtimeRefresh } from '@/components/shared/realtime-refresh';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'מפגשים קבועים' };

export default async function RecurringPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const series = await getMySeries();
  const asClient = series.filter((item) => item.profiles?.id === session.user.id);

  return (
    <div className="space-y-4 px-4 py-4 lg:px-0">
      <RealtimeRefresh table="recurring_booking_series" />

      <header>
        <h1 className="text-xl font-bold">מפגשים קבועים</h1>
        <p className="text-sm text-muted-foreground">
          טיפולים שחוזרים אוטומטית – למשל &quot;כל שבועיים ביום חמישי ב־17:00&quot;.
        </p>
      </header>

      {asClient.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="אין עדיין מפגשים קבועים"
          description="אפשר להפוך כל טיפול לסדרה קבועה: בוחרים תדירות, יום ושעה – והמפגשים נקבעים אוטומטית."
          action={
            <Button asChild>
              <Link href="/search?recurring=true">בעלי מקצוע שמקבלים מפגשים קבועים</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {asClient.map((item) => (
            <li key={item.id}>
              <SeriesCard series={item as unknown as SeriesCardData} viewer="client" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
