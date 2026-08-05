'use client';

import { useRealtimeRefresh } from '@/hooks/use-realtime';

/** מרענן את המסך כאשר משתנה טבלה מסוימת במסד הנתונים. */
export function RealtimeRefresh({
  table,
  event = '*',
  filter,
}: {
  table: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: string;
}) {
  useRealtimeRefresh({ table, event, filter });
  return null;
}
