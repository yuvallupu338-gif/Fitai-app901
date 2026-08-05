'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck,
  Bookmark,
  CalendarPlus,
  Clock,
  Heart,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Share2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MediaCarousel } from '@/components/feed/media-carousel';
import { ReportDialog } from '@/components/shared/report-dialog';
import { cn } from '@/lib/utils';
import { formatPrice, formatDuration, formatRelativeTime, formatCompactNumber } from '@/lib/format';
import { toggleLikeAction, toggleSavePostAction, recordShareAction } from '@/lib/actions/posts';
import { toggleFollowAction } from '@/lib/actions/social';
import { useCurrentUser } from '@/components/providers';
import type { FeedPost } from '@/types/app';

/** כרטיס פוסט בפיד – כולל כל האינטראקציות ששומרות למסד הנתונים. */
export function PostCard({ post, priority = false }: { post: FeedPost; priority?: boolean }) {
  const router = useRouter();
  const currentUser = useCurrentUser();

  const [liked, setLiked] = React.useState(post.liked_by_me);
  const [likes, setLikes] = React.useState(post.likes_count);
  const [saved, setSaved] = React.useState(post.saved_by_me);
  const [following, setFollowing] = React.useState(post.followed_by_me);
  const [reportOpen, setReportOpen] = React.useState(false);

  const isOwnPost = currentUser?.id === post.author_profile_id;

  const requireLogin = () => {
    if (currentUser) return false;
    toast.error('צריך להתחבר כדי לבצע פעולה זו', {
      action: { label: 'התחברות', onClick: () => router.push('/login') },
    });
    return true;
  };

  const onLike = async () => {
    if (requireLogin()) return;
    const next = !liked;
    setLiked(next);
    setLikes((count) => count + (next ? 1 : -1));

    const result = await toggleLikeAction(post.id, next);
    if (!result.ok) {
      setLiked(!next);
      setLikes((count) => count + (next ? -1 : 1));
      toast.error(result.error);
    }
  };

  const onSave = async () => {
    if (requireLogin()) return;
    const next = !saved;
    setSaved(next);

    const result = await toggleSavePostAction(post.id, next);
    if (!result.ok) {
      setSaved(!next);
      toast.error(result.error);
    } else {
      toast.success(next ? 'הפוסט נשמר' : 'הוסר מהשמורים');
    }
  };

  const onFollow = async () => {
    if (requireLogin()) return;
    const next = !following;
    setFollowing(next);

    const result = await toggleFollowAction(post.author_profile_id, next);
    if (!result.ok) {
      setFollowing(!next);
      toast.error(result.error);
    } else {
      toast.success(next ? `עוקב אחרי ${post.business_name}` : 'הפסקת לעקוב');
    }
  };

  const onShare = async () => {
    const url = `${window.location.origin}/p/${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: post.title, text: post.description ?? post.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('הקישור הועתק');
      }
      void recordShareAction(post.id);
    } catch {
      // המשתמש ביטל את השיתוף – אין צורך בהודעה.
    }
  };

  return (
    <article className="surface overflow-hidden animate-fade-in-up">
      {/* כותרת הפוסט */}
      <header className="flex items-center gap-3 p-4 pb-3">
        <Link href={`/u/${post.username}`} className="shrink-0">
          <UserAvatar src={post.author_avatar} name={post.business_name} className="size-11" />
        </Link>

        <div className="min-w-0 flex-1">
          <Link href={`/u/${post.username}`} className="flex items-center gap-1 hover:underline">
            <span className="truncate font-semibold">{post.business_name}</span>
            {post.is_verified ? (
              <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="בעל מקצוע מאומת" />
            ) : null}
          </Link>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {post.profession_name ? <span className="truncate">{post.profession_name}</span> : null}
            {post.city_name ? (
              <>
                <span aria-hidden>·</span>
                <span className="flex items-center gap-0.5">
                  <MapPin className="size-3" aria-hidden />
                  {post.city_name}
                </span>
              </>
            ) : null}
          </p>
        </div>

        {!isOwnPost ? (
          <Button
            variant={following ? 'ghost' : 'secondary'}
            size="sm"
            onClick={onFollow}
            aria-pressed={following}
          >
            {following ? 'עוקב' : 'עקוב'}
          </Button>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="אפשרויות נוספות">
              <MoreHorizontal className="size-5" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/p/${post.id}`}>פתיחת הפוסט</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/u/${post.username}`}>מעבר לפרופיל</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onShare}>שיתוף</DropdownMenuItem>
            {!isOwnPost ? (
              <DropdownMenuItem destructive onSelect={() => setReportOpen(true)}>
                דיווח על הפוסט
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem asChild>
                <Link href={`/create?edit=${post.id}`}>עריכת הפוסט</Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* מדיה */}
      <Link href={`/p/${post.id}`} aria-label={`פתיחת הפוסט ${post.title}`}>
        <MediaCarousel media={post.media} alt={post.title} priority={priority} />
      </Link>

      {/* פעולות */}
      <div className="flex items-center gap-1 px-2 pt-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onLike}
          aria-pressed={liked}
          aria-label={liked ? 'ביטול לייק' : 'לייק'}
        >
          <Heart
            className={cn('size-6 transition-all', liked && 'scale-110 fill-destructive text-destructive')}
            aria-hidden
          />
        </Button>

        <Button variant="ghost" size="icon" asChild aria-label="תגובות">
          <Link href={`/p/${post.id}#comments`}>
            <MessageCircle className="size-6" aria-hidden />
          </Link>
        </Button>

        <Button variant="ghost" size="icon" onClick={onShare} aria-label="שיתוף">
          <Share2 className="size-6" aria-hidden />
        </Button>

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="icon"
          onClick={onSave}
          aria-pressed={saved}
          aria-label={saved ? 'הסרה מהשמורים' : 'שמירת הפוסט'}
        >
          <Bookmark className={cn('size-6 transition-all', saved && 'fill-foreground')} aria-hidden />
        </Button>
      </div>

      {/* תוכן */}
      <div className="space-y-2 px-4 pb-4">
        {likes > 0 ? (
          <Link href={`/p/${post.id}/likes`} className="text-sm font-semibold hover:underline">
            {formatCompactNumber(likes)} לייקים
          </Link>
        ) : null}

        <div>
          <Link href={`/p/${post.id}`} className="font-semibold hover:underline">
            {post.title}
          </Link>
          {post.description ? (
            <p className="line-clamp-2-rtl mt-0.5 text-sm text-muted-foreground">{post.description}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {post.service_name ? <Badge variant="secondary">{post.service_name}</Badge> : null}
          {post.price_estimate ? (
            <Badge variant="default">
              {post.price_type === 'on_request' ? 'לפי פנייה' : formatPrice(post.price_estimate)}
            </Badge>
          ) : null}
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
            {post.tags.slice(0, 5).map((tag) => (
              <li key={tag}>
                <Link
                  href={`/search?term=${encodeURIComponent(tag)}`}
                  className="text-xs text-primary hover:underline"
                >
                  #{tag}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {post.comments_count > 0 ? (
          <Link
            href={`/p/${post.id}#comments`}
            className="block text-sm text-muted-foreground hover:underline"
          >
            צפייה בכל {post.comments_count} התגובות
          </Link>
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-1">
          <time className="text-xs text-muted-foreground" dateTime={post.published_at}>
            {formatRelativeTime(post.published_at)}
          </time>

          {!isOwnPost ? (
            <Button size="sm" asChild>
              <Link
                href={
                  post.service_id
                    ? `/book/${post.professional_id}?service=${post.service_id}&post=${post.id}`
                    : `/book/${post.professional_id}?post=${post.id}`
                }
              >
                <CalendarPlus className="size-4" aria-hidden />
                הזמן טיפול דומה
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        targetType="post"
        targetId={post.id}
        title="דיווח על פוסט"
      />
    </article>
  );
}
