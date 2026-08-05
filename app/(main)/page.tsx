import { Suspense } from 'react';
import Link from 'next/link';
import { CalendarClock, Compass, Sparkles } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { getFeed, getDiscoverySections } from '@/lib/data/discovery';
import { getPopularProfessions } from '@/lib/data/reference';
import { FEED_TABS, PAGE_SIZE, type FeedTab } from '@/lib/constants';
import { FeedList } from '@/components/feed/feed-list';
import { FeedTabs } from '@/components/feed/feed-tabs';
import { PostSkeletonList } from '@/components/feed/post-skeleton';
import { ProfessionalRail } from '@/components/professional/professional-card';
import { ProfessionChips } from '@/components/search/profession-chips';
import { Button } from '@/components/ui/button';
import { LandingHero } from '@/components/layout/landing-hero';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function HomePage({ searchParams }: PageProps) {
  const session = await getSession();
  const params = await searchParams;

  const validTabs = FEED_TABS.map((t) => t.value) as string[];
  const tab: FeedTab = (validTabs.includes(params.tab ?? '') ? params.tab : 'for_you') as FeedTab;

  // גולש שאינו מחובר רואה עמוד נחיתה עם תוכן ציבורי אמיתי מהמסד.
  if (!session) {
    return <LandingHero />;
  }

  return (
    <div className="space-y-6 py-4">
      <FeedTabs active={tab} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4 px-0 sm:px-4 lg:px-0">
          <Suspense key={tab} fallback={<PostSkeletonList />}>
            <FeedContent tab={tab} cityId={session.user.cityId} />
          </Suspense>
        </div>

        <aside className="hidden space-y-6 lg:block">
          <Suspense fallback={null}>
            <DiscoverySidebar cityId={session.user.cityId} cityName={session.user.cityName} />
          </Suspense>
        </aside>
      </div>

      {/* רצועות הגילוי מוצגות בטלפון מתחת לפיד */}
      <div className="space-y-6 lg:hidden">
        <Suspense fallback={null}>
          <MobileDiscovery cityId={session.user.cityId} cityName={session.user.cityName} />
        </Suspense>
      </div>
    </div>
  );
}

async function FeedContent({ tab, cityId }: { tab: FeedTab; cityId: string | null }) {
  const { posts, total } = await getFeed({ tab, cityId, limit: PAGE_SIZE.feed, offset: 0 });

  return <FeedList initialPosts={posts} total={total} tab={tab} cityId={cityId} />;
}

async function DiscoverySidebar({ cityId, cityName }: { cityId: string | null; cityName: string | null }) {
  const [sections, professions] = await Promise.all([getDiscoverySections(cityId), getPopularProfessions(10)]);

  return (
    <div className="sticky top-20 space-y-6 py-4">
      <section className="surface space-y-3 p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Compass className="size-4 text-primary" aria-hidden />
          קטגוריות
        </h2>
        <ProfessionChips professions={professions} />
      </section>

      {sections.availableToday.length > 0 ? (
        <section className="surface space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <CalendarClock className="size-4 text-primary" aria-hidden />
            זמינים היום{cityName ? ` ב${cityName}` : ''}
          </h2>
          <ul className="space-y-3">
            {sections.availableToday.slice(0, 4).map((professional) => (
              <li key={professional.id}>
                <Link href={`/u/${professional.username}`} className="flex items-center gap-2 hover:opacity-80">
                  <span className="size-9 shrink-0 overflow-hidden rounded-full bg-muted">
                    {professional.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={professional.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{professional.business_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {professional.professions[0]?.name ?? professional.city_name}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Button variant="outline" size="sm" className="w-full" asChild>
            <Link href="/search?availableToday=true">כל הזמינים היום</Link>
          </Button>
        </section>
      ) : null}

      {sections.newest.length > 0 ? (
        <section className="surface space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Sparkles className="size-4 text-primary" aria-hidden />
            חדשים באפליקציה
          </h2>
          <ul className="space-y-3">
            {sections.newest.slice(0, 4).map((professional) => (
              <li key={professional.id}>
                <Link href={`/u/${professional.username}`} className="flex items-center gap-2 hover:opacity-80">
                  <span className="size-9 shrink-0 overflow-hidden rounded-full bg-muted">
                    {professional.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={professional.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{professional.business_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {professional.city_name}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

async function MobileDiscovery({ cityId, cityName }: { cityId: string | null; cityName: string | null }) {
  const [sections, professions] = await Promise.all([getDiscoverySections(cityId), getPopularProfessions(12)]);

  return (
    <>
      <section className="space-y-3">
        <h2 className="px-4 font-semibold">קטגוריות</h2>
        <div className="px-4">
          <ProfessionChips professions={professions} />
        </div>
      </section>

      <ProfessionalRail
        title={`זמינים היום${cityName ? ` ב${cityName}` : ''}`}
        description="אפשר להזמין כבר עכשיו"
        professionals={sections.availableToday}
        href="/search?availableToday=true"
      />

      <ProfessionalRail
        title="חדשים באפליקציה"
        description="בעלי מקצוע שהצטרפו לאחרונה"
        professionals={sections.newest}
        href="/search?sort=newest"
      />

      <ProfessionalRail
        title="מגיעים עד הבית"
        description="שירות בבית הלקוח"
        professionals={sections.homeVisits}
        href="/search?homeVisit=true"
      />

      <ProfessionalRail
        title="מומלצים"
        description="הדירוגים הגבוהים ביותר"
        professionals={sections.recommended}
        href="/search?sort=rating"
      />
    </>
  );
}
