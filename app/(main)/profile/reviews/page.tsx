import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Star } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { getMyReviews } from '@/lib/data/profiles';
import { EmptyState } from '@/components/ui/empty-state';
import { StarRating } from '@/components/ui/star-rating';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'הביקורות שכתבתי' };

export default async function MyReviewsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const reviews = await getMyReviews(session.user.id);

  return (
    <div className="space-y-4 px-4 py-4 lg:px-0">
      <h1 className="text-xl font-bold">הביקורות שכתבתי</h1>

      {reviews.length === 0 ? (
        <EmptyState
          icon={Star}
          title="עדיין לא כתבתם ביקורות"
          description="אחרי טיפול שמסומן כהושלם תוכלו לכתוב ביקורת מאומתת."
        />
      ) : (
        <ul className="space-y-3">
          {reviews.map((review) => (
            <li key={review.id} className="surface space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/u/${review.professional_profiles?.profiles?.username ?? ''}`}
                  className="font-medium hover:underline"
                >
                  {review.professional_profiles?.business_name}
                </Link>
                <Badge variant="success">הזמנה מאומתת</Badge>
              </div>

              <div className="flex items-center gap-2">
                <StarRating value={review.rating} readOnly size="sm" />
                <time className="text-xs text-muted-foreground" dateTime={review.created_at}>
                  {formatRelativeTime(review.created_at)}
                </time>
                {review.professional_services?.name ? (
                  <span className="text-xs text-muted-foreground">· {review.professional_services.name}</span>
                ) : null}
              </div>

              {review.body ? <p className="text-sm">{review.body}</p> : null}

              {review.review_replies ? (
                <div className="rounded-xl bg-muted/60 p-3">
                  <p className="text-xs font-medium text-muted-foreground">תגובת בעל המקצוע</p>
                  <p className="mt-0.5 text-sm">{review.review_replies.body}</p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
