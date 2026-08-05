'use client';

import { useRefreshOnFocus } from '@/hooks/use-realtime';

/** מרענן את נתוני המסך בכל חזרה אליו – כדי שלא יוצג מידע ישן. */
export function RefreshOnFocus() {
  useRefreshOnFocus();
  return null;
}
