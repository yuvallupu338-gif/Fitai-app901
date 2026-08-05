import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession, getScopedClient } from '@/lib/auth/session';
import { SafetySettings } from '@/components/settings/safety-settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'בטיחות' };

export default async function SafetyPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const supabase = await getScopedClient();
  const { data: blocked } = await supabase
    .from('blocked_users')
    .select('blocked_id, created_at, profiles:blocked_id ( id, username, full_name, avatar_url )')
    .order('created_at', { ascending: false });

  return (
    <SafetySettings
      isMinor={session.user.isMinor}
      guardianApproved={session.user.guardianApproved}
      blocked={(blocked ?? []).flatMap((row) => (row.profiles ? [row.profiles] : []))}
    />
  );
}
