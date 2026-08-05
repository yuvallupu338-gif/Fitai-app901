import 'server-only';
import { getScopedClient, getSession } from '@/lib/auth/session';
import { createAnonClient } from '@/lib/supabase/server';
import type { RatingBreakdown, ReadinessResult } from '@/types/app';

/** פרופיל ציבורי לפי שם משתמש – מחזיר גם את הפרופיל המקצועי אם קיים. */
export async function getProfileByUsername(username: string) {
  const supabase = await getScopedClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      `id, username, full_name, avatar_url, bio, city_id, is_professional, role, status,
       followers_count, following_count, privacy, created_at,
       cities:city_id ( id, name, district )`,
    )
    .ilike('username', username)
    .maybeSingle();

  if (!profile || profile.status === 'banned') return null;

  const session = await getSession();
  const isSelf = session?.user.id === profile.id;

  const [{ data: professional }, { data: following }, { data: blocked }] = await Promise.all([
    supabase
      .from('professional_profiles')
      .select(
        `id, business_name, headline, bio, years_experience, avatar_url, cover_url, website_url,
         social_links, status, is_verified, phone_verified, accepts_home_visits, accepts_studio,
         accepts_events, accepts_online, max_travel_km, travel_fee, travel_fee_type,
         min_lead_time_minutes, max_lead_time_days, cancellation_policy, available_today,
         available_now, available_now_until, rating_avg, rating_count, completed_bookings_count,
         clients_count, followers_count, posts_count, response_time_minutes, published_at, city_id,
         cities:city_id ( id, name, district )`,
      )
      .eq('profile_id', profile.id)
      .maybeSingle(),
    session
      ? supabase
          .from('follows')
          .select('follower_id')
          .eq('follower_id', session.user.id)
          .eq('following_id', profile.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    session
      ? supabase
          .from('blocked_users')
          .select('blocked_id')
          .eq('blocker_id', session.user.id)
          .eq('blocked_id', profile.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    profile,
    professional,
    isSelf,
    isFollowing: Boolean(following),
    isBlocked: Boolean(blocked),
  };
}

/** כל המידע הדרוש לעמוד הפרופיל המקצועי הציבורי. */
export async function getProfessionalDetails(professionalId: string) {
  const supabase = await getScopedClient();

  const [professions, services, areas, availability, certificates, pinned, posts, reviews, breakdown, similar] =
    await Promise.all([
      supabase
        .from('professional_professions')
        .select('is_primary, professions:profession_id ( id, name, slug, icon )')
        .eq('professional_id', professionalId),
      supabase
        .from('professional_services')
        .select('*')
        .eq('professional_id', professionalId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('sort_order')
        .order('bookings_count', { ascending: false }),
      supabase
        .from('service_areas')
        .select('id, area_name, radius_km, travel_fee, cities:city_id ( id, name, district )')
        .eq('professional_id', professionalId),
      supabase
        .from('professional_availability')
        .select('id, weekday, start_time, end_time, is_break')
        .eq('professional_id', professionalId)
        .order('weekday')
        .order('start_time'),
      supabase
        .from('professional_verifications')
        .select('id, kind, title, status')
        .eq('professional_id', professionalId)
        .eq('status', 'approved'),
      supabase
        .from('professional_posts')
        .select('id, title, is_pinned, pinned_order, likes_count, comments_count, post_media ( url, media_type, position )')
        .eq('professional_id', professionalId)
        .eq('is_pinned', true)
        .eq('status', 'published')
        .is('deleted_at', null)
        .order('pinned_order'),
      supabase
        .from('professional_posts')
        .select(
          `id, title, description, price_estimate, price_type, duration_minutes, tags, is_before_after,
           likes_count, comments_count, saves_count, views_count, published_at,
           post_media ( id, url, thumbnail_url, media_type, position, before_after_role, alt_text )`,
        )
        .eq('professional_id', professionalId)
        .eq('status', 'published')
        .is('deleted_at', null)
        .order('published_at', { ascending: false })
        .limit(24),
      supabase
        .from('reviews')
        .select(
          `id, rating, body, image_urls, created_at, is_verified_booking,
           profiles:client_id ( id, username, full_name, avatar_url ),
           professional_services:service_id ( id, name ),
           review_replies ( id, body, created_at )`,
        )
        .eq('professional_id', professionalId)
        .is('deleted_at', null)
        .eq('is_hidden', false)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.rpc('rating_breakdown', { p_professional_id: professionalId } as never),
      supabase.rpc('similar_professionals', { p_professional_id: professionalId, p_limit: 6 } as never),
    ]);

  return {
    professions: (professions.data ?? []).flatMap((row) => (row.professions ? [row.professions] : [])),
    services: services.data ?? [],
    serviceAreas: areas.data ?? [],
    availability: availability.data ?? [],
    certificates: certificates.data ?? [],
    pinnedPosts: pinned.data ?? [],
    posts: posts.data ?? [],
    reviews: reviews.data ?? [],
    ratingBreakdown: (breakdown.data ?? null) as unknown as RatingBreakdown | null,
    similar: (similar.data ?? []) as unknown as Array<{
      id: string;
      business_name: string;
      username: string;
      avatar_url: string | null;
      city_name: string | null;
      rating_avg: number;
      rating_count: number;
      is_verified: boolean;
      headline: string | null;
    }>,
  };
}

/** פרטי הקשר הפרטיים – מוחזרים רק כאשר ה־RLS מתיר. */
export async function getProfessionalContact(professionalId: string) {
  const supabase = await getScopedClient();
  const { data } = await supabase
    .from('professional_contact_details')
    .select('phone, studio_address, studio_notes')
    .eq('professional_id', professionalId)
    .maybeSingle();

  return data;
}

/** מצב השלמת הפרופיל המקצועי (מד ההתקדמות). */
export async function getProfessionalReadiness(professionalId: string): Promise<ReadinessResult | null> {
  const supabase = await getScopedClient();
  const { data } = await supabase.rpc('professional_readiness', {
    p_professional_id: professionalId,
  } as never);

  return (data ?? null) as unknown as ReadinessResult | null;
}

/** נתוני העריכה של הפרופיל המקצועי (לטפסים). */
export async function getProfessionalEditData(professionalId: string) {
  const supabase = await getScopedClient();

  const [profile, contact, professions, services, areas, availability, blocked] = await Promise.all([
    supabase.from('professional_profiles').select('*').eq('id', professionalId).maybeSingle(),
    supabase
      .from('professional_contact_details')
      .select('*')
      .eq('professional_id', professionalId)
      .maybeSingle(),
    supabase.from('professional_professions').select('profession_id, is_primary').eq('professional_id', professionalId),
    supabase
      .from('professional_services')
      .select('*')
      .eq('professional_id', professionalId)
      .is('deleted_at', null)
      .order('sort_order'),
    supabase.from('service_areas').select('id, city_id, area_name, travel_fee').eq('professional_id', professionalId),
    supabase
      .from('professional_availability')
      .select('id, weekday, start_time, end_time, is_break')
      .eq('professional_id', professionalId)
      .order('weekday')
      .order('start_time'),
    supabase
      .from('unavailable_dates')
      .select('id, start_at, end_at, reason, is_vacation')
      .eq('professional_id', professionalId)
      .gte('end_at', new Date().toISOString())
      .order('start_at'),
  ]);

  return {
    profile: profile.data,
    contact: contact.data,
    professionIds: (professions.data ?? []).map((p) => p.profession_id),
    services: services.data ?? [],
    serviceAreas: areas.data ?? [],
    availability: availability.data ?? [],
    blockedDates: blocked.data ?? [],
  };
}

/** רשימת עוקבים / נעקבים. */
export async function getFollowList(profileId: string, kind: 'followers' | 'following') {
  const supabase = createAnonClient();

  if (kind === 'followers') {
    const { data } = await supabase
      .from('follows')
      .select('created_at, profiles:follower_id ( id, username, full_name, avatar_url, is_professional )')
      .eq('following_id', profileId)
      .order('created_at', { ascending: false })
      .limit(100);
    return (data ?? []).flatMap((row) => (row.profiles ? [row.profiles] : []));
  }

  const { data } = await supabase
    .from('follows')
    .select('created_at, profiles:following_id ( id, username, full_name, avatar_url, is_professional )')
    .eq('follower_id', profileId)
    .order('created_at', { ascending: false })
    .limit(100);

  return (data ?? []).flatMap((row) => (row.profiles ? [row.profiles] : []));
}

/** תוכן שמור (פרטי למשתמש). */
export async function getSavedContent() {
  const supabase = await getScopedClient();

  const [posts, professionals] = await Promise.all([
    supabase
      .from('saved_posts')
      .select(
        `created_at, professional_posts:post_id (
           id, title, likes_count, comments_count, published_at,
           post_media ( url, media_type, position ),
           professional_profiles:professional_id ( id, business_name, avatar_url )
         )`,
      )
      .order('created_at', { ascending: false }),
    supabase
      .from('saved_professionals')
      .select(
        `created_at, professional_profiles:professional_id (
           id, business_name, headline, avatar_url, rating_avg, rating_count, is_verified,
           profiles:profile_id ( username ), cities:city_id ( name )
         )`,
      )
      .order('created_at', { ascending: false }),
  ]);

  return {
    posts: (posts.data ?? []).flatMap((row) => (row.professional_posts ? [row.professional_posts] : [])),
    professionals: (professionals.data ?? []).flatMap((row) =>
      row.professional_profiles ? [row.professional_profiles] : [],
    ),
  };
}

/** הביקורות שהמשתמש כתב. */
export async function getMyReviews(profileId: string) {
  const supabase = await getScopedClient();
  const { data } = await supabase
    .from('reviews')
    .select(
      `id, rating, body, created_at, image_urls,
       professional_profiles:professional_id ( id, business_name, avatar_url, profiles:profile_id ( username ) ),
       professional_services:service_id ( name ),
       review_replies ( id, body, created_at )`,
    )
    .eq('client_id', profileId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  return data ?? [];
}

/** כתובות שמורות של המשתמש. */
export async function getMyAddresses() {
  const supabase = await getScopedClient();
  const { data } = await supabase
    .from('service_addresses')
    .select('*, cities:city_id ( id, name )')
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  return data ?? [];
}

/** היסטוריית התחברויות (למסך האבטחה). */
export async function getLoginSessions() {
  const supabase = await getScopedClient();
  const { data } = await supabase
    .from('auth_sessions')
    .select('id, user_agent, ip_address, created_at, last_used_at, expires_at, revoked_at')
    .order('last_used_at', { ascending: false })
    .limit(20);

  return data ?? [];
}
