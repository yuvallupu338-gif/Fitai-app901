import 'server-only';
import { getScopedClient, requireSession } from '@/lib/auth/session';
import type { ConversationSummary } from '@/types/app';

/** רשימת השיחות של המשתמש, כולל מספר הודעות שלא נקראו. */
export async function getConversations(includeArchived = false): Promise<ConversationSummary[]> {
  const session = await requireSession();
  const supabase = await getScopedClient();

  let membershipQuery = supabase
    .from('conversation_members')
    .select('conversation_id, last_read_at, is_muted, is_archived')
    .eq('profile_id', session.user.id);

  if (!includeArchived) {
    membershipQuery = membershipQuery.eq('is_archived', false);
  }

  const { data: memberships } = await membershipQuery;
  const ids = (memberships ?? []).map((m) => m.conversation_id);
  if (ids.length === 0) return [];

  const [{ data: conversations }, { data: others }, { data: unread }] = await Promise.all([
    supabase
      .from('conversations')
      .select('id, last_message_at, last_message_preview, last_sender_id')
      .in('id', ids)
      .order('last_message_at', { ascending: false }),
    supabase
      .from('conversation_members')
      .select(
        `conversation_id,
         profiles:profile_id ( id, username, full_name, avatar_url, is_professional,
           professional_profiles!professional_profiles_profile_id_fkey ( business_name ) )`,
      )
      .in('conversation_id', ids)
      .neq('profile_id', session.user.id),
    supabase
      .from('messages')
      .select('conversation_id, created_at, sender_id')
      .in('conversation_id', ids)
      .neq('sender_id', session.user.id)
      .is('deleted_at', null),
  ]);

  const readMap = new Map((memberships ?? []).map((m) => [m.conversation_id, m.last_read_at]));

  const unreadCounts = new Map<string, number>();
  for (const message of unread ?? []) {
    const lastRead = readMap.get(message.conversation_id);
    if (!lastRead || new Date(message.created_at) > new Date(lastRead)) {
      unreadCounts.set(message.conversation_id, (unreadCounts.get(message.conversation_id) ?? 0) + 1);
    }
  }

  const otherMap = new Map(
    (others ?? []).map((row) => {
      const professional = Array.isArray(row.profiles?.professional_profiles)
        ? row.profiles?.professional_profiles[0]
        : row.profiles?.professional_profiles;

      return [
        row.conversation_id,
        row.profiles
          ? {
              id: row.profiles.id,
              username: row.profiles.username,
              fullName: row.profiles.full_name,
              avatarUrl: row.profiles.avatar_url,
              isProfessional: row.profiles.is_professional,
              businessName: (professional as { business_name: string } | null)?.business_name ?? null,
            }
          : null,
      ] as const;
    }),
  );

  return (conversations ?? []).map((conversation) => ({
    id: conversation.id,
    lastMessageAt: conversation.last_message_at,
    lastMessagePreview: conversation.last_message_preview,
    lastSenderId: conversation.last_sender_id,
    unreadCount: unreadCounts.get(conversation.id) ?? 0,
    other: otherMap.get(conversation.id) ?? null,
  }));
}

/** הודעות של שיחה מסוימת (עמוד אחד, מהחדשה לישנה). */
export async function getMessages(conversationId: string, limit = 50, before?: string) {
  const supabase = await getScopedClient();

  let query = supabase
    .from('messages')
    .select(
      `id, conversation_id, sender_id, kind, body, attachment_url, attachment_type,
       system_event, booking_id, created_at, edited_at, deleted_at, read_at,
       profiles:sender_id ( id, username, full_name, avatar_url )`,
    )
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) query = query.lt('created_at', before);

  const { data } = await query;
  return (data ?? []).reverse();
}

/** פרטי השיחה והצד השני. */
export async function getConversationDetails(conversationId: string) {
  const session = await requireSession();
  const supabase = await getScopedClient();

  const [{ data: conversation }, { data: members }] = await Promise.all([
    supabase
      .from('conversations')
      .select('id, booking_id, created_at, bookings:booking_id ( id, status, scheduled_start )')
      .eq('id', conversationId)
      .maybeSingle(),
    supabase
      .from('conversation_members')
      .select(
        `profile_id, last_read_at, is_muted, is_archived,
         profiles:profile_id ( id, username, full_name, avatar_url, is_professional, last_seen_at,
           professional_profiles!professional_profiles_profile_id_fkey ( id, business_name, avatar_url, is_verified ) )`,
      )
      .eq('conversation_id', conversationId),
  ]);

  if (!conversation) return null;

  const me = (members ?? []).find((m) => m.profile_id === session.user.id);
  const other = (members ?? []).find((m) => m.profile_id !== session.user.id);

  if (!me) return null;

  const otherProfessional = Array.isArray(other?.profiles?.professional_profiles)
    ? other?.profiles?.professional_profiles[0]
    : other?.profiles?.professional_profiles;

  return {
    conversation,
    me,
    other: other?.profiles ?? null,
    otherProfessional: (otherProfessional as { id: string; business_name: string; avatar_url: string | null; is_verified: boolean } | null) ?? null,
  };
}

/** מספר ההודעות שלא נקראו – לתג בניווט. */
export async function getUnreadMessageCount(): Promise<number> {
  try {
    const conversations = await getConversations();
    return conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  } catch {
    return 0;
  }
}
