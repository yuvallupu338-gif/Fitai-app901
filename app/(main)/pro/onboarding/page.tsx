import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getCities, getProfessions } from '@/lib/data/reference';
import { getProfessionalEditData, getProfessionalReadiness } from '@/lib/data/profiles';
import { getMyPosts } from '@/lib/data/posts';
import { OnboardingWizard } from '@/components/professional/onboarding-wizard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'הפרופיל המקצועי שלי',
  description: 'הגדרת פרופיל מקצועי: פרטים, מקום השירות, שירותים, זמינות ותיק עבודות.',
};

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [cities, professions] = await Promise.all([getCities(), getProfessions()]);

  const professionalId = session.user.professionalId;

  const [editData, readiness, posts] = professionalId
    ? await Promise.all([
        getProfessionalEditData(professionalId),
        getProfessionalReadiness(professionalId),
        getMyPosts(professionalId),
      ])
    : [null, null, []];

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 lg:px-0">
      <OnboardingWizard
        cities={cities}
        professions={professions}
        user={session.user}
        editData={editData}
        readiness={readiness}
        portfolioCount={posts.reduce((sum, post) => sum + post.post_media.length, 0)}
      />
    </div>
  );
}
