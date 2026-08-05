'use client';

import * as React from 'react';
import { ImageOff, Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PostCard } from '@/components/feed/post-card';
import { loadFeedPageAction } from '@/lib/actions/feed';
import { useRealtime, useRefreshOnFocus } from '@/hooks/use-realtime';
import { PAGE_SIZE } from '@/lib/constants';
import type { FeedPost } from '@/types/app';
import { toast } from 'sonner';

const EMPTY_MESSAGES: Record<string, { title: string; description: string }> = {
  following: {
    title: 'עדיין לא עוקבים אחרי אף אחד',
    description: 'מצאו בעלי מקצוע בתחום שמעניין אתכם והתחילו לעקוב – העבודות שלהם יופיעו כאן.',
  },
  saved: {
    title: 'אין עדיין פוסטים שמורים',
    description: 'שמרו עבודות שאהבתם בעזרת סימן הסימנייה, והן יחכו לכם כאן.',
  },
  city: {
    title: 'עדיין אין עבודות בעיר שלכם',
    description: 'ברגע שבעלי מקצוע בעיר יפרסמו עבודות – הן יופיעו כאן אוטומטית.',
  },
  before_after: {
    title: 'אין כרגע תמונות לפני ואחרי',
    description: 'בעלי מקצוע מוסיפים תמונות לפני ואחרי רק באישור הלקוח.',
  },
  default: {
    title: 'הפיד עדיין ריק',
    description: 'האפליקציה מתעדכנת כל הזמן. חזרו בקרוב או חפשו בעלי מקצוע בעיר שלכם.',
  },
};

/**
 * רשימת הפיד עם גלילה אינסופית.
 * מרעננת את עצמה כשמתפרסם פוסט חדש וכשחוזרים למסך.
 */
export function FeedList({
  initialPosts,
  total,
  tab,
  cityId,
}: {
  initialPosts: FeedPost[];
  total: number;
  tab: string;
  cityId: string | null;
}) {
  const [posts, setPosts] = React.useState(initialPosts);
  const [loading, setLoading] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(initialPosts.length < total);
  const [freshCount, setFreshCount] = React.useState(0);
  const sentinelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setPosts(initialPosts);
    setHasMore(initialPosts.length < total);
    setFreshCount(0);
  }, [initialPosts, total]);

  useRefreshOnFocus();

  // פוסט חדש שמתפרסם בזמן שהמסך פתוח.
  useRealtime({ table: 'professional_posts', event: 'INSERT' }, () => {
    setFreshCount((count) => count + 1);
  });

  const loadMore = React.useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);

    const result = await loadFeedPageAction(tab, cityId, posts.length);
    setLoading(false);

    if (!result.ok) {
      toast.error(result.error);
      setHasMore(false);
      return;
    }

    setPosts((current) => {
      const seen = new Set(current.map((p) => p.id));
      return [...current, ...result.data.posts.filter((p) => !seen.has(p.id))];
    });
    setHasMore(result.data.hasMore);
  }, [loading, hasMore, tab, cityId, posts.length]);

  // גלילה אינסופית מבוססת IntersectionObserver.
  React.useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: '600px 0px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, hasMore]);

  if (posts.length === 0) {
    const message = EMPTY_MESSAGES[tab] ?? EMPTY_MESSAGES.default;
    return (
      <EmptyState
        icon={tab === 'following' ? Sparkles : ImageOff}
        title={message.title}
        description={message.description}
        action={
          <Button asChild>
            <Link href="/search">גילוי בעלי מקצוע</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {freshCount > 0 ? (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="sticky top-16 z-20 mx-auto block rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lifted animate-fade-in-up"
        >
          {freshCount === 1 ? 'פוסט חדש' : `${freshCount} פוסטים חדשים`} · הצגה
        </button>
      ) : null}

      {posts.map((post, index) => (
        <PostCard key={post.id} post={post} priority={index < 2} />
      ))}

      <div ref={sentinelRef} aria-hidden className="h-1" />

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-6 animate-spin text-primary" aria-label="טוען עוד" />
        </div>
      ) : null}

      {!hasMore && posts.length >= PAGE_SIZE.feed ? (
        <p className="py-6 text-center text-sm text-muted-foreground">הגעתם לסוף הפיד 🎉</p>
      ) : null}
    </div>
  );
}
