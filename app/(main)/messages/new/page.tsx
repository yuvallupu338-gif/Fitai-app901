import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { openConversationAction } from '@/lib/actions/messages';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ to?: string }> };

/** פותח שיחה עם משתמש ומעביר אליה. */
export default async function NewConversationPage({ searchParams }: Props) {
  const { to } = await searchParams;
  const session = await getSession();

  if (!session) redirect('/login');
  if (!to) redirect('/messages');

  const result = await openConversationAction(to);

  if (!result.ok) {
    redirect('/messages');
  }

  redirect(`/messages/${result.data.conversationId}`);
}
