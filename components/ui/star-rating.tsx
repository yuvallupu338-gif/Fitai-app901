'use client';

import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

type StarRatingProps = {
  value: number;
  onChange?: (value: number) => void;
  size?: 'sm' | 'md' | 'lg';
  readOnly?: boolean;
  className?: string;
  'aria-label'?: string;
};

const SIZES = { sm: 'size-3.5', md: 'size-5', lg: 'size-8' };

/** דירוג כוכבים – לקריאה או לבחירה, נגיש למקלדת. */
export function StarRating({ value, onChange, size = 'md', readOnly, className, ...rest }: StarRatingProps) {
  const interactive = Boolean(onChange) && !readOnly;

  if (!interactive) {
    return (
      <div className={cn('flex items-center gap-0.5', className)} aria-label={rest['aria-label'] ?? `דירוג ${value} מתוך 5`}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              SIZES[size],
              star <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/35',
            )}
            aria-hidden
          />
        ))}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-1', className)} role="radiogroup" aria-label="בחירת דירוג">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} כוכבים`}
          onClick={() => onChange?.(star)}
          className="rounded-full p-1 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Star
            className={cn(SIZES[size], star <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')}
          />
        </button>
      ))}
    </div>
  );
}
