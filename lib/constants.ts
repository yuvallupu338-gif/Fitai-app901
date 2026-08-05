import type { Database } from '@/types/database';

type BookingStatus = Database['public']['Enums']['booking_status'];
type SeriesStatus = Database['public']['Enums']['series_status'];
type ProfessionalStatus = Database['public']['Enums']['professional_status'];
type NotificationType = Database['public']['Enums']['notification_type'];
type LocationType = Database['public']['Enums']['booking_location_type'];
type Frequency = Database['public']['Enums']['recurrence_frequency'];

export const APP_NAME = 'יופי';
export const APP_TAGLINE = 'הרשת החברתית של עולם היופי והטיפוח';
export const TIMEZONE = 'Asia/Jerusalem';
export const CURRENCY_SYMBOL = '₪';

/** שמות הימים – יום ראשון הוא 0, בהתאמה ל־extract(dow) של Postgres. */
export const WEEKDAYS = [
  { value: 0, short: 'א׳', long: 'ראשון' },
  { value: 1, short: 'ב׳', long: 'שני' },
  { value: 2, short: 'ג׳', long: 'שלישי' },
  { value: 3, short: 'ד׳', long: 'רביעי' },
  { value: 4, short: 'ה׳', long: 'חמישי' },
  { value: 5, short: 'ו׳', long: 'שישי' },
  { value: 6, short: 'ש׳', long: 'שבת' },
] as const;

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  draft: 'טיוטה',
  pending: 'ממתין לאישור',
  confirmed: 'אושר',
  change_proposed: 'הוצע שינוי',
  cancelled: 'בוטל',
  on_the_way: 'בדרך אליך',
  arrived: 'הגיע',
  in_progress: 'בטיפול',
  completed: 'הושלם',
  no_show: 'לא התקיים',
};

export const BOOKING_STATUS_TONE: Record<BookingStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral',
  pending: 'warning',
  confirmed: 'success',
  change_proposed: 'warning',
  cancelled: 'danger',
  on_the_way: 'info',
  arrived: 'info',
  in_progress: 'info',
  completed: 'success',
  no_show: 'danger',
};

/** הסטטוסים שנחשבים "פעילים" ביומן ובלוחות הבקרה. */
export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  'pending',
  'confirmed',
  'change_proposed',
  'on_the_way',
  'arrived',
  'in_progress',
];

export const SERIES_STATUS_LABELS: Record<SeriesStatus, string> = {
  pending: 'ממתין לאישור',
  active: 'פעילה',
  paused: 'מושהית',
  completed: 'הסתיימה',
  cancelled: 'בוטלה',
};

export const PROFESSIONAL_STATUS_LABELS: Record<ProfessionalStatus, string> = {
  draft: 'טיוטה',
  pending_review: 'ממתין לאישור מנהל',
  active: 'פעיל',
  paused: 'מושהה',
  rejected: 'נדחה',
};

export const LOCATION_LABELS: Record<LocationType, string> = {
  client_home: 'בבית הלקוח',
  studio: 'בסטודיו של בעל המקצוע',
  event: 'באירוע',
  online: 'אונליין',
};

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: 'כל שבוע',
  biweekly: 'כל שבועיים',
  every_3_weeks: 'כל שלושה שבועות',
  every_4_weeks: 'כל ארבעה שבועות',
  monthly: 'כל חודש',
  custom: 'תדירות מותאמת אישית',
};

export const FREQUENCY_WEEKS: Record<Frequency, number> = {
  weekly: 1,
  biweekly: 2,
  every_3_weeks: 3,
  every_4_weeks: 4,
  monthly: 4,
  custom: 2,
};

export const PRICE_TYPE_LABELS = {
  fixed: 'מחיר קבוע',
  range: 'טווח מחירים',
  on_request: 'מחיר לאחר שיחה',
} as const;

