import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getMyAddresses } from '@/lib/data/profiles';
import { getCities } from '@/lib/data/reference';
import { AddressManager } from '@/components/settings/address-manager';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'הכתובות שלי' };

export default async function AddressesPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [addresses, cities] = await Promise.all([getMyAddresses(), getCities()]);

  return <AddressManager addresses={addresses} cities={cities} />;
}
