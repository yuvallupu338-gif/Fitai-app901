import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getScheduleRange } from '@/lib/data/bookings';
import { getProfessionalEditData } from '@/lib/data/profiles';
import { ScheduleView } from '@/components/dashboard/schedule-view';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'לוח זמנים' };

export default async function SchedulePage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.user.professionalId) redirect('/pro/onboarding');

  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 60 * 86_400_000);

  const [schedule, editData] = await Promise.all([
    getScheduleRange(session.user.professionalId, from, to),
    getProfessionalEditData(session.user.professionalId),
  ]);

  return (
    <div className="space-y-4 px-4 py-4 lg:px-0">
      <h1 className="text-xl font-bold">לוח זמנים</h1>

      <ScheduleView
        bookings={schedule.bookings}
        blocked={editData.blockedDates}
        availability={schedule.availability}
      />
    </div>
  );
}