export const NOTIFICATION_ICONS: Record<NotificationType, string> = {
  new_message: 'message-circle',
  new_follower: 'user-plus',
  post_like: 'heart',
  post_comment: 'message-square',
  new_post: 'image',
  booking_created: 'calendar-plus',
  booking_confirmed: 'calendar-check',
  booking_rejected: 'calendar-x',
  booking_change_proposed: 'calendar-clock',
  booking_price_changed: 'badge-shekel',
  booking_reminder: 'bell-ring',
  booking_on_the_way: 'car',
  booking_cancelled: 'calendar-x',
  booking_completed: 'circle-check',
  series_created: 'repeat',
  series_confirmed: 'repeat',
  series_changed: 'repeat',
  series_cancelled: 'repeat',
  new_review: 'star',
  review_reply: 'reply',
  professional_approved: 'badge-check',
  profession_approved: 'sparkles',
  verification_approved: 'shield-check',
  system: 'info',
};

export const SORT_OPTIONS = [
  { value: 'recommended', label: 'מומלצים' },
  { value: 'nearest', label: 'הכי קרובים' },
  { value: 'newest', label: 'חדשים' },
  { value: 'rating', label: 'דירוג גבוה' },
  { value: 'price_low', label: 'מחיר נמוך' },
  { value: 'response', label: 'זמן תגובה מהיר' },
  { value: 'availability', label: 'זמינות קרובה' },
  { value: 'followers', label: 'מספר עוקבים' },
] as const;

export const FEED_TABS = [
  { value: 'for_you', label: 'בשבילך' },
  { value: 'following', label: 'עוקב' },
  { value: 'new', label: 'חדש' },
  { value: 'popular', label: 'פופולרי' },
  { value: 'city', label: 'בעיר שלי' },
  { value: 'before_after', label: 'לפני ואחרי' },
] as const;

export type FeedTab = (typeof FEED_TABS)[number]['value'];

export const REPORT_REASONS = [
  { value: 'spam', label: 'ספאם או פרסום' },
  { value: 'inappropriate', label: 'תוכן לא הולם' },
  { value: 'fake', label: 'פרופיל או תוכן מזויף' },
  { value: 'harassment', label: 'הטרדה או שפה פוגענית' },
  { value: 'privacy', label: 'פגיעה בפרטיות' },
  { value: 'no_consent', label: 'פרסום תמונה ללא אישור המצולם' },
  { value: 'other', label: 'אחר' },
] as const;

/** מגבלות העלאת קבצים – נאכפות גם בשרת וגם בדליי ה־Storage. */
export const UPLOAD_LIMITS = {
  image: {
    maxBytes: 8 * 1024 * 1024,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  },
  video: {
    maxBytes: 25 * 1024 * 1024,
    mimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
  },
  document: {
    maxBytes: 10 * 1024 * 1024,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  },
} as const;

export const STORAGE_BUCKETS = ['avatars', 'covers', 'posts', 'messages', 'reviews', 'certificates'] as const;
export type StorageBucket = (typeof STORAGE_BUCKETS)[number];

export const PAGE_SIZE = {
  feed: 8,
  search: 12,
  comments: 20,
  messages: 40,
  notifications: 20,
  bookings: 15,
} as const;

export const PROFILE_STEPS = [
  { key: 'details', label: 'פרטים מקצועיים' },
  { key: 'location', label: 'מקום מתן השירות' },
  { key: 'services', label: 'שירותים ומחירים' },
  { key: 'availability', label: 'שעות וזמינות' },
  { key: 'portfolio', label: 'תיק עבודות' },
] as const;

export const READINESS_LABELS: Record<string, string> = {
  avatar: 'תמונת פרופיל מקצועית',
  profession: 'מקצוע אחד לפחות',
  service: 'שירות אחד לפחות עם מחיר',
  city: 'עיר',
  service_area: 'אזורי שירות',
  portfolio: 'שלוש תמונות עבודה לפחות',
  profile: 'פרופיל מקצועי',
};
