'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Heart, MessageCircle, Pin, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCompactNumber } from '@/lib/format';

type PostMedia = { url: string; media_type: 'image' | 'video'; position: number };

type PortfolioPost = {
  id: string;
  title: string;
  likes_count: number;
  comments_count: number;
  is_before_after?: boolean;
  post_media: PostMedia[];
};

/** רשת תיק העבודות – פוסטים מוצמדים מוצגים ראשונים. */
export function PortfolioGrid({
  posts,
  pinned,
  isOwner,
}: {
  posts: PortfolioPost[];
  pinned: Array<{ id: string }>;
  isOwner: boolean;
}) {
  const pinnedIds = new Set(pinned.map((p) => p.id));
  const ordered = [...posts].sort((a, b) => {
    const aPinned = pinnedIds.has(a.id) ? 1 : 0;
    const bPinned = pinnedIds.has(b.id) ? 1 : 0;
    return bPinned - aPinned;
  });

  return (
    <ul className="grid grid-cols-3 gap-1 sm:gap-2">
      {ordered.map((post) => {
        const cover = [...post.post_media].sort((a, b) => a.position - b.position)[0];
        return (
          <li key={post.id}>
            <Link
              href={`/p/${post.id}`}
              className="group relative block aspect-square overflow-hidden rounded-lg bg-muted sm:rounded-xl"
            >
              {cover ? (
                cover.media_type === 'video' ? (
                  <video src={cover.url} className="h-full w-full object-cover" muted playsInline />
                ) : (
                  <Image
                    src={cover.url}
                    alt={post.title}
                    fill
                    sizes="(max-width: 640px) 33vw, 220px"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                )
              ) : null}

              {pinnedIds.has(post.id) ? (
                <span className="absolute start-1.5 top-1.5 rounded-full bg-background/85 p-1" title="פוסט מוצמד">
                  <Pin className="size-3 text-primary" aria-label="מוצמד" />
                </span>
              ) : null}

              {cover?.media_type === 'video' ? (
                <span className="absolute end-1.5 top-1.5 rounded-full bg-black/50 p-1">
                  <Play className="size-3 text-white" aria-hidden />
                </span>
              ) : null}

              {post.post_media.length > 1 ? (
                <span className="absolute end-1.5 top-1.5 rounded bg-black/50 px-1.5 text-[10px] font-medium text-white">
                  {post.post_media.length}
                </span>
              ) : null}

              <div
                className={cn(
                  'absolute inset-0 flex items-center justify-center gap-4 bg-black/45 text-sm font-medium text-white opacity-0 transition-opacity',
                  'group-hover:opacity-100 group-focus-visible:opacity-100',
                )}
              >
                <span className="flex items-center gap-1">
                  <Heart className="size-4 fill-white" aria-hidden />
                  {formatCompactNumber(post.likes_count)}
                </span>
                <span className="flex items-center gap-1">
                  <MessageCircle className="size-4 fill-white" aria-hidden />
                  {formatCompactNumber(post.comments_count)}
                </span>
              </div>
            </Link>
          </li>
        );
      })}

      {isOwner ? (
        <li>
          <Link
            href="/create"
            className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary sm:rounded-xl"
          >
            + עבודה חדשה
          </Link>
        </li>
      ) : null}
    </ul>
  );
}
