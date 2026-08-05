import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * לקוח Supabase בהקשר של משתמש מסוים.
 * כל שאילתה עוברת דרך Row Level Security – בדיוק כמו מהדפדפן.
 * זו ברירת המחדל לקריאת נתונים בצד השרת.
 */
export function createUserClient(accessToken: string | null): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('חסרים NEXT_PUBLIC_SUPABASE_URL או NEXT_PUBLIC_SUPABASE_ANON_KEY. ראו .env.example.');
  }

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
  });
}

/** לקוח אנונימי – לתוכן ציבורי (פיד, חיפוש, פרופילים) עבור גולשים שאינם מחוברים. */
export function createAnonClient(): SupabaseClient<Database> {
  return createUserClient(null);
}
