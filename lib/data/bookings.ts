import 'server-only';
import { getScopedClient } from '@/lib/auth/session';
import { ACTIVE_BOOKING_STATUSES } from '@/lib/constants';

const BOOKING_SELECT = `
  id, status, location_type, scheduled_start, scheduled_end, duration_minutes,
  price_type, price_amount, travel_fee, total_price, people_count, notes,
  inspiration_url, event_address, proposed_start, proposed_price, proposed_note,
  address_revealed, series_id, source_post_id, conversation_id,
  guardian_approved, cancel_reason, cancelled_by, created_at,
  confirmed_at, on_the_way_at, arrived_at, started_at, completed_at,
  professional_services:service_id ( id, name, duration_minutes, price_type ),
  professional_profiles:professional_id (
    id, business_name, avatar_url, cancellation_policy, is_verified,
    profiles:profile_id ( id, username, full_name, avatar_url )
  ),
  profiles:client_id ( id, username, full_name, avatar_url ),
  service_addresses:address_id ( id, label, street, house_number, apartment, floor, entrance_code, arrival_notes, has_parking, cities:city_id ( name ) ),
  recurring_booking_series:series_id ( id, frequency, status ),
  reviews ( id, rating )
`;

/** ההזמנות של המשתמש כלקוח. */
export async function getMyBookings(kind: 'upcoming' | 'past' | 'pending' = 'upcoming') {
  const supabase = await getScopedClient();
  const now = new Date().toISOString();

  let query = supabase.from('bookings').select(BOOKING_SELECT);

  if (kind === 'upcoming') {
    query = query.in('status', ACTIVE_BOOKING_STATUSES).gte('scheduled_start', now).order('scheduled_start');
  } else if (kind === 'pending') {
    query = query.in('status', ['pending', 'change_proposed']).order('scheduled_start');
  } else {
    query = query
      .in('status', ['completed', 'cancelled', 'no_show'])
      .order('scheduled_start', { ascending: false })
      .limit(50);
  }

  const { data, error } = await query;
  if (error) console.error('[bookings]', error.message);
  return data ?? [];
}

/** ההזמנות של המשתמש כבעל מקצוע. */
export async function getProfessionalBookings(
  professionalId: string,
  kind: 'new' | 'today' | 'upcoming' | 'past' = 'upcoming',
) {
  const supabase = await getScopedClient();
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);

  let query = supabase.from('bookings').select(BOOKING_SELECT).eq('professional_id', professionalId);

  if (kind === 'new') {
    query = query.eq('status', 'pending').order('created_at', { ascending: false });
  } else if (kind === 'today') {
    query = query
      .gte('scheduled_start', startOfDay.toISOString())
      .lt('scheduled_start', endOfDay.toISOString())
      .not('status', 'in', '("cancelled")')
      .order('scheduled_start');
  } else if (kind === 'upcoming') {
    query = query
      .in('status', ACTIVE_BOOKING_STATUSES)
      .gte('scheduled_start', now.toISOString())
      .order('scheduled_start');
  } else {
    query = query
      .in('status', ['completed', 'cancelled', 'no_show'])
      .order('scheduled_start', { ascending: false })
      .limit(50);
  }

  const { data, error } = await query;
  if (error) console.error('[pro-bookings]', error.message);
  return data ?? [];
}

export async function getBookingById(bookingId: string) {
  const supabase = await getScopedClient();
  const { data } = await supabase.from('bookings').select(BOOKING_SELECT).eq('id', bookingId).maybeSingle();
  return data;
}

export async function getBookingHistory(bookingId: string) {
  const supabase = await getScopedClient();
  const { data } = await supabase
    .from('booking_status_history')
    .select('id, from_status, to_status, note, created_at, profiles:changed_by ( username, full_name )')
    .eq('booking_id', bookingId)
    .order('created_at');

  return data ?? [];
}

/** כל ההזמנות בטווח תאריכים – לתצוגת לוח השנה של בעל המקצוע. */
export async function getScheduleRange(professionalId: string, from: Date, to: Date) {
  const supabase = await getScopedClient();

  const [bookings, blocked, availability] = await Promise.all([
    supabase
      .from('bookings')
      .select(
        `id, status, scheduled_start, scheduled_end, duration_minutes, buffer_minutes, location_type,
         series_id, price_amount, travel_fee,
         professional_services:service_id ( name ),
         profiles:client_id ( id, username, full_name, avatar_url ),
         service_addresses:address_id ( label, street, house_number, cities:city_id ( name ) )`,
      )
      .eq('professional_id', professionalId)
      .gte('scheduled_start', from.toISOString())
      .lte('scheduled_start', to.toISOString())
      .not('status', 'eq', 'cancelled')
      .order('scheduled_start'),
    supabase
      .from('unavailable_dates')
      .select('id, start_at, end_at, reason, is_vacation')
      .eq('professional_id', professionalId)
      .lte('start_at', to.toISOString())
      .gte('end_at', from.toISOString()),
    supabase
      .from('professional_availability')
      .select('weekday, start_time, end_time, is_break')
      .eq('professional_id', professionalId)
      .order('weekday')
      .order('start_time'),
  ]);

  return {
    bookings: bookings.data ?? [],
    blocked: blocked.data ?? [],
    availability: availability.data ?? [],
  };
}

