import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Bookmark, CalendarDays, ImageOff, MessageSquare, Settings, Star } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { getProfileByUsername, getProfessionalDetails, getProfessionalContact } from '@/lib/data/profiles';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfileHeader } from '@/components/professional/profile-header';
import { ServiceList } from '@/components/professional/service-list';
import { PortfolioGrid } from '@/components/professional/portfolio-grid';
import { ReviewsSection } from '@/components/professional/reviews-section';
import { AboutSection } from '@/components/professional/about-section';
import { ProfileViewTracker } from '@/components/professional/profile-view-tracker';
import { ProfessionalCard } from '@/components/professional/professional-card';
import { formatNumber } from '@/lib/format';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const data = await getProfileByUsername(decodeURIComponent(username));

  if (!data) return { title: 'הפרופיל לא נמצא' };

  const name = data.professional?.business_name ?? data.profile.full_name;
  return {
    title: name,
    description:
      data.professional?.headline ??
      data.profile.bio ??
      `הפרופיל של ${name} באפליקציית יופי`,
  };
}

export default async function ProfilePage({ params }: Props) {
  const { username } = await params;
  const session = await getSession();
  const data = await getProfileByUsername(decodeURIComponent(username));

  if (!data) notFound();

  const { profile, professional, isSelf, isFollowing } = data;

  // פרופיל שאינו פעיל מוצג רק לבעליו ולמנהל.
  const professionalVisible =
    professional && (professional.status === 'active' || isSelf || session?.user.role === 'admin');

  if (!professionalVisible) {
    return (
      <UserProfileView
        profile={profile}
        isSelf={isSelf}
        isFollowing={isFollowing}
        hasPausedProfessional={Boolean(professional)}
      />
    );
  }

  const [details, contact] = await Promise.all([
    getProfessionalDetails(professional.id),
    getProfessionalContact(professional.id),
  ]);

  return (
    <div className="pb-8">
      <ProfileViewTracker professionalId={professional.id} />

      <ProfileHeader
        profile={profile}
        professional={professional}
        professions={details.professions}
        isSelf={isSelf}
        isFollowing={isFollowing}
        isLoggedIn={Boolean(session)}
      />

      <div className="px-4 lg:px-0">
        <Tabs defaultValue="portfolio" className="mt-4">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="portfolio">עבודות ({details.posts.length})</TabsTrigger>
            <TabsTrigger value="services">שירותים ({details.services.length})</TabsTrigger>
            <TabsTrigger value="reviews">ביקורות ({professional.rating_count})</TabsTrigger>
            <TabsTrigger value="about">אודות</TabsTrigger>
          </TabsList>

          <TabsContent value="portfolio">
            {details.posts.length === 0 ? (
              <EmptyState
                icon={ImageOff}
                title="עדיין אין עבודות בתיק"
                description={
                  isSelf
                    ? 'העלו לפחות שלוש תמונות עבודה כדי שהפרופיל יופיע בחיפוש.'
                    : 'בעל המקצוע עדיין לא פרסם עבודות.'
                }
                action={
                  isSelf ? (
                    <Button asChild>
                      <Link href="/create">פרסום עבודה ראשונה</Link>
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <PortfolioGrid posts={details.posts} pinned={details.pinnedPosts} isOwner={isSelf} />
            )}
          </TabsContent>

          <TabsContent value="services">
            <ServiceList
              services={details.services}
              professionalId={professional.id}
              isSelf={isSelf}
              acceptsHomeVisits={professional.accepts_home_visits}
              acceptsStudio={professional.accepts_studio}
            />
          </TabsContent>

          <TabsContent value="reviews">
            <ReviewsSection
              reviews={details.reviews}
              breakdown={details.ratingBreakdown}
              professionalId={professional.id}
              isOwner={isSelf}
            />
          </TabsContent>

          <TabsContent value="about">
            <AboutSection
              professional={professional}
              professions={details.professions}
              serviceAreas={details.serviceAreas}
              availability={details.availability}
              certificates={details.certificates}
              contact={contact}
              joinedAt={profile.created_at}
            />
          </TabsContent>
        </Tabs>

        {details.similar.length > 0 ? (
          <section className="mt-8 space-y-3">
            <h2 className="font-semibold">בעלי מקצוע דומים</h2>
            <div className="scroll-x">
              {details.similar.map((item) => (
                <ProfessionalCard
                  key={item.id}
                  variant="compact"
                  professional={{
                    id: item.id,
                    profile_id: '',
                    username: item.username,
                    full_name: item.business_name,
                    business_name: item.business_name,
                    headline: item.headline,
                    avatar_url: item.avatar_url,
                    cover_url: null,
                    city_id: null,
                    city_name: item.city_name,
                    rating_avg: item.rating_avg,
                    rating_count: item.rating_count,
                    followers_count: 0,
                    completed_bookings_count: 0,
                    years_experience: null,
                    is_verified: item.is_verified,
                    available_today: false,
                    available_now: false,
                    accepts_home_visits: false,
                    accepts_studio: false,
                    accepts_events: false,
                    response_time_minutes: null,
                    min_price: null,
                    professions: [],
                    distance_km: null,
                    published_at: null,
                    total_count: 0,
                  }}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

/** תצוגת פרופיל של משתמש רגיל (ללא פרופיל מקצועי פעיל). */
function UserProfileView({
  profile,
  isSelf,
  isFollowing,
  hasPausedProfessional,
}: {
  profile: {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string | null;
    bio: string | null;
    followers_count: number;
    following_count: number;
    privacy: unknown;
    cities: { id: string; name: string; district: string | null } | null;
  };
  isSelf: boolean;
  isFollowing: boolean;
  hasPausedProfessional: boolean;
}) {
  const privacy = (profile.privacy ?? {}) as Record<string, boolean>;

  return (
    <div className="px-4 py-6 lg:px-0">
      <ProfileHeader
        profile={profile}
        professional={null}
        professions={[]}
        isSelf={isSelf}
        isFollowing={isFollowing}
        isLoggedIn
      />

      {hasPausedProfessional && isSelf ? (
        <div className="mt-4 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm">
          <p className="font-medium">הפרופיל המקצועי שלך אינו פעיל כרגע</p>
          <p className="mt-1 text-muted-foreground">
            הוא אינו מופיע בחיפוש. אפשר להשלים את הפרטים או להפעיל אותו מחדש בהגדרות הפרופיל המקצועי.
          </p>
          <Button size="sm" className="mt-3" asChild>
            <Link href="/pro/onboarding">המשך הגדרת הפרופיל</Link>
          </Button>
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {isSelf ? (
          <>
            <Button variant="outline" className="justify-start" asChild>
              <Link href="/profile/saved">
                <Bookmark className="size-4" aria-hidden />
                שמורים (פרטי)
              </Link>
            </Button>
            <Button variant="outline" className="justify-start" asChild>
              <Link href="/profile/reviews">
                <Star className="size-4" aria-hidden />
                הביקורות שכתבתי
              </Link>
            </Button>
            <Button variant="outline" className="justify-start" asChild>
              <Link href="/dashboard/bookings">
                <CalendarDays className="size-4" aria-hidden />
                ההזמנות שלי
              </Link>
            </Button>
            <Button variant="outline" className="justify-start" asChild>
              <Link href="/settings">
                <Settings className="size-4" aria-hidden />
                הגדרות
              </Link>
            </Button>
          </>
        ) : (
          <Button variant="outline" className="justify-start" asChild>
            <Link href={`/messages/new?to=${profile.id}`}>
              <MessageSquare className="size-4" aria-hidden />
              שליחת הודעה
            </Link>
          </Button>
        )}
      </div>

      {privacy.show_reviews !== false ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {profile.full_name} עוקב אחרי {formatNumber(profile.following_count)} בעלי מקצוע.
        </p>
      ) : null}
    </div>
  );
}
