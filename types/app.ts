import type { Database, Tables } from '@/types/database';

export type PriceType = Database['public']['Enums']['price_type'];
export type BookingStatus = Database['public']['Enums']['booking_status'];
export type SeriesStatus = Database['public']['Enums']['series_status'];
export type LocationType = Database['public']['Enums']['booking_location_type'];
export type Frequency = Database['public']['Enums']['recurrence_frequency'];
export type NotificationType = Database['public']['Enums']['notification_type'];
export type ProfessionalStatus = Database['public']['Enums']['professional_status'];

/** תוצאה אחידה לכל Server Action – מאפשרת טיפול עקבי בשגיאות בממשק. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

// ---------------------------------------------------------------------
// תוצאות RPC
// ---------------------------------------------------------------------

export type PostMediaItem = {
  id: string;
  url: string;
  type: 'image' | 'video';
  thumb: string | null;
  role: 'before' | 'after' | null;
  alt: string | null;
  width: number | null;
  height: number | null;
};

/** שורה מ־public.feed_posts */
export type FeedPost = {
  id: string;
  professional_id: string;
  author_profile_id: string;
  username: string;
  business_name: string;
  author_avatar: string | null;
  is_verified: boolean;
  city_name: string | null;
  title: string;
  description: string | null;
  tags: string[];
  price_estimate: number | null;
  price_type: PriceType;
  duration_minutes: number | null;
  is_before_after: boolean;
  service_id: string | null;
  service_name: string | null;
  profession_name: string | null;
  likes_count: number;
  comments_count: number;
  saves_count: number;
  views_count: number;
  published_at: string;
  media: PostMediaItem[];
  liked_by_me: boolean;
  saved_by_me: boolean;
  followed_by_me: boolean;
  total_count: number;
};

/** שורה מ־public.search_professionals */
export type ProfessionalSearchResult = {
  id: string;
  profile_id: string;
  username: string;
  full_name: string;
  business_name: string;
  headline: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  city_id: string | null;
  city_name: string | null;
  rating_avg: number;
  rating_count: number;
  followers_count: number;
  completed_bookings_count: number;
  years_experience: number | null;
  is_verified: boolean;
  available_today: boolean;
  available_now: boolean;
  accepts_home_visits: boolean;
  accepts_studio: boolean;
  accepts_events: boolean;
  response_time_minutes: number | null;
  min_price: number | null;
  professions: Array<{ id: string; name: string; slug: string }>;
  distance_km: number | null;
  published_at: string | null;
  total_count: number;
};

export type SearchSuggestion = {
  kind: 'profession' | 'city' | 'professional' | 'service';
  id: string;
  label: string;
  sublabel: string | null;
  score: number;
};

export type ReadinessResult = {
  ready: boolean;
  missing: string[];
  completion: number;
  counts?: {
    professions: number;
    services: number;
    areas: number;
    portfolio_images: number;
  };
};

export type SlotCheckResult = {
  ok: boolean;
  reason?:
    | 'professional_not_found'
    | 'professional_inactive'
    | 'too_soon'
    | 'too_far'
    | 'outside_working_hours'
    | 'break_time'
    | 'blocked_date'
    | 'slot_taken';
};

export type RatingBreakdown = {
  average: number;
  count: number;
  stars: Record<string, number>;
  repeat_client_rate: number;
};

export type AdminStats = {
  users_total: number;
  users_today: number;
  users_7d: number;
  professionals_total: number;
  professionals_active: number;
  professionals_pending: number;
  professionals_today: number;
  posts_total: number;
  posts_today: number;
  bookings_total: number;
  bookings_today: number;
  bookings_pending: number;
  series_active: number;
  reviews_total: number;
  reports_open: number;
  profession_requests_open: number;
  verifications_pending: number;
  signups_by_day: Array<{ day: string; count: number }>;
};

export type SeriesPreviewDate = {
  sequence: number;
  scheduled_date: string;
  scheduled_start: string;
};

// ---------------------------------------------------------------------
// טיפוסים מורכבים לתצוגה
// ---------------------------------------------------------------------

export type City = Pick<Tables<'cities'>, 'id' | 'name' | 'district'>;
export type Profession = Pick<
  Tables<'professions'>,
  'id' | 'slug' | 'name' | 'description' | 'icon' | 'category' | 'professionals_count'
>;

export type ProfessionalService = Tables<'professional_services'>;

export type ProfessionalFull = Tables<'professional_profiles'> & {
  profile: Pick<Tables<'profiles'>, 'id' | 'username' | 'full_name' | 'avatar_url' | 'bio' | 'created_at'>;
  city: City | null;
  professions: Profession[];
  services: ProfessionalService[];
  serviceAreas: Array<{ id: string; city: City | null; area_name: string | null; travel_fee: number }>;
  availability: Array<Pick<Tables<'professional_availability'>, 'id' | 'weekday' | 'start_time' | 'end_time' | 'is_break'>>;
  certificates: Array<Pick<Tables<'professional_verifications'>, 'id' | 'kind' | 'title' | 'status'>>;
  contact?: { phone: string | null; studio_address: string | null } | null;
};

export type BookingWithRelations = Tables<'bookings'> & {
  service: Pick<ProfessionalService, 'id' | 'name' | 'duration_minutes' | 'price_type'> | null;
  professional: {
    id: string;
    business_name: string;
    avatar_url: string | null;
    cancellation_policy: string | null;
    profile: { id: string; username: string; full_name: string; avatar_url: string | null };
  } | null;
  client: { id: string; username: string; full_name: string; avatar_url: string | null } | null;
  address: Tables<'service_addresses'> | null;
  series: Pick<Tables<'recurring_booking_series'>, 'id' | 'frequency' | 'status'> | null;
  review: { id: string; rating: number } | null;
};

export type ConversationSummary = {
  id: string;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  lastSenderId: string | null;
  unreadCount: number;
  other: {
    id: string;
    username: string;
    fullName: string;
    avatarUrl: string | null;
    isProfessional: boolean;
    businessName: string | null;
  } | null;
};

export type NotificationItem = Tables<'notifications'> & {
  actor: { id: string; username: string; full_name: string; avatar_url: string | null } | null;
};

export type CommentItem = Tables<'post_comments'> & {
  author: { id: string; username: string; full_name: string; avatar_url: string | null } | null;
};

export type ReviewItem = Tables<'reviews'> & {
  client: { id: string; username: string; full_name: string; avatar_url: string | null } | null;
  service: { id: string; name: string } | null;
  reply: { id: string; body: string; created_at: string } | null;
};

export type RegularClient = {
  clientId: string;
  fullName: string;
  username: string;
  avatarUrl: string | null;
  seriesId: string | null;
  serviceName: string | null;
  frequency: Frequency | null;
  weekday: number | null;
  startTime: string | null;
  priceAmount: number | null;
  status: SeriesStatus | null;
  nextBookingAt: string | null;
  completedCount: number;
  addressLabel: string | null;
};
