import type { Metadata } from 'next';
import { getAdminReports } from '@/lib/data/dashboard';
import { ReportsTable } from '@/components/admin/reports-table';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'דיווחים' };

type Props = { searchParams: Promise<{ status?: string }> };

export default async function AdminReportsPage({ searchParams }: Props) {
  const { status } = await searchParams;
  const reports = await getAdminReports(status ?? 'open');

  return <ReportsTable reports={reports} activeStatus={status ?? 'open'} />;
}
