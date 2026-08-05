import 'server-only';
import { getScopedClient, getSession } from '@/lib/auth/session';

/** פוסט בודד עם כל מה שנדרש לעמוד הפוסט. */
export async function getPostById(postId: string) {
  const supabase = await getScopedClient();
  const session = await getSession();

  const { data: post } = await supabase
    .from('professional_posts')
    .select(
      `id, title, description, tags, price_estimate, price_type, duration_minutes, is_before_after,
       status, likes_count, comments_count, saves_count, views_count, shares_count, bookings_count, published_at,
       professional_id, author_profile_id, service_id,
       post_media ( id, url, thumbnail_url, media_type, position, before_after_role, alt_text, width, height ),
       professional_profiles:professional_id (
         id, business_name, avatar_url, is_verified, rating_avg, rating_count, headline,
         accepts_home_visits, accepts_studio,
         profiles:profile_id ( id, username, full_name, avatar_url ),
         cities:city_id ( name )
       ),
       professional_services:service_id ( id, name, price_type, price_min, price_max, duration_minutes ),
       professions:profession_id ( id, name, slug ),
       cities:city_id ( id, name )`,
    )
    .eq('id', postId)
    .maybeSingle();

  if (!post) return null;

  const [{ data: liked }, { data: saved }, { data: following }] = session
    ? await Promise.all([
        supabase
          .from('post_likes')
          .select('post_id')
          .eq('post_id', postId)
          .eq('profile_id', session.user.id)
          .maybeSingle(),
        supabase
          .from('saved_posts')
          .select('post_id')
          .eq('post_id', postId)
          .eq('profile_id', session.user.id)
          .maybeSingle(),
        supabase
          .from('follows')
          .select('follower_id')
          .eq('follower_id', session.user.id)
          .eq('following_id', post.author_profile_id)
          .maybeSingle(),
      ])
    : [{ data: null }, { data: null }, { data: null }];

  return {
    post,
    likedByMe: Boolean(liked),
    savedByMe: Boolean(saved),
    followingAuthor: Boolean(following),
    isAuthor: session?.user.id === post.author_profile_id,
  };
}

export async function getPostComments(postId: string, limit = 30) {
  const supabase = await getScopedClient();
  const { data } = await supabase
    .from('post_comments')
    .select('id, body, created_at, parent_id, profile_id, profiles:profile_id ( id, username, full_name, avatar_url )')
    .eq('post_id', postId)
    .is('deleted_at', null)
    .eq('is_hidden', false)
    .order('created_at')
    .limit(limit);

  return data ?? [];
}

/** מי עשה לייק לפוסט. */
export async function getPostLikes(postId: string, limit = 50) {
  const supabase = await getScopedClient();
  const { data } = await supabase
    .from('post_likes')
    .select('created_at, profiles:profile_id ( id, username, full_name, avatar_url, is_professional )')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []).flatMap((row) => (row.profiles ? [row.profiles] : []));
}

/** הפוסטים של בעל המקצוע לניהול תיק העבודות. */
export async function getMyPosts(professionalId: string) {
  const supabase = await getScopedClient();
  const { data } = await supabase
    .from('professional_posts')
    .select(
      `id, title, status, is_pinned, pinned_order, likes_count, comments_count, saves_count,
       views_count, bookings_count, published_at, created_at,
       post_media ( id, url, media_type, position )`,
    )
    .eq('professional_id', professionalId)
    .is('deleted_at', null)
    .order('is_pinned', { ascending: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  return data ?? [];
}
