import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { getSeriesById } from '@/lib/data/bookings';
import { SeriesCard, type SeriesCardData } from '@/components/booking/series-card';
import { OccurrenceList } from '@/components/booking/occurrence-list';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'סדרת מפגשים קבועה' };

type Props = { params: Promise<{ id: string }> };

export default async function SeriesDetailsPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/login');

  const { series, occurrences } = await getSeriesById(id);
  if (!series) notFound();

  const isClient = series.profiles?.id === session.user.id;

  return (
    <div className="space-y-4 px-4 py-4 lg:px-0">
      <Button variant="ghost" size="sm" asChild>
        <Link href={isClient ? '/dashboard/recurring' : '/dashboard/pro/recurring'}>
          <ArrowRight className="size-4" aria-hidden />
          חזרה
        </Link>
      </Button>

      <SeriesCard series={series as unknown as SeriesCardData} viewer={isClient ? 'client' : 'professional'} />

      <OccurrenceList
        occurrences={occurrences}
        seriesStatus={series.status}
        durationMinutes={series.duration_minutes}
      />
    </div>
  );
}
