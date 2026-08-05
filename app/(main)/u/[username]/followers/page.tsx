import { notFound } from 'next/navigation';
import { getProfileByUsername, getFollowList } from '@/lib/data/profiles';
import { PeopleList } from '@/components/shared/people-list';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ username: string }> };

export default async function FollowersPage({ params }: Props) {
  const { username } = await params;
  const data = await getProfileByUsername(decodeURIComponent(username));
  if (!data) notFound();

  const people = await getFollowList(data.profile.id, 'followers');

  return (
    <PeopleList
      title={`העוקבים של ${data.professional?.business_name ?? data.profile.full_name}`}
      people={people}
      emptyTitle="עדיין אין עוקבים"
    />
  );
}
