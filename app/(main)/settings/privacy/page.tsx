import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { PrivacySettingsForm } from '@/components/settings/privacy-settings-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'פרטיות' };

export default async function PrivacySettingsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return <PrivacySettingsForm privacy={session.user.privacy} />;
}
