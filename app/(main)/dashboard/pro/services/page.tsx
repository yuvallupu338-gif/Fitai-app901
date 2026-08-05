import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getProfessionalEditData } from '@/lib/data/profiles';
import { getProfessions } from '@/lib/data/reference';
import { ServicesManager } from '@/components/dashboard/services-manager';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'שירותים ומחירים' };

export default async function ProServicesPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.user.professionalId) redirect('/pro/onboarding');

  const [editData, professions] = await Promise.all([
    getProfessionalEditData(session.user.professionalId),
    getProfessions(),
  ]);

  return (
    <div className="space-y-4 px-4 py-4 lg:px-0">
      <h1 className="text-xl font-bold">שירותים ומחירים</h1>
      <ServicesManager services={editData.services} professions={professions} />
    </div>
  );
}
