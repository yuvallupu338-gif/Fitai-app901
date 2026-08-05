import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getProfessionalReviews } from '@/lib/data/dashboard';
import { getProfessionalDetails } from '@/lib/data/profiles';
import { ReviewsSection } from '@/components/professional/reviews-section';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'ביקורות' };

export default async function ProReviewsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.user.professionalId) redirect('/pro/onboarding');

  const [reviews, details] = await Promise.all([
    getProfessionalReviews(session.user.professionalId),
    getProfessionalDetails(session.user.professionalId),
  ]);

  return (
    <div className="space-y-4 px-4 py-4 lg:px-0">
      <h1 className="text-xl font-bold">הביקורות שלי</h1>

      <ReviewsSection
        reviews={reviews}
        breakdown={details.ratingBreakdown}
        professionalId={session.user.professionalId}
        isOwner
      />
    </div>
  );
}
