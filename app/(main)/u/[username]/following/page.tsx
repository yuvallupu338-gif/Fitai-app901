import { notFound } from 'next/navigation';
import { getProfileByUsername, getFollowList } from '@/lib/data/profiles';
import { PeopleList } from '@/components/shared/people-list';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ username: string }> };

export default async function FollowingPage({ params }: Props) {
  const { username } = await params;
  const data = await getProfileByUsername(decodeURIComponent(username));
  if (!data) notFound();

  const privacy = (data.profile.privacy ?? {}) as Record<string, boolean>;
  if (privacy.show_following === false && !data.isSelf) {
    return (
      <PeopleList title="רשימת הנעקבים פרטית" people={[]} emptyTitle="המשתמש בחר להסתיר את הרשימה" />
    );
  }

  const people = await getFollowList(data.profile.id, 'following');

  return (
    <PeopleList
      title={`${data.profile.full_name} עוקב אחרי`}
      people={people}
      emptyTitle="עדיין לא עוקב אחרי אף אחד"
    />
  );
}
