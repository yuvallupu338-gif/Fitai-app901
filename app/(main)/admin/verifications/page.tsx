import type { Metadata } from 'next';
import { getAdminVerifications } from '@/lib/data/dashboard';
import { VerificationsList } from '@/components/admin/verifications-list';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'בקשות אימות' };

export default async function AdminVerificationsPage() {
  const verifications = await getAdminVerifications();
  return <VerificationsList verifications={verifications} />;
}
