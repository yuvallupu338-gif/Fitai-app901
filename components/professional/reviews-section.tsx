'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MessageSquareReply, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { StarRating } from '@/components/ui/star-rating';
import { formatRating, formatRelativeTime } from '@/lib/format';
import { replyToReviewAction } from '@/lib/actions/reviews';
import type { RatingBreakdown } from '@/types/app';

type Review = {
  id: string;
  rating: number;
  body: string | null;
  image_urls: string[];
  created_at: string;
  is_verified_booking?: boolean;
  profiles: { id: string; username: string; full_name: string; avatar_url: string | null } | null;
  professional_services: { id: string; name: string } | null;
  review_replies: { id: string; body: string; created_at: string } | null;
};

export function ReviewsSection({
  reviews,
  breakdown,
  isOwner,
}: {
  reviews: Review[];
  breakdown: RatingBreakdown | null;
  professionalId: string;
  isOwner: boolean;
}) {
  if (reviews.length === 0) {
    return (
      <EmptyState
        icon={Star}
        title="עדיין אין ביקורות"
        description="ביקורת אפשר לכתוב רק אחרי טיפול שסומן כהושלם – כך כל הביקורות כאן אמיתיות ומאומתות."
      />
    );
  }

  const stars = breakdown?.stars ?? {};
  const total = breakdown?.count ?? reviews.length;

  return (
    <div className="space-y-5">
      {/* סיכום דירוגים */}
      <div className="surface flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <div className="text-center sm:w-32">
          <p className="text-4xl font-bold">{formatRating(breakdown?.average ?? 0)}</p>
          <StarRating value={breakdown?.average ?? 0} readOnly className="justify-center" />
          <p className="mt-1 text-xs text-muted-foreground">{total} ביקורות</p>
        </div>

        <div className="flex-1 space-y-1">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = Number(stars[String(star)] ?? 0);
            const percent = total > 0 ? (count / total) * 100 : 0;
            return (
              <div key={star} className="flex items-center gap-2 text-xs">
                <span className="w-3 text-muted-foreground">{star}</span>
                <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-amber-400" style={{ width: `${percent}%` }} />
                </div>
                <span className="w-6 text-muted-foreground">{count}</span>
              </div>
            );
          })}

          {breakdown?.repeat_client_rate ? (
            <p className="pt-2 text-xs text-muted-foreground">
              {breakdown.repeat_client_rate}% מהלקוחות חזרו לטיפול נוסף
            </p>
          ) : null}
        </div>
      </div>

      <ul className="space-y-3">
        {reviews.map((review) => (
          <ReviewItem key={review.id} review={review} isOwner={isOwner} />
        ))}
      </ul>
    </div>
  );
}

function ReviewItem({ review, isOwner }: { review: Review; isOwner: boolean }) {
  const [replying, setReplying] = React.useState(false);
  const [replyBody, setReplyBody] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [reply, setReply] = React.useState(review.review_replies ?? null);

  const submitReply = async () => {
    setPending(true);
    const result = await replyToReviewAction({ reviewId: review.id, body: replyBody });
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success('התגובה פורסמה');
    setReply({ id: 'new', body: replyBody, created_at: new Date().toISOString() });
    setReplying(false);
    setReplyBody('');
  };

  return (
    <li className="surface space-y-3 p-4">
      <div className="flex items-start gap-3">
        <Link href={`/u/${review.profiles?.username ?? ''}`}>
          <UserAvatar
            src={review.profiles?.avatar_url}
            name={review.profiles?.full_name ?? 'משתמש'}
            className="size-10"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/u/${review.profiles?.username ?? ''}`} className="font-medium hover:underline">
              {review.profiles?.full_name ?? 'משתמש'}
            </Link>
            {review.is_verified_booking !== false ? (
              <Badge variant="success">הזמנה מאומתת</Badge>
            ) : null}
          </div>

          <div className="mt-1 flex items-center gap-2">
            <StarRating value={review.rating} readOnly size="sm" />
            <time className="text-xs text-muted-foreground" dateTime={review.created_at}>
              {formatRelativeTime(review.created_at)}
            </time>
            {review.professional_services ? (
              <span className="text-xs text-muted-foreground">· {review.professional_services.name}</span>
            ) : null}
          </div>

          {review.body ? <p className="mt-2 text-sm leading-relaxed">{review.body}</p> : null}

          {review.image_urls.length > 0 ? (
            <ul className="mt-2 flex gap-2">
              {review.image_urls.map((url) => (
                <li key={url} className="relative size-20 overflow-hidden rounded-lg bg-muted">
                  <Image src={url} alt="תמונה מהביקורת" fill sizes="80px" className="object-cover" />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {reply ? (
        <div className="ms-12 rounded-xl bg-muted/60 p-3">
          <p className="text-xs font-medium text-muted-foreground">תגובת בעל המקצוע</p>
          <p className="mt-1 text-sm">{reply.body}</p>
        </div>
      ) : isOwner ? (
        replying ? (
          <div className="ms-12 space-y-2">
            <Textarea
              value={replyBody}
              onChange={(event) => setReplyBody(event.target.value)}
              placeholder="תגובה לביקורת (אפשר להגיב פעם אחת)"
              maxLength={1500}
              aria-label="תגובה לביקורת"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={submitReply} loading={pending} disabled={!replyBody.trim()}>
                פרסום התגובה
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setReplying(false)}>
                ביטול
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="ms-12" onClick={() => setReplying(true)}>
            <MessageSquareReply className="size-4" aria-hidden />
            תגובה
          </Button>
        )
      ) : null}
    </li>
  );
}
