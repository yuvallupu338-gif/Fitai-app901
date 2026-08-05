import { notFound } from 'next/navigation';
import { getPostById, getPostLikes } from '@/lib/data/posts';
import { PeopleList } from '@/components/shared/people-list';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function PostLikesPage({ params }: Props) {
  const { id } = await params;
  const data = await getPostById(id);
  if (!data) notFound();

  const people = await getPostLikes(id);

  return <PeopleList title={`אהבו את "${data.post.title}"`} people={people} emptyTitle="עדיין אין לייקים" />;
}
