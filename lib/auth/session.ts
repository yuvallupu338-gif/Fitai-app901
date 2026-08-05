import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { createHash, randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createUserClient } from '@/lib/supabase/server';
import { signSupabaseToken } from '@/lib/auth/jwt';
import type { Database } from '@/types/database';
import { SESSION_COOKIE } from '@/lib/auth/constants';

export { SESSION_COOKIE } from '@/lib/auth/constants';
const SESSION_DAYS_DEFAULT = 7;
const SESSION_DAYS_REMEMBER = 60;

export type SessionUser = {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
  bio: string | null;
  cityId: string | null;
  cityName: string | null;
  role: Database['public']['Enums']['account_role'];
  status: Database['public']['Enums']['account_status'];
  activeMode: Database['public']['Enums']['app_mode'];
  isProfessional: boolean;
  professionalId: string | null;
  professionalStatus: Database['public']['Enums']['professional_status'] | null;
  followersCount: number;
  followingCount: number;
  birthDate: string | null;
  isMinor: boolean;
  guardianApproved: boolean;
  privacy: Record<string, unknown>;
  notificationPrefs: Record<string, unknown>;
  createdAt: string;
};

export type Session = {
  user: SessionUser;
  /** אסימון חתום שמעביר את זהות המשתמש ל־Supabase כדי ש־RLS ייאכף. */
  accessToken: string;
  sessionId: string;
};

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

/** יוצר סשן חדש ושומר עוגייה מאובטחת. */
export async function createSession(profileId: string, remember: boolean) {
  const token = randomBytes(32).toString('base64url');
  const days = remember ? SESSION_DAYS_REMEMBER : SESSION_DAYS_DEFAULT;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const headerList = await headers();
  const admin = createAdminClient();

  await admin.from('auth_sessions').insert({
    profile_id: profileId,
    token_hash: hashToken(token),
    user_agent: headerList.get('user-agent')?.slice(0, 300) ?? null,
    ip_address: clientIp(headerList),
    expires_at: expiresAt.toISOString(),
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

/** מנתק את הסשן הנוכחי. */
export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    const admin = createAdminClient();
    await admin
      .from('auth_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', hashToken(token));
  }

  cookieStore.delete(SESSION_COOKIE);
}

/** מנתק את כל הסשנים של המשתמש (למשל לאחר שינוי סיסמה). */
export async function revokeAllSessions(profileId: string, exceptSessionId?: string) {
  const admin = createAdminClient();
  let query = admin
    .from('auth_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('profile_id', profileId)
    .is('revoked_at', null);

  if (exceptSessionId) query = query.neq('id', exceptSessionId);
  await query;
}

export function clientIp(headerList: Headers): string | null {
  const forwarded = headerList.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headerList.get('x-real-ip');
}

/**
 * מחזיר את הסשן הנוכחי. התוצאה נשמרת במטמון לכל בקשה,
 * כך שקומפוננטות רבות יכולות לקרוא לה בלי שאילתות כפולות.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const admin = createAdminClient();
  const { data: session } = await admin
    .from('auth_sessions')
    .select('id, profile_id, expires_at, revoked_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle();

  if (!session || session.revoked_at || new Date(session.expires_at) < new Date()) {
    return null;
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select(
      `id, username, full_name, avatar_url, bio, city_id, role, status, active_mode,
       is_professional, followers_count, following_count, birth_date, guardian_approved_at,
       privacy, notification_prefs, created_at,
       cities:city_id ( name ),
       professional_profiles!professional_profiles_profile_id_fkey ( id, status )`,
    )
    .eq('id', session.profile_id)
    .maybeSingle();

  if (profileError) {
    // כשל כאן מנתק את המשתמש בשקט – חשוב שיופיע בלוג.
    console.error('[session] טעינת הפרופיל נכשלה:', profileError.message);
    return null;
  }

  if (!profile || profile.status === 'banned' || profile.status === 'deleted') {
    return null;
  }

  // עדכון "נראה לאחרונה" ללא חסימת הבקשה.
  void admin
    .from('auth_sessions')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', session.id)
    .then(() => undefined);

  const professional = Array.isArray(profile.professional_profiles)
    ? profile.professional_profiles[0]
    : profile.professional_profiles;

  const city = Array.isArray(profile.cities) ? profile.cities[0] : profile.cities;

  const birthDate = profile.birth_date;
  const isMinor = birthDate
    ? new Date(birthDate) > new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000)
    : false;

  return {
    sessionId: session.id,
    accessToken: signSupabaseToken(profile.id, profile.role),
    user: {
      id: profile.id,
      username: profile.username,
      fullName: profile.full_name,
      avatarUrl: profile.avatar_url,
      bio: profile.bio,
      cityId: profile.city_id,
      cityName: (city as { name: string } | null)?.name ?? null,
      role: profile.role,
      status: profile.status,
      activeMode: profile.active_mode,
      isProfessional: profile.is_professional,
      professionalId: (professional as { id: string } | null)?.id ?? null,
      professionalStatus:
        (professional as { status: Database['public']['Enums']['professional_status'] } | null)?.status ?? null,
      followersCount: profile.followers_count,
      followingCount: profile.following_count,
      birthDate,
      isMinor,
      guardianApproved: Boolean(profile.guardian_approved_at),
      privacy: (profile.privacy ?? {}) as Record<string, unknown>,
      notificationPrefs: (profile.notification_prefs ?? {}) as Record<string, unknown>,
      createdAt: profile.created_at,
    },
  };
});

/** לקוח Supabase בהקשר המשתמש המחובר (או אנונימי אם אין). */
export const getScopedClient = cache(async () => {
  const session = await getSession();
  return createUserClient(session?.accessToken ?? null);
});

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    throw new AuthError('צריך להתחבר כדי לבצע פעולה זו');
  }
  return session;
}

export async function requireProfessional(): Promise<Session & { professionalId: string }> {
  const session = await requireSession();
  if (!session.user.professionalId) {
    throw new AuthError('הפעולה זמינה לבעלי מקצוע בלבד');
  }
  return { ...session, professionalId: session.user.professionalId };
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (session.user.role !== 'admin' && session.user.role !== 'moderator') {
    throw new AuthError('אין לך הרשאת ניהול');
  }
  return session;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}
