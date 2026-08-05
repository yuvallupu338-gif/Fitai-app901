import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession, getScopedClient } from '@/lib/auth/session';
import { ProfessionalSettings } from '@/components/settings/professional-settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'הגדרות מקצועיות' };

export default async function ProSettingsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.user.professionalId) redirect('/pro/onboarding');

  const supabase = await getScopedClient();
  const [{ data: professional }, { data: verifications }] = await Promise.all([
    supabase
      .from('professional_profiles')
      .select('id, status, is_verified, phone_verified, cancellation_policy')
      .eq('id', session.user.professionalId)
      .maybeSingle(),
    supabase
      .from('professional_verifications')
      .select('id, kind, title, status, created_at')
      .eq('professional_id', session.user.professionalId)
      .order('created_at', { ascending: false }),
  ]);

  return (
    <div className="space-y-4 px-4 py-4 lg:px-0">
      <h1 className="text-xl font-bold">הגדרות מקצועיות</h1>
      <ProfessionalSettings
        status={professional?.status ?? 'draft'}
        isVerified={professional?.is_verified ?? false}
        phoneVerified={professional?.phone_verified ?? false}
        verifications={verifications ?? []}
      />
    </div>
  );
}
