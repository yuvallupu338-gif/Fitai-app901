import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { createAnonClient } from '@/lib/supabase/server';
import { getMyAddresses } from '@/lib/data/profiles';
import { getCities } from '@/lib/data/reference';
import { BookingWizard } from '@/components/booking/booking-wizard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'הזמנת טיפול',
  description: 'בחירת שירות, מועד ומיקום להזמנת בעל מקצוע.',
};

type Props = {
  params: Promise<{ professionalId: string }>;
  searchParams: Promise<{ service?: string; post?: string }>;
};

export default async function BookingPage({ params, searchParams }: Props) {
  const { professionalId } = await params;
  const query = await searchParams;

  const session = await getSession();
  if (!session) redirect(`/login?next=/book/${professionalId}`);

  const supabase = createAnonClient();

  const { data: professional } = await supabase
    .from('professional_profiles')
    .select(
      `id, business_name, avatar_url, is_verified, status, accepts_home_visits, accepts_studio,
       accepts_events, accepts_online, travel_fee, travel_fee_type, max_travel_km,
       cancellation_policy, min_lead_time_minutes, max_lead_time_days,
       profiles:profile_id ( id, username, full_name, avatar_url ),
       cities:city_id ( id, name )`,
    )
    .eq('id', professionalId)
    .eq('status', 'active')
    .maybeSingle();

  if (!professional) notFound();

  if (professional.profiles?.id === session.user.id) {
    redirect(`/u/${session.user.username}`);
  }

  const [{ data: services }, addresses, cities] = await Promise.all([
    supabase
      .from('professional_services')
      .select('*')
      .eq('professional_id', professionalId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order'),
    getMyAddresses(),
    getCities(),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 lg:px-0">
      <BookingWizard
        professional={professional}
        services={services ?? []}
        addresses={addresses}
        cities={cities}
        preselectedServiceId={query.service ?? null}
        sourcePostId={query.post ?? null}
        user={session.user}
      />
    </div>
  );
}
