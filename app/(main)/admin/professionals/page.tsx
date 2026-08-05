import type { Metadata } from 'next';
import { getAdminProfessionals } from '@/lib/data/dashboard';
import { ProfessionalsTable } from '@/components/admin/professionals-table';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'ניהול בעלי מקצוע' };

type Props = { searchParams: Promise<{ status?: string }> };

export default async function AdminProfessionalsPage({ searchParams }: Props) {
  const { status } = await searchParams;
  const professionals = await getAdminProfessionals(status);

  return <ProfessionalsTable professionals={professionals} activeStatus={status ?? ''} />;
}
