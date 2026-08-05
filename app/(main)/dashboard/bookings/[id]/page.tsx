import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, History } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { getBookingById, getBookingHistory } from '@/lib/data/bookings';
import { BookingCard, type BookingCardData } from '@/components/booking/booking-card';
import { ReviewDialog } from '@/components/booking/review-dialog';
import { Button } from '@/components/ui/button';
import { BOOKING_STATUS_LABELS } from '@/lib/constants';
import { formatDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'פרטי ההזמנה' };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ review?: string }>;
};

export default async function BookingDetailsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;

  const session = await getSession();
  if (!session) redirect('/login');

  const booking = await getBookingById(id);
  if (!booking) notFound();

  const isClient = booking.profiles?.id === session.user.id;
  const history = await getBookingHistory(id);

  return (
    <div className="space-y-4 px-4 py-4 lg:px-0">
      <Button variant="ghost" size="sm" asChild>
        <Link href={isClient ? '/dashboard/bookings' : '/dashboard/pro/bookings'}>
          <ArrowRight className="size-4" aria-hidden />
          חזרה להזמנות
        </Link>
      </Button>

      <BookingCard
        booking={booking as unknown as BookingCardData}
        viewer={isClient ? 'client' : 'professional'}
      />

      {isClient && booking.status === 'completed' && !booking.reviews ? (
        <ReviewDialog
          bookingId={booking.id}
          professionalName={booking.professional_profiles?.business_name ?? ''}
          serviceName={booking.professional_services?.name ?? ''}
          defaultOpen={query.review === '1'}
        />
      ) : null}

      <section className="surface p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <History className="size-4 text-primary" aria-hidden />
          היסטוריית ההזמנה
        </h2>

        <ol className="space-y-3">
          {history.map((entry) => (
            <li key={entry.id} className="flex gap-3">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  {entry.from_status
                    ? `${BOOKING_STATUS_LABELS[entry.from_status]} → ${BOOKING_STATUS_LABELS[entry.to_status]}`
                    : `נוצרה הזמנה (${BOOKING_STATUS_LABELS[entry.to_status]})`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(entry.created_at)}
                  {entry.profiles?.full_name ? ` · ${entry.profiles.full_name}` : ''}
                </p>
                {entry.note ? <p className="text-xs text-muted-foreground">{entry.note}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
