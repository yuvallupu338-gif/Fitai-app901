import 'server-only';
import { getScopedClient } from '@/lib/auth/session';
import type {
  FeedPost,
  ProfessionalSearchResult,
  SearchSuggestion,
  SearchFiltersInput,
} from '@/lib/data/types';

export type { SearchFiltersInput };

/** טוען את הפיד מהמסד. כל הלשוניות משתמשות באותה פונקציה עם פרמטר שונה. */
export async function getFeed(options: {
  tab?: string;
  cityId?: string | null;
  limit?: number;
  offset?: number;
}): Promise<{ posts: FeedPost[]; total: number }> {
  const supabase = await getScopedClient();

  const { data, error } = await supabase.rpc('feed_posts', {
    p_tab: options.tab ?? 'for_you',
    p_city_id: options.cityId ?? null,
    p_limit: options.limit ?? 8,
    p_offset: options.offset ?? 0,
  } as never);

  if (error) {
    console.error('[feed]', error.message);
    return { posts: [], total: 0 };
  }

  const posts = (data ?? []) as unknown as FeedPost[];
  return { posts, total: posts[0]?.total_count ?? 0 };
}

/** חיפוש בעלי מקצוע עם כל המסננים. */
export async function searchProfessionals(
  filters: SearchFiltersInput,
): Promise<{ results: ProfessionalSearchResult[]; total: number }> {
  const supabase = await getScopedClient();

  const { data, error } = await supabase.rpc('search_professionals', {
    p_term: filters.term || null,
    p_profession_ids: filters.professionIds?.length ? filters.professionIds : null,
    p_city_id: filters.cityId ?? null,
    p_max_distance_km: filters.maxDistanceKm ?? null,
    p_price_min: filters.priceMin ?? null,
    p_price_max: filters.priceMax ?? null,
    p_min_rating: filters.minRating ?? null,
    p_min_experience: filters.minExperience ?? null,
    p_home_visit: filters.homeVisit ?? null,
    p_studio: filters.studio ?? null,
    p_event: filters.event ?? null,
    p_online: filters.online ?? null,
    p_available_today: filters.availableToday ?? null,
    p_available_now: filters.availableNow ?? null,
    p_recurring: filters.recurring ?? null,
    p_verified: filters.verified ?? null,
    p_sort: filters.sort ?? 'recommended',
    p_limit: filters.limit ?? 12,
    p_offset: filters.offset ?? 0,
  } as never);

  if (error) {
    console.error('[search]', error.message);
    return { results: [], total: 0 };
  }

  const results = (data ?? []) as unknown as ProfessionalSearchResult[];
  return { results, total: results[0]?.total_count ?? 0 };
}

/** הצעות להשלמה אוטומטית בשורת החיפוש. */
export async function getSearchSuggestions(term: string, limit = 6): Promise<SearchSuggestion[]> {
  if (term.trim().length < 2) return [];

  const supabase = await getScopedClient();
  const { data, error } = await supabase.rpc('search_suggestions', {
    p_term: term,
    p_limit: limit,
  } as never);

  if (error) return [];

  return ((data ?? []) as unknown as SearchSuggestion[])
    .filter((s) => s.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit * 2);
}

/** קטגוריות הגילוי בעמוד הבית: חדשים, מומלצים, זמינים היום. */
export async function getDiscoverySections(cityId: string | null) {
  const [newest, recommended, availableToday, homeVisits] = await Promise.all([
    searchProfessionals({ sort: 'newest', limit: 10, cityId }),
    searchProfessionals({ sort: 'rating', limit: 10, cityId }),
    searchProfessionals({ sort: 'availability', availableToday: true, limit: 10, cityId }),
    searchProfessionals({ sort: 'recommended', homeVisit: true, limit: 10, cityId }),
  ]);

  return {
    newest: newest.results,
    recommended: recommended.results,
    availableToday: availableToday.results,
    homeVisits: homeVisits.results,
  };
}

/** חיפושים אחרונים של המשתמש. */
export async function getRecentSearches(limit = 6): Promise<string[]> {
  const supabase = await getScopedClient();
  const { data } = await supabase
    .from('search_history')
    .select('term')
    .order('created_at', { ascending: false })
    .limit(limit);

  const seen = new Set<string>();
  return (data ?? [])
    .map((row) => row.term)
    .filter((term) => {
      const key = term.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export async function getSavedSearches() {
  const supabase = await getScopedClient();
  const { data } = await supabase
    .from('saved_searches')
    .select('id, name, query, notify_on_match, created_at')
    .order('created_at', { ascending: false });

  return data ?? [];
}
