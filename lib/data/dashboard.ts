import 'server-only';
import { getScopedClient, requireSession } from '@/lib/auth/session';
import type { AdminStats } from '@/types/app';

/** התראות המשתמש. */
export async function getNotifications(limit = 30, unreadOnly = false) {
  const supabase = await getScopedClient();

  let query = supabase
    .from('notifications')
    .select('*, profiles:actor_id ( id, username, full_name, avatar_url )')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) query = query.eq('is_read', false);

  const { data } = await query;
  return data ?? [];
}

export async function getUnreadNotificationCount(): Promise<number> {
  try {
    const supabase = await getScopedClient();
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false);

    return count ?? 0;
  } catch {
    return 0;
  }
}

/** לוח הבקרה של המשתמש הרגיל. */
export async function getUserDashboard() {
  const session = await requireSession();
  const supabase = await getScopedClient();
  const now = new Date().toISOString();

  const [upcoming, pending, series, saved, reviews, notifications] = await Promise.all([
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', session.user.id)
      .in('status', ['confirmed', 'on_the_way', 'arrived', 'in_progress'])
      .gte('scheduled_start', now),
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', session.user.id)
      .in('status', ['pending', 'change_proposed']),
    supabase
      .from('recurring_booking_series')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', session.user.id)
      .eq('status', 'active'),
    supabase.from('saved_professionals').select('professional_id', { count: 'exact', head: true }),
    supabase
      .from('reviews')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', session.user.id)
      .is('deleted_at', null),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false),
  ]);

  return {
    upcomingBookings: upcoming.count ?? 0,
    pendingBookings: pending.count ?? 0,
    activeSeries: series.count ?? 0,
    savedProfessionals: saved.count ?? 0,
    reviewsWritten: reviews.count ?? 0,
    unreadNotifications: notifications.count ?? 0,
  };
}

/** לוח הבקרה של בעל המקצוע. */
export async function getProfessionalDashboard(professionalId: string) {
  const supabase = await getScopedClient();

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

  const [profile, newRequests, today, upcoming, series, monthly, newFollowers, newReviews, postStats] =
    await Promise.all([
      supabase
        .from('professional_profiles')
        .select(
          `rating_avg, rating_count, completed_bookings_count, clients_count, followers_count,
           posts_count, profile_views_count, response_time_minutes, status, available_today,
           available_now, available_now_until, profile_id`,
        )
        .eq('id', professionalId)
        .maybeSingle(),
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('professional_id', professionalId)
        .eq('status', 'pending'),
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('professional_id', professionalId)
        .gte('scheduled_start', startOfDay.toISOString())
        .lt('scheduled_start', endOfDay.toISOString())
        .not('status', 'eq', 'cancelled'),
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('professional_id', professionalId)
        .in('status', ['confirmed', 'pending'])
        .gte('scheduled_start', now.toISOString()),
      supabase
        .from('recurring_booking_series')
        .select('id', { count: 'exact', head: true })
        .eq('professional_id', professionalId)
        .eq('status', 'active'),
      supabase
        .from('bookings')
        .select('total_price')
        .eq('professional_id', professionalId)
        .eq('status', 'completed')
        .gte('completed_at', monthStart.toISOString()),
      supabase
        .from('follows')
        .select('follower_id', { count: 'exact', head: true })
        .gte('created_at', weekAgo.toISOString()),
      supabase
        .from('reviews')
        .select('id', { count: 'exact', head: true })
        .eq('professional_id', professionalId)
        .gte('created_at', weekAgo.toISOString()),
      supabase
        .from('professional_posts')
        .select('likes_count, saves_count, views_count, bookings_count')
        .eq('professional_id', professionalId)
        .eq('status', 'published')
        .is('deleted_at', null),
    ]);

  const posts = postStats.data ?? [];
  const estimatedRevenue = (monthly.data ?? []).reduce((sum, b) => sum + Number(b.total_price ?? 0), 0);

  return {
    profile: profile.data,
    newRequests: newRequests.count ?? 0,
    todayBookings: today.count ?? 0,
    upcomingBookings: upcoming.count ?? 0,
    activeSeries: series.count ?? 0,
    estimatedRevenue,
    newFollowers: newFollowers.count ?? 0,
    newReviews: newReviews.count ?? 0,
    totalLikes: posts.reduce((s, p) => s + p.likes_count, 0),
    totalSaves: posts.reduce((s, p) => s + p.saves_count, 0),
    totalPostViews: posts.reduce((s, p) => s + p.views_count, 0),
    bookingsFromPosts: posts.reduce((s, p) => s + p.bookings_count, 0),
  };
}

