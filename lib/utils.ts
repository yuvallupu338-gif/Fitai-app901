import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** משלב מספר תוצאות אפשריות לטקסט אחד, מדלג על ערכים ריקים. */
export function joinText(parts: Array<string | null | undefined>, separator = ' · ') {
  return parts.filter((p) => p && p.trim().length > 0).join(separator);
}

/** מקצר טקסט ארוך ומוסיף שלוש נקודות. */
export function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/** יוצר ראשי תיבות לתמונת פרופיל חלופית. */
export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('');
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** מסיר ערכי undefined כדי לא לדרוס שדות במסד הנתונים. */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** מזהה קצר לשימוש במפתחות React או בשמות קבצים. */
export function shortId(length = 8) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}
