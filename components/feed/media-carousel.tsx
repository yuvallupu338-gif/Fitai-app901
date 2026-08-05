'use client';

import * as React from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PostMediaItem } from '@/types/app';

/**
 * גלריית מדיה לפוסט: תמונה בודדת, כמה תמונות או סרטון קצר.
 * תומכת בהחלקה בטלפון, בחצים במחשב ובניווט מקלדת.
 */
export function MediaCarousel({
  media,
  alt,
  priority = false,
  className,
  aspect = 'square',
}: {
  media: PostMediaItem[];
  alt: string;
  priority?: boolean;
  className?: string;
  aspect?: 'square' | 'wide' | 'auto';
}) {
  const [index, setIndex] = React.useState(0);
  const trackRef = React.useRef<HTMLDivElement>(null);

  if (media.length === 0) return null;

  const scrollTo = (next: number) => {
    const clamped = Math.max(0, Math.min(next, media.length - 1));
    setIndex(clamped);
    const track = trackRef.current;
    if (track) {
      track.scrollTo({ left: -clamped * track.clientWidth, behavior: 'smooth' });
    }
  };

  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    // ב־RTL ערך ה־scrollLeft שלילי, ולכן משתמשים בערך המוחלט.
    const current = Math.round(Math.abs(track.scrollLeft) / track.clientWidth);
    if (current !== index) setIndex(current);
  };

  const aspectClass =
    aspect === 'square' ? 'aspect-square' : aspect === 'wide' ? 'aspect-[4/3]' : 'aspect-auto';

  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      <div
        ref={trackRef}
        onScroll={onScroll}
        className={cn('flex snap-x snap-mandatory overflow-x-auto', aspectClass)}
        style={{ scrollbarWidth: 'none' }}
        role="group"
        aria-roledescription="גלריה"
        aria-label={`${media.length} פריטי מדיה`}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') scrollTo(index + 1);
          if (event.key === 'ArrowRight') scrollTo(index - 1);
        }}
      >
        {media.map((item, itemIndex) => (
          <div key={item.id} className="relative w-full shrink-0 snap-center">
            {item.type === 'video' ? (
              <video
                src={item.url}
                poster={item.thumb ?? undefined}
                controls
                playsInline
                preload="metadata"
                className="h-full w-full object-cover"
                aria-label={item.alt ?? alt}
              />
            ) : (
              <Image
                src={item.url}
                alt={item.alt ?? `${alt} – תמונה ${itemIndex + 1}`}
                fill
                sizes="(max-width: 768px) 100vw, 640px"
                className="object-cover"
                priority={priority && itemIndex === 0}
                loading={priority && itemIndex === 0 ? undefined : 'lazy'}
              />
            )}

            {item.role ? (
              <span className="absolute start-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                {item.role === 'before' ? 'לפני' : 'אחרי'}
              </span>
            ) : null}

            {item.type === 'video' ? (
              <span className="pointer-events-none absolute end-3 top-3 flex size-8 items-center justify-center rounded-full bg-black/50 text-white">
                <Play className="size-4" aria-hidden />
              </span>
            ) : null}
          </div>
        ))}
      </div>

      {media.length > 1 ? (
        <>
          <button
            type="button"
            onClick={() => scrollTo(index - 1)}
            disabled={index === 0}
            className="absolute end-2 top-1/2 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 text-foreground shadow-soft transition-opacity disabled:opacity-0 sm:flex"
            aria-label="הקודם"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => scrollTo(index + 1)}
            disabled={index === media.length - 1}
            className="absolute start-2 top-1/2 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 text-foreground shadow-soft transition-opacity disabled:opacity-0 sm:flex"
            aria-label="הבא"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>

          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {media.map((item, dotIndex) => (
              <span
                key={item.id}
                className={cn(
                  'h-1.5 rounded-full bg-white/60 transition-all',
                  dotIndex === index ? 'w-4 bg-white' : 'w-1.5',
                )}
              />
            ))}
          </div>

          <span className="absolute end-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-xs font-medium text-white">
            {index + 1}/{media.length}
          </span>
        </>
      ) : null}
    </div>
  );
}
