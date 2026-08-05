import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * מנפיק אסימון גישה קצר־מועד ל־Supabase עבור המשתמש המחובר.
 * הדפדפן משתמש בו כדי להאזין לעדכונים בזמן אמת תחת אותן הרשאות RLS.
 */
export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ accessToken: null }, { status: 401 });
  }

  return NextResponse.json(
    { accessToken: session.accessToken },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
