import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MessagesSquare } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { getConversations } from '@/lib/data/messages';
import { ConversationList } from '@/components/chat/conversation-list';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'הודעות',
  description: 'שיחות פרטיות עם בעלי מקצוע ולקוחות.',
};

export default async function MessagesPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const conversations = await getConversations();

  return (
    <div className="px-4 py-4 lg:px-0">
      <h1 className="mb-4 text-xl font-bold">הודעות</h1>

      {conversations.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="אין עדיין שיחות"
          description="אפשר לשלוח הודעה לבעל מקצוע ישירות מהפרופיל שלו, או אחרי שליחת הזמנה."
          action={
            <Button asChild>
              <Link href="/search">גילוי בעלי מקצוע</Link>
            </Button>
          }
        />
      ) : (
        <ConversationList conversations={conversations} currentUserId={session.user.id} />
      )}
    </div>
  );
}
