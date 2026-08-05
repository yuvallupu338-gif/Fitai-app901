import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getLoginSessions } from '@/lib/data/profiles';
import { SecuritySettings } from '@/components/settings/security-settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'אבטחה' };

export default async function SecurityPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const sessions = await getLoginSessions();

  return <SecuritySettings sessions={sessions} currentSessionId={session.sessionId} />;
}
