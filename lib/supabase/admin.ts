import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * לקוח Supabase עם הרשאות מלאות (service_role).
 *
 * ⚠️ שרת בלבד. עוקף Row Level Security ולכן כל שימוש בו חייב לכלול
 * בדיקת הרשאה מפורשת בקוד שקורא לו. משמש לפעולות שאין להן משתמש מחובר
 * (הרשמה, התחברות, שחזור סיסמה) ולפעולות ניהול.
 */
let cached: SupabaseClient<Database> | null = null;

export function createAdminClient(): SupabaseClient<Database> {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'חסרים NEXT_PUBLIC_SUPABASE_URL או SUPABASE_SERVICE_ROLE_KEY. ראו .env.example.',
    );
  }

  cached = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-application-name': 'yofi-server' } },
  });

  return cached;
}
