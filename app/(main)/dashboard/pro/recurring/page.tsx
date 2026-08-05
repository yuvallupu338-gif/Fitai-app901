import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Repeat } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { getMySeries } from '@/lib/data/bookings';
import { SeriesCard, type SeriesCardData } from '@/components/booking/series-card';
import { EmptyState } from '@/components/ui/empty-state';
import { RealtimeRefresh } from '@/components/shared/realtime-refresh';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'סדרות קבועות' };

export default async function ProRecurringPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.user.professionalId) redirect('/pro/onboarding');

  const series = await getMySeries();
  const asProfessional = series.filter(
    (item) => item.professional_profiles?.id === session.user.professionalId,
  );

  return (
    <div className="space-y-4 px-4 py-4 lg:px-0">
      <RealtimeRefresh table="recurring_booking_series" />

      <h1 className="text-xl font-bold">סדרות קבועות</h1>

      {asProfessional.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="אין עדיין סדרות קבועות"
          description="אחרי טיפול שהושלם אפשר להציע ללקוח להפוך אותו לטיפול קבוע."
        />
      ) : (
        <ul className="space-y-3">
          {asProfessional.map((item) => (
            <li key={item.id}>
              <SeriesCard series={item as unknown as SeriesCardData} viewer="professional" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
