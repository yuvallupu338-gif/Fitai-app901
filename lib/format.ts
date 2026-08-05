import { CURRENCY_SYMBOL, TIMEZONE } from '@/lib/constants';

const dateFormatter = new Intl.DateTimeFormat('he-IL', {
  timeZone: TIMEZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const dateLongFormatter = new Intl.DateTimeFormat('he-IL', {
  timeZone: TIMEZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const timeFormatter = new Intl.DateTimeFormat('he-IL', {
  timeZone: TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const numberFormatter = new Intl.NumberFormat('he-IL');

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDate(value: string | Date) {
  return dateFormatter.format(toDate(value));
}

export function formatDateLong(value: string | Date) {
  return dateLongFormatter.format(toDate(value));
}

export function formatTime(value: string | Date) {
  return timeFormatter.format(toDate(value));
}

export function formatDateTime(value: string | Date) {
  return `${formatDate(value)} · ${formatTime(value)}`;
}

/** "יום חמישי, 12 במרץ · 17:00" */
export function formatFriendlyDateTime(value: string | Date) {
  return `${formatDateLong(value)} · ${formatTime(value)}`;
}

export function formatNumber(value: number) {
  return numberFormatter.format(value);
}

/** מקצר מספרים גדולים: 1.2 אלף, 3.4 מיליון */
export function formatCompactNumber(value: number) {
  if (value < 1000) return String(value);
  if (value < 1_000_000) {
    const k = value / 1000;
    return `${k % 1 === 0 ? k : k.toFixed(1)} אלף`;
  }
  const m = value / 1_000_000;
  return `${m % 1 === 0 ? m : m.toFixed(1)} מיליון`;
}

export function formatPrice(amount: number | null | undefined, options?: { compact?: boolean }) {
  if (amount === null || amount === undefined) return 'לפי פנייה';
  const rounded = Math.round(Number(amount) * 100) / 100;
  const text = options?.compact ? formatCompactNumber(rounded) : numberFormatter.format(rounded);
  return `${text} ${CURRENCY_SYMBOL}`;
}

/** מציג מחיר לפי סוג התמחור של השירות. */
export function formatServicePrice(
  priceType: 'fixed' | 'range' | 'on_request',
  min: number | null,
  max: number | null,
) {
  if (priceType === 'on_request' || min === null) return 'מחיר לאחר שיחה';
  if (priceType === 'range' && max !== null) return `${formatPrice(min)} – ${formatPrice(max)}`;
  return formatPrice(min);
}

export function formatDuration(minutes: number | null | undefined) {
  if (!minutes) return '';
  if (minutes < 60) return `${minutes} דק׳`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hoursText = hours === 1 ? 'שעה' : hours === 2 ? 'שעתיים' : `${hours} שעות`;
  return rest ? `${hoursText} ו־${rest} דק׳` : hoursText;
}

/** "לפני 5 דקות", "אתמול", "לפני שבועיים" */
export function formatRelativeTime(value: string | Date) {
  const date = toDate(value);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);

  if (diffMinutes < 1) return 'עכשיו';
  if (diffMinutes < 60) return `לפני ${diffMinutes} דק׳`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return diffHours === 1 ? 'לפני שעה' : diffHours === 2 ? 'לפני שעתיים' : `לפני ${diffHours} שעות`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return 'אתמול';
  if (diffDays < 7) return `לפני ${diffDays} ימים`;

  const diffWeeks = Math.round(diffDays / 7);
  if (diffWeeks === 1) return 'לפני שבוע';
  if (diffWeeks === 2) return 'לפני שבועיים';
  if (diffWeeks < 5) return `לפני ${diffWeeks} שבועות`;

  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths === 1) return 'לפני חודש';
  if (diffMonths === 2) return 'לפני חודשיים';
  if (diffMonths < 12) return `לפני ${diffMonths} חודשים`;

  const diffYears = Math.round(diffDays / 365);
  return diffYears === 1 ? 'לפני שנה' : `לפני ${diffYears} שנים`;
}

/** "בעוד 3 ימים", "מחר", "היום" – למפגשים עתידיים. */
export function formatUpcoming(value: string | Date) {
  const date = toDate(value);
  const diffMs = date.getTime() - Date.now();
  if (diffMs < 0) return formatRelativeTime(date);

  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 60) return `בעוד ${diffMinutes} דק׳`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return diffHours === 1 ? 'בעוד שעה' : `בעוד ${diffHours} שעות`;

  const today = new Date();
  const isSameDay = (a: Date, b: Date) => formatDate(a) === formatDate(b);
  const tomorrow = new Date(today.getTime() + 86_400_000);

  if (isSameDay(date, today)) return `היום ב־${formatTime(date)}`;
  if (isSameDay(date, tomorrow)) return `מחר ב־${formatTime(date)}`;

  const diffDays = Math.ceil(diffMs / 86_400_000);
  if (diffDays < 7) return `בעוד ${diffDays} ימים`;
  return formatFriendlyDateTime(date);
}

export function formatExperience(years: number | null | undefined) {
  if (!years) return '';
  if (years === 1) return 'שנת ניסיון אחת';
  if (years === 2) return 'שנתיים ניסיון';
  return `${years} שנות ניסיון`;
}

export function formatDistance(km: number | null | undefined) {
  if (km === null || km === undefined) return '';
  if (km < 1) return 'פחות מק״מ';
  return `${Math.round(km)} ק״מ`;
}

export function formatResponseTime(minutes: number | null | undefined) {
  if (!minutes) return null;
  if (minutes < 60) return `מגיב תוך ${Math.round(minutes)} דק׳`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `מגיב תוך ${hours === 1 ? 'שעה' : `${hours} שעות`}`;
  const days = Math.round(hours / 24);
  return `מגיב תוך ${days === 1 ? 'יום' : `${days} ימים`}`;
}

export function formatRating(rating: number | null | undefined) {
  if (!rating) return '—';
  return Number(rating).toFixed(1);
}

/** ריבוי בעברית: 0 ביקורות / ביקורת אחת / 2 ביקורות */
export function pluralize(count: number, one: string, many: string, zero?: string) {
  if (count === 0 && zero) return zero;
  if (count === 1) return one;
  return `${formatNumber(count)} ${many}`;
}

/** ממיר Date ל־"YYYY-MM-DD" בשעון ישראל (ולא ב־UTC). */
export function toLocalDateString(value: string | Date) {
  const date = toDate(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** "HH:mm" בשעון ישראל. */
export function toLocalTimeString(value: string | Date) {
  return timeFormatter.format(toDate(value));
}

export function weekdayOf(value: string | Date): number {
  const local = new Date(toDate(value).toLocaleString('en-US', { timeZone: TIMEZONE }));
  return local.getDay();
}

/**
 * ממיר תאריך לערך של <input type="datetime-local">.
 *
 * הקלט הזה עובד תמיד בשעון המקומי של הדפדפן, ולכן חייבים לבנות את כל
 * חלקי המחרוזת מאותו מקור. ערבוב של תאריך באזור זמן אחד עם שעה באזור אחר
 * יוצר טווחים לא תקינים (למשל שעת סיום שקודמת לשעת ההתחלה).
 */
export function toDateTimeLocalValue(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** ממיר ערך של <input type="datetime-local"> לחותמת זמן מוחלטת (ISO). */
export function fromDateTimeLocalValue(value: string): string {
  return new Date(value).toISOString();
}
