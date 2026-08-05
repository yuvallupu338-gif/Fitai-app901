import Link from 'next/link';
import Image from 'next/image';
import { BadgeCheck, Home, MapPin, Star, Store } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { formatDistance, formatPrice, formatRating, formatResponseTime } from '@/lib/format';
import type { ProfessionalSearchResult } from '@/types/app';

/** כרטיס בעל מקצוע – מוצג בחיפוש וברצועות הגילוי. */
export function ProfessionalCard({
  professional,
  variant = 'full',
}: {
  professional: ProfessionalSearchResult;
  variant?: 'full' | 'compact';
}) {
  const professions = professional.professions.map((p) => p.name).join(' · ');

  if (variant === 'compact') {
    return (
      <Link
        href={`/u/${professional.username}`}
        className="surface surface-hover flex w-44 shrink-0 snap-start flex-col overflow-hidden"
      >
        <div className="relative h-24 bg-gradient-to-br from-primary/15 to-accent">
          {professional.cover_url ? (
            <Image
              src={professional.cover_url}
              alt=""
              fill
              sizes="200px"
              className="object-cover"
              loading="lazy"
            />
          ) : null}
          {professional.available_now ? (
            <span className="absolute end-2 top-2 flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium">
              <span className="live-dot" aria-hidden />
              זמין עכשיו
            </span>
          ) : null}
        </div>

        <div className="-mt-6 flex flex-col items-center gap-1 p-3 text-center">
          <UserAvatar
            src={professional.avatar_url}
            name={professional.business_name}
            className="size-12 ring-2 ring-card"
          />
          <p className="flex items-center gap-1 text-sm font-semibold">
            <span className="line-clamp-1">{professional.business_name}</span>
            {professional.is_verified ? (
              <BadgeCheck className="size-3.5 shrink-0 text-primary" aria-label="מאומת" />
            ) : null}
          </p>
          <p className="line-clamp-1 text-xs text-muted-foreground">{professions || professional.city_name}</p>

          <div className="flex items-center gap-1 text-xs">
            {professional.rating_count > 0 ? (
              <>
                <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
                <span className="font-medium">{formatRating(professional.rating_avg)}</span>
                <span className="text-muted-foreground">({professional.rating_count})</span>
              </>
            ) : (
              <span className="text-muted-foreground">חדש באפליקציה</span>
            )}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/u/${professional.username}`} className="surface surface-hover block overflow-hidden">
      <div className="flex gap-3 p-4">
        <UserAvatar
          src={professional.avatar_url}
          name={professional.business_name}
          className="size-16 shrink-0"
        />

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1 font-semibold">
                <span className="truncate">{professional.business_name}</span>
                {professional.is_verified ? (
                  <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="בעל מקצוע מאומת" />
                ) : null}
              </p>
              <p className="line-clamp-1 text-sm text-muted-foreground">{professions}</p>
            </div>

            {professional.rating_count > 0 ? (
              <div className="flex shrink-0 items-center gap-1 text-sm">
                <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />
                <span className="font-semibold">{formatRating(professional.rating_avg)}</span>
                <span className="text-xs text-muted-foreground">({professional.rating_count})</span>
              </div>
            ) : (
              <Badge variant="secondary">חדש</Badge>
            )}
          </div>

          {professional.headline ? (
            <p className="line-clamp-2-rtl text-sm text-muted-foreground">{professional.headline}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {professional.city_name ? (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden />
                {professional.city_name}
                {professional.distance_km !== null && professional.distance_km > 0
                  ? ` · ${formatDistance(professional.distance_km)}`
                  : ''}
              </span>
            ) : null}

            {professional.min_price !== null ? (
              <span className="font-medium text-foreground">החל מ־{formatPrice(professional.min_price)}</span>
            ) : null}

            {professional.response_time_minutes ? (
              <span>{formatResponseTime(professional.response_time_minutes)}</span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {professional.available_now ? (
              <Badge variant="success">
                <span className="live-dot" aria-hidden />
                זמין עכשיו
              </Badge>
            ) : professional.available_today ? (
              <Badge variant="info">זמין היום</Badge>
            ) : null}

            {professional.accepts_home_visits ? (
              <Badge variant="outline">
                <Home className="size-3" aria-hidden />
                מגיע הביתה
              </Badge>
            ) : null}

            {professional.accepts_studio ? (
              <Badge variant="outline">
                <Store className="size-3" aria-hidden />
                סטודיו
              </Badge>
            ) : null}

            {professional.completed_bookings_count > 5 ? (
              <Badge variant="neutral">{professional.completed_bookings_count} טיפולים</Badge>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}

/** רצועת גלילה אופקית של בעלי מקצוע. */
export function ProfessionalRail({
  title,
  description,
  professionals,
  href,
  className,
}: {
  title: string;
  description?: string;
  professionals: ProfessionalSearchResult[];
  href?: string;
  className?: string;
}) {
  if (professionals.length === 0) return null;

  return (
    <section className={cn('space-y-3', className)} aria-labelledby={`rail-${title}`}>
      <div className="flex items-end justify-between gap-2 px-4 lg:px-0">
        <div>
          <h2 id={`rail-${title}`} className="font-semibold">
            {title}
          </h2>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {href ? (
          <Link href={href} className="shrink-0 text-sm font-medium text-primary hover:underline">
            הצגת הכול
          </Link>
        ) : null}
      </div>

      <div className="scroll-x px-4 lg:px-0">
        {professionals.map((professional) => (
          <ProfessionalCard key={professional.id} professional={professional} variant="compact" />
        ))}
      </div>
    </section>
  );
}
