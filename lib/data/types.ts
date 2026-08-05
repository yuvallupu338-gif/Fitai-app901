export type {
  FeedPost,
  ProfessionalSearchResult,
  SearchSuggestion,
  PostMediaItem,
  ReadinessResult,
  RatingBreakdown,
  AdminStats,
  SeriesPreviewDate,
} from '@/types/app';

/** פרמטרים לפונקציית החיפוש בשכבת הנתונים. */
export type SearchFiltersInput = {
  term?: string | null;
  professionIds?: string[] | null;
  cityId?: string | null;
  maxDistanceKm?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  minRating?: number | null;
  minExperience?: number | null;
  homeVisit?: boolean | null;
  studio?: boolean | null;
  event?: boolean | null;
  online?: boolean | null;
  availableToday?: boolean | null;
  availableNow?: boolean | null;
  recurring?: boolean | null;
  verified?: boolean | null;
  sort?: string;
  limit?: number;
  offset?: number;
};
