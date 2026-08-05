import type { Metadata } from 'next';
import { getAdminUsers } from '@/lib/data/dashboard';
import { UsersTable } from '@/components/admin/users-table';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'ניהול משתמשים' };

type Props = { searchParams: Promise<{ q?: string }> };

export default async function AdminUsersPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const users = await getAdminUsers(q ?? null);

  return <UsersTable users={users} query={q ?? ''} />;
}
