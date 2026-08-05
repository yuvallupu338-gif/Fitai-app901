import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchX } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { getCities, getProfessions } from '@/lib/data/reference';
import { getPopularSearches } from '@/lib/data/reference';
import { getRecentSearches, getSavedSearches, searchProfessionals } from '@/lib/data/discovery';
import { PAGE_SIZE } from '@/lib/constants';
import { SearchClient } from '@/components/search/search-client';
import { ProfessionalCard } from '@/components/professional/professional-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'חיפוש',
  description: 'חיפוש בעלי מקצוע בתחום היופי לפי מקצוע, עיר, מחיר, דירוג וזמינות.',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function bool(value: string | string[] | undefined): boolean | undefined {
  const raw = first(value);
  return raw === 'true' ? true : undefined;
}

function num(value: string | string[] | undefined): number | undefined {
  const raw = first(value);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getSession();

  const [cities, professions, popular, recent, saved] = await Promise.all([
    getCities(),
    getProfessions(),
    getPopularSearches(8),
    session ? getRecentSearches(6) : Promise.resolve([]),
    session ? getSavedSearches() : Promise.resolve([]),
  ]);

  const professionParam = first(params.profession);
  const filters = {
    term: first(params.term) ?? '',
    professionIds: professionParam ? professionParam.split(',').filter(Boolean) : [],
    cityId: first(params.city) ?? session?.user.cityId ?? null,
    maxDistanceKm: num(params.distance) ?? null,
    priceMin: num(params.priceMin) ?? null,
    priceMax: num(params.priceMax) ?? null,
    minRating: num(params.rating) ?? null,
    minExperience: num(params.experience) ?? null,
    homeVisit: bool(params.homeVisit),
    studio: bool(params.studio),
    event: bool(params.event),
    online: bool(params.online),
    availableToday: bool(params.availableToday),
    availableNow: bool(params.availableNow),
    recurring: bool(params.recurring),
    verified: bool(params.verified),
    sort: first(params.sort) ?? 'recommended',
    page: num(params.page) ?? 1,
  };

  return (
    <div className="space-y-5 px-4 py-4 lg:px-0">
      <SearchClient
        cities={cities}
        professions={professions}
        popularSearches={popular}
        recentSearches={recent}
        savedSearches={saved}
        filters={filters}
        isLoggedIn={Boolean(session)}
      />

      <Suspense key={JSON.stringify(filters)} fallback={<ResultsSkeleton />}>
        <SearchResults filters={filters} />
      </Suspense>
    </div>
  );
}

async function SearchResults({ filters }: { filters: Record<string, unknown> }) {
  const page = Number(filters.page ?? 1);
  const { results, total } = await searchProfessionals({
    ...filters,
    limit: PAGE_SIZE.search,
    offset: (page - 1) * PAGE_SIZE.search,
  } as never);

  if (results.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="לא נמצאו בעלי מקצוע"
        description="אפשר לנסות מונח חיפוש אחר, להרחיב את המרחק או להסיר חלק מהמסננים. האפליקציה מתעדכנת כל יום ובעלי מקצוע חדשים מצטרפים כל הזמן."
      />
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE.search);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        נמצאו {total} בעלי מקצוע
      </p>

      <ul className="grid gap-3 md:grid-cols-2">
        {results.map((professional) => (
          <li key={professional.id}>
            <ProfessionalCard professional={professional} />
          </li>
        ))}
      </ul>

      {totalPages > 1 ? <Pagination page={page} totalPages={totalPages} /> : null}
    </div>
  );
}

function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  const pages = Array.from({ length: Math.min(totalPages, 7) }, (_, index) => {
    if (totalPages <= 7) return index + 1;
    if (page <= 4) return index + 1;
    if (page >= totalPages - 3) return totalPages - 6 + index;
    return page - 3 + index;
  });

  return (
    <nav className="flex items-center justify-center gap-1 pt-2" aria-label="ניווט בין עמודי התוצאות">
      {pages.map((pageNumber) => (
        <a
          key={pageNumber}
          href={`?${new URLSearchParams({ page: String(pageNumber) }).toString()}`}
          aria-current={pageNumber === page ? 'page' : undefined}
          className={
            pageNumber === page
              ? 'flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground'
              : 'flex size-9 items-center justify-center rounded-lg text-sm text-muted-foreground hover:bg-muted'
          }
        >
          {pageNumber}
        </a>
      ))}
    </nav>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2" aria-busy="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="surface flex gap-3 p-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-full" />
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
