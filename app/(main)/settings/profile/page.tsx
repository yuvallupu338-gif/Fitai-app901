import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getCities } from '@/lib/data/reference';
import { ProfileSettingsForm } from '@/components/settings/profile-settings-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'הגדרות פרופיל' };

export default async function ProfileSettingsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const cities = await getCities();

  return <ProfileSettingsForm user={session.user} cities={cities} />;
}
