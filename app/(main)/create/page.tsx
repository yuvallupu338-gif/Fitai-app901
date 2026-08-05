import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { requireSession } from '@/lib/auth/session';
import { getCities, getProfessions } from '@/lib/data/reference';
import { getProfessionalEditData } from '@/lib/data/profiles';
import { getPostById } from '@/lib/data/posts';
import { PostComposer } from '@/components/feed/post-composer';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'פרסום עבודה',
  description: 'העלאת תמונות וסרטונים של העבודות שלך.',
};

type Props = { searchParams: Promise<{ edit?: string }> };

export default async function CreatePage({ searchParams }: Props) {
  const session = await requireSession().catch(() => null);
  if (!session) redirect('/login');

  const params = await searchParams;

  // רק בעלי מקצוע יכולים לפרסם עבודות.
  if (!session.user.professionalId) {
    return (
      <div className="px-4 py-10 lg:px-0">
        <EmptyState
          icon={Sparkles}
          title="פרסום עבודות זמין לבעלי מקצוע"
          description="צרו פרופיל מקצועי באותו חשבון – זה לוקח כמה דקות ואפשר לשמור כטיוטה בכל שלב."
          action={
            <Button asChild>
              <Link href="/pro/onboarding">יצירת פרופיל מקצועי</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const [cities, professions, editData, existing] = await Promise.all([
    getCities(),
    getProfessions(),
    getProfessionalEditData(session.user.professionalId),
    params.edit ? getPostById(params.edit) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 lg:px-0">
      <h1 className="mb-4 text-xl font-bold">{existing ? 'עריכת עבודה' : 'פרסום עבודה חדשה'}</h1>

      <PostComposer
        cities={cities}
        professions={professions}
        services={editData.services}
        defaultCityId={editData.profile?.city_id ?? session.user.cityId}
        existingPost={
          existing?.post
            ? {
                id: existing.post.id,
                title: existing.post.title,
                description: existing.post.description,
                serviceId: existing.post.service_id,
                professionId: existing.post.professions?.id ?? null,
                cityId: existing.post.cities?.id ?? null,
                priceEstimate: existing.post.price_estimate ? Number(existing.post.price_estimate) : null,
                priceType: existing.post.price_type,
                durationMinutes: existing.post.duration_minutes,
                tags: existing.post.tags,
                isBeforeAfter: existing.post.is_before_after,
                media: [...existing.post.post_media]
                  .sort((a, b) => a.position - b.position)
                  .map((item) => ({
                    url: item.url,
                    path: item.id,
                    bucket: 'posts',
                    mediaType: item.media_type,
                    beforeAfterRole: item.before_after_role as 'before' | 'after' | null,
                    altText: item.alt_text,
                    width: item.width ?? undefined,
                    height: item.height ?? undefined,
                  })),
              }
            : null
        }
      />
    </div>
  );
}
