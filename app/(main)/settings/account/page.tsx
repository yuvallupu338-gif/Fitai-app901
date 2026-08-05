import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { AccountSettings } from '@/components/settings/account-settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'החשבון שלי' };

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return <AccountSettings username={session.user.username} createdAt={session.user.createdAt} />;
}