// ---------------------------------------------------------------------
// סדרות קבועות
// ---------------------------------------------------------------------

const SERIES_SELECT = `
  id, status, frequency, interval_weeks, weekday, start_time, duration_minutes,
  start_date, end_date, planned_occurrences, price_amount, travel_fee, notes,
  location_type, approval_mode, client_approved_at, professional_approved_at,
  paused_at, created_at,
  professional_services:service_id ( id, name, duration_minutes ),
  professional_profiles:professional_id ( id, business_name, avatar_url, profiles:profile_id ( id, username, full_name, avatar_url ) ),
  profiles:client_id ( id, username, full_name, avatar_url ),
  service_addresses:address_id ( id, label, street, house_number, cities:city_id ( name ) )
`;

export async function getMySeries() {
  const supabase = await getScopedClient();
  const { data } = await supabase
    .from('recurring_booking_series')
    .select(SERIES_SELECT)
    .order('created_at', { ascending: false });

  return data ?? [];
}

export async function getSeriesById(seriesId: string) {
  const supabase = await getScopedClient();

  const [series, occurrences] = await Promise.all([
    supabase.from('recurring_booking_series').select(SERIES_SELECT).eq('id', seriesId).maybeSingle(),
    supabase
      .from('recurring_booking_occurrences')
      .select('id, sequence, scheduled_date, scheduled_start, status, note, booking_id, bookings:booking_id ( id, status )')
      .eq('series_id', seriesId)
      .order('sequence'),
  ]);

  return { series: series.data, occurrences: occurrences.data ?? [] };
}

/** לקוחות קבועים של בעל המקצוע, כולל המפגש הבא והיסטוריה. */
export async function getRegularClients(professionalId: string) {
  const supabase = await getScopedClient();

  const { data: series } = await supabase
    .from('recurring_booking_series')
    .select(SERIES_SELECT)
    .eq('professional_id', professionalId)
    .in('status', ['pending', 'active', 'paused'])
    .order('created_at', { ascending: false });

  const clientIds = [...new Set((series ?? []).map((s) => s.profiles?.id).filter(Boolean))] as string[];

  const [nextBookings, completed, notes] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, client_id, series_id, scheduled_start, status')
      .eq('professional_id', professionalId)
      .gte('scheduled_start', new Date().toISOString())
      .in('status', ['pending', 'confirmed'])
      .order('scheduled_start'),
    supabase
      .from('bookings')
      .select('id, client_id')
      .eq('professional_id', professionalId)
      .eq('status', 'completed'),
    clientIds.length
      ? supabase
          .from('customer_notes')
          .select('id, client_id, note, created_at')
          .eq('professional_id', professionalId)
          .in('client_id', clientIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const completedByClient = new Map<string, number>();
  for (const booking of completed.data ?? []) {
    completedByClient.set(booking.client_id, (completedByClient.get(booking.client_id) ?? 0) + 1);
  }

  return (series ?? []).map((item) => ({
    series: item,
    nextBooking: (nextBookings.data ?? []).find((b) => b.series_id === item.id) ?? null,
    completedCount: completedByClient.get(item.profiles?.id ?? '') ?? 0,
    notes: (notes.data ?? []).filter((n) => n.client_id === item.profiles?.id),
  }));
}

/** כל הלקוחות שביצעו טיפול אצל בעל המקצוע (לא רק קבועים). */
export async function getAllClients(professionalId: string) {
  const supabase = await getScopedClient();

  const { data } = await supabase
    .from('bookings')
    .select('client_id, scheduled_start, status, total_price, profiles:client_id ( id, username, full_name, avatar_url )')
    .eq('professional_id', professionalId)
    .in('status', ['completed', 'confirmed'])
    .order('scheduled_start', { ascending: false });

  const map = new Map<
    string,
    {
      profile: { id: string; username: string; full_name: string; avatar_url: string | null };
      visits: number;
      lastVisit: string;
      revenue: number;
    }
  >();

  for (const row of data ?? []) {
    if (!row.profiles) continue;
    const existing = map.get(row.client_id);
    if (existing) {
      existing.visits += 1;
      existing.revenue += Number(row.total_price ?? 0);
    } else {
      map.set(row.client_id, {
        profile: row.profiles,
        visits: 1,
        lastVisit: row.scheduled_start,
        revenue: Number(row.total_price ?? 0),
      });
    }
  }

  return [...map.values()].sort((a, b) => b.visits - a.visits);
}