/** ביקורות שהתקבלו על בעל המקצוע. */
export async function getProfessionalReviews(professionalId: string) {
  const supabase = await getScopedClient();
  const { data } = await supabase
    .from('reviews')
    .select(
      `id, rating, body, image_urls, created_at, is_hidden,
       profiles:client_id ( id, username, full_name, avatar_url ),
       professional_services:service_id ( id, name ),
       review_replies ( id, body, created_at )`,
    )
    .eq('professional_id', professionalId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  return data ?? [];
}

// ---------------------------------------------------------------------
// פאנל ניהול
// ---------------------------------------------------------------------

export async function getAdminStats(): Promise<AdminStats | null> {
  const supabase = await getScopedClient();
  const { data, error } = await supabase.rpc('admin_stats', {} as never);
  if (error) {
    console.error('[admin-stats]', error.message);
    return null;
  }
  return data as unknown as AdminStats;
}

export async function getAdminUsers(search: string | null, limit = 40) {
  const supabase = await getScopedClient();

  let query = supabase
    .from('profiles')
    .select(
      `id, username, full_name, avatar_url, role, status, is_professional, created_at,
       cities:city_id ( name ),
       professional_profiles!professional_profiles_profile_id_fkey ( id, business_name, status, is_verified )`,
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (search) {
    query = query.or(`username.ilike.%${search}%,full_name.ilike.%${search}%`);
  }

  const { data } = await query;
  return data ?? [];
}

export async function getAdminProfessionals(status?: string) {
  const supabase = await getScopedClient();

  let query = supabase
    .from('professional_profiles')
    .select(
      `id, business_name, headline, avatar_url, status, is_verified, rating_avg, rating_count,
       created_at, published_at,
       profiles:profile_id ( id, username, full_name ),
       cities:city_id ( name )`,
    )
    .order('created_at', { ascending: false })
    .limit(60);

  if (status) query = query.eq('status', status as never);

  const { data } = await query;
  return data ?? [];
}

export async function getAdminReports(status = 'open') {
  const supabase = await getScopedClient();
  const { data } = await supabase
    .from('reports')
    .select('*, profiles:reporter_id ( id, username, full_name, avatar_url )')
    .eq('status', status as never)
    .order('created_at', { ascending: false })
    .limit(60);

  return data ?? [];
}

export async function getAdminProfessionRequests() {
  const supabase = await getScopedClient();
  const { data } = await supabase
    .from('profession_requests')
    .select('*, profiles:requested_by ( id, username, full_name, avatar_url )')
    .order('created_at', { ascending: false })
    .limit(60);

  return data ?? [];
}

export async function getAdminVerifications() {
  const supabase = await getScopedClient();
  const { data } = await supabase
    .from('professional_verifications')
    .select(
      `id, kind, title, document_url, status, created_at,
       professional_profiles:professional_id ( id, business_name, profiles:profile_id ( username ) )`,
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  return data ?? [];
}

export async function getAdminProfessions() {
  const supabase = await getScopedClient();
  const { data } = await supabase
    .from('professions')
    .select('id, slug, name, description, category, is_active, is_core, professionals_count, created_at')
    .order('sort_order')
    .order('name');

  return data ?? [];
}
