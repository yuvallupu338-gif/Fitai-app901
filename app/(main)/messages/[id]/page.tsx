import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getConversationDetails, getMessages } from '@/lib/data/messages';
import { ChatRoom } from '@/components/chat/chat-room';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'שיחה',
};

type Props = { params: Promise<{ id: string }> };

export default async function ConversationPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/login');

  const details = await getConversationDetails(id);
  if (!details) notFound();

  const messages = await getMessages(id, 50);

  return (
    <ChatRoom
      conversationId={id}
      initialMessages={messages}
      currentUser={session.user}
      other={details.other}
      otherProfessional={details.otherProfessional}
      isMuted={details.me.is_muted}
    />
  );
}
