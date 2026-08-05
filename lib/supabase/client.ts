'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * לקוח Supabase לדפדפן.
 *
 * משמש בעיקר להאזנה בזמן אמת (Realtime). הכתיבה מתבצעת דרך Server Actions,
 * אך גם כאן ההרשאות נאכפות – האסימון נושא את זהות המשתמש ולכן RLS פעיל.
 * המפתח שנחשף הוא anon key בלבד; מפתח ה־service_role לעולם אינו מגיע לדפדפן.
 */
let client: SupabaseClient<Database> | null = null;
let currentToken: string | null = null;

export function getBrowserClient(accessToken: string | null): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('חסרה הגדרת Supabase בצד הלקוח. ראו .env.example.');
  }

  if (!client) {
    client = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 10 } },
      global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
    });
    currentToken = accessToken;
    if (accessToken) client.realtime.setAuth(accessToken);
    return client;
  }

  if (accessToken && accessToken !== currentToken) {
    currentToken = accessToken;
    client.realtime.setAuth(accessToken);
  }

  return client;
}

/** מבקש אסימון גישה מעודכן מהשרת (האסימון תקף לשעה). */
export async function fetchFreshToken(): Promise<string | null> {
  try {
    const response = await fetch('/api/auth/token', { cache: 'no-store' });
    if (!response.ok) return null;
    const data = (await response.json()) as { accessToken: string | null };
    return data.accessToken;
  } catch {
    return null;
  }
}
