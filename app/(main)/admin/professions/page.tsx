import type { Metadata } from 'next';
import { getAdminProfessionRequests, getAdminProfessions } from '@/lib/data/dashboard';
import { ProfessionsManager } from '@/components/admin/professions-manager';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'ניהול מקצועות' };

export default async function AdminProfessionsPage() {
  const [professions, requests] = await Promise.all([getAdminProfessions(), getAdminProfessionRequests()]);

  return <ProfessionsManager professions={professions} requests={requests} />;
}
