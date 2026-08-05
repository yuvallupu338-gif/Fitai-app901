import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { BadgeCheck, CalendarPlus, Clock, MapPin } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { getPostById, getPostComments } from '@/lib/data/posts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/avatar';
import { MediaCarousel } from '@/components/feed/media-carousel';
import { PostActions } from '@/components/feed/post-actions';
import { CommentsSection } from '@/components/feed/comments-section';
import { PostViewTracker } from '@/components/feed/post-view-tracker';
import { formatDuration, formatPrice, formatRelativeTime } from '@/lib/format';
import type { PostMediaItem } from '@/types/app';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getPostById(id);
  if (!data) return { title: 'הפוסט לא נמצא' };

  return {
    title: data.post.title,
    description: data.post.description ?? `עבודה של ${data.post.professional_profiles?.business_name ?? ''}`,
  };
}

export default async function PostPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  const data = await getPostById(id);

  if (!data) notFound();

  const { post, likedByMe, savedByMe, isAuthor } = data;
  const professional = post.professional_profiles;
  const comments = await getPostComments(post.id);

  const media: PostMediaItem[] = [...post.post_media]
    .sort((a, b) => a.position - b.position)
    .map((item) => ({
      id: item.id,
      url: item.url,
      type: item.media_type,
      thumb: item.thumbnail_url,
      role: item.before_after_role as 'before' | 'after' | null,
      alt: item.alt_text,
      width: item.width,
      height: item.height,
    }));

  return (
    <article className="mx-auto max-w-2xl space-y-4 py-4">
      <PostViewTracker postId={post.id} />

      <header className="flex items-center gap-3 px-4 lg:px-0">
        <Link href={`/u/${professional?.profiles?.username ?? ''}`}>
          <UserAvatar
            src={professional?.avatar_url ?? professional?.profiles?.avatar_url}
            name={professional?.business_name ?? 'בעל מקצוע'}
            className="size-12"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <Link
            href={`/u/${professional?.profiles?.username ?? ''}`}
            className="flex items-center gap-1 font-semibold hover:underline"
          >
            <span className="truncate">{professional?.business_name}</span>
            {professional?.is_verified ? (
              <BadgeCheck className="size-4 text-primary" aria-label="מאומת" />
            ) : null}
          </Link>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {post.professions?.name ? <span>{post.professions.name}</span> : null}
            {post.cities?.name ? (
              <>
                <span aria-hidden>·</span>
                <span className="flex items-center gap-0.5">
                  <MapPin className="size-3" aria-hidden />
                  {post.cities.name}
                </span>
              </>
            ) : null}
          </p>
        </div>

        {!isAuthor && professional ? (
          <Button size="sm" asChild>
            <Link
              href={
                post.service_id
                  ? `/book/${professional.id}?service=${post.service_id}&post=${post.id}`
                  : `/book/${professional.id}?post=${post.id}`
              }
            >
              <CalendarPlus className="size-4" aria-hidden />
              הזמן טיפול דומה
            </Link>
          </Button>
        ) : null}
      </header>

      <MediaCarousel media={media} alt={post.title} priority aspect="auto" className="sm:rounded-2xl" />

      <div className="space-y-3 px-4 lg:px-0">
        <PostActions
          postId={post.id}
          likedByMe={likedByMe}
          savedByMe={savedByMe}
          likesCount={post.likes_count}
          commentsCount={post.comments_count}
          isLoggedIn={Boolean(session)}
        />

        <div>
          <h1 className="text-lg font-semibold">{post.title}</h1>
          {post.description ? (
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {post.description}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {post.professional_services ? (
            <Badge variant="secondary">{post.professional_services.name}</Badge>
          ) : null}
          {post.price_estimate ? <Badge>{formatPrice(Number(post.price_estimate))}</Badge> : null}
          {post.duration_minutes ? (
            <Badge variant="outline">
              <Clock className="size-3" aria-hidden />
              {formatDuration(post.duration_minutes)}
            </Badge>
          ) : null}
          {post.is_before_after ? <Badge variant="info">לפני ואחרי</Badge> : null}
        </div>

        {post.tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <li key={tag}>
                <Link
                  href={`/search?term=${encodeURIComponent(tag)}`}
                  className="text-sm text-primary hover:underline"
                >
                  #{tag}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <time dateTime={post.published_at ?? undefined}>
            {post.published_at ? formatRelativeTime(post.published_at) : 'טיוטה'}
          </time>
          {isAuthor ? <span>· {post.views_count} צפיות</span> : null}
          {isAuthor && post.bookings_count > 0 ? <span>· {post.bookings_count} הזמנות מהפוסט</span> : null}
        </div>
      </div>

      <div id="comments" className="px-4 lg:px-0">
        <CommentsSection
          postId={post.id}
          initialComments={comments}
          currentUserId={session?.user.id ?? null}
          postAuthorId={post.author_profile_id}
        />
      </div>
    </article>
  );
}
