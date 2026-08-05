'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useSession } from '@/components/providers';

type TableName = string;

/**
 * מאזין לשינויים בטבלה בזמן אמת.
 * מוגן מפני ריצות כפולות ומנקה את החיבור ביציאה מהמסך.
 */
export function useRealtime<T extends Record<string, unknown>>(
  options: {
    table: TableName;
    event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
    filter?: string;
    enabled?: boolean;
  },
  onChange: (payload: RealtimePostgresChangesPayload<T>) => void,
) {
  const { supabase, user } = useSession();
  const callbackRef = React.useRef(onChange);
  callbackRef.current = onChange;

  // מזהה ייחודי לכל שימוש בהוק. בלעדיו שני רכיבים שמאזינים לאותה טבלה
  // היו מקבלים את אותו ערוץ, והקריאה השנייה ל־on() אחרי subscribe() זורקת שגיאה.
  const instanceId = React.useId();

  const { table, event = '*', filter, enabled = true } = options;

  React.useEffect(() => {
    if (!enabled || !user) return undefined;

    const channelName = `rt:${table}:${event}:${filter ?? 'all'}:${user.id}:${instanceId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event, schema: 'public', table, ...(filter ? { filter } : {}) } as never,
        (payload: RealtimePostgresChangesPayload<T>) => callbackRef.current(payload),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, user, table, event, filter, enabled, instanceId]);
}

/**
 * מרענן את נתוני השרת כאשר מתרחש שינוי רלוונטי.
 * משמש במסכים שבהם קל יותר לרענן מלנהל מצב מקומי.
 */
export function useRealtimeRefresh(options: {
  table: TableName;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: string;
  enabled?: boolean;
  debounceMs?: number;
}) {
  const router = useRouter();
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useRealtime(options, () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), options.debounceMs ?? 400);
  });

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
}

/**
 * מרענן את המסך בכל חזרה אליו (focus / חזרה מרקע),
 * כדי שהמידע שמוצג יהיה תמיד עדכני גם ללא Realtime.
 */
export function useRefreshOnFocus(enabled = true) {
  const router = useRouter();
  const lastRefresh = React.useRef(Date.now());

  React.useEffect(() => {
    if (!enabled) return undefined;

    const refresh = () => {
      // מונע רענון מיותר כשעוברים בין חלונות במהירות.
      if (Date.now() - lastRefresh.current < 15_000) return;
      lastRefresh.current = Date.now();
      router.refresh();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [router, enabled]);
}
