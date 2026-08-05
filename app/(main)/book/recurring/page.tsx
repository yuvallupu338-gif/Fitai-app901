import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { createAnonClient } from '@/lib/supabase/server';
import { getMyAddresses } from '@/lib/data/profiles';
import { getCities } from '@/lib/data/reference';
import { getBookingById } from '@/lib/data/bookings';
import { RecurringWizard } from '@/components/booking/recurring-wizard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'קביעת מפגש קבוע',
  description: 'קביעת סדרת טיפולים שחוזרת אוטומטית – למשל כל שבועיים ביום חמישי.',
};

type Props = {
  searchParams: Promise<{ professional?: string; service?: string; booking?: string }>;
};

export default async function RecurringBookingPage({ searchParams }: Props) {
  const query = await searchParams;
  const session = await getSession();
  if (!session) redirect('/login');

  // אפשר להגיע גם מהצעה של בעל המקצוע אחרי טיפול חד־פעמי.
  let professionalId = query.professional ?? null;
  let serviceId = query.service ?? null;

  if (query.booking) {
    const booking = await getBookingById(query.booking);
    if (booking) {
      professionalId = booking.professional_profiles?.id ?? professionalId;
      serviceId = booking.professional_services?.id ?? serviceId;
    }
  }

  if (!professionalId) notFound();

  const supabase = createAnonClient();

  const { data: professional } = await supabase
    .from('professional_profiles')
    .select(
      `id, business_name, avatar_url, is_verified, accepts_home_visits, accepts_studio, accepts_events,
       travel_fee, travel_fee_type, cancellation_policy,
       profiles:profile_id ( id, username, full_name, avatar_url ),
       cities:city_id ( id, name )`,
    )
    .eq('id', professionalId)
    .eq('status', 'active')
    .maybeSingle();

  if (!professional) notFound();

  const [{ data: services }, addresses, cities] = await Promise.all([
    supabase
      .from('professional_services')
      .select('*')
      .eq('professional_id', professionalId)
      .eq('is_active', true)
      .eq('supports_recurring', true)
      .is('deleted_at', null)
      .order('sort_order'),
    getMyAddresses(),
    getCities(),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 lg:px-0">
      <RecurringWizard
        professional={professional}
        services={services ?? []}
        addresses={addresses}
        cities={cities}
        preselectedServiceId={serviceId}
      />
    </div>
  );
}
