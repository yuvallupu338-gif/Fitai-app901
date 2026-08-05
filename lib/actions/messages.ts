'use server';

import { revalidatePath } from 'next/cache';
import { getScopedClient, requireSession } from '@/lib/auth/session';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { messageSchema } from '@/lib/validations';
import { fail, guard, ok, parseInput } from '@/lib/actions/result';
import type { ActionResult } from '@/types/app';

/** פותח שיחה עם משתמש (או מחזיר שיחה קיימת). */
export async function openConversationAction(
  otherProfileId: string,
): Promise<ActionResult<{ conversationId: string }>> {
  return guard(async () => {
    await requireSession();
    const supabase = await getScopedClient();

    const { data, error } = await supabase.rpc('get_or_create_direct_conversation', {
      p_other: otherProfileId,
    } as never);

    if (error) throw new Error(error.message);
    return ok({ conversationId: data as unknown as string });
  });
}

export type SentMessage = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  kind: 'text' | 'image' | 'system';
  body: string | null;
  attachment_url: string | null;
  created_at: string;
  read_at: string | null;
  deleted_at: string | null;
};

export async function sendMessageAction(input: unknown): Promise<ActionResult<SentMessage>> {
  return guard(async () => {
    const session = await requireSession();
    const parsed = parseInput(messageSchema, input);
    if (!parsed.success) return parsed.result;

    if (!(await consumeRateLimit(RATE_LIMITS.message, session.user.id))) {
      return fail('שלחת הרבה הודעות בזמן קצר. אפשר לנסות שוב בעוד דקה.');
    }

    const supabase = await getScopedClient();
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: parsed.data.conversationId,
        sender_id: session.user.id,
        kind: parsed.data.attachmentUrl ? 'image' : 'text',
        body: parsed.data.body || null,
        attachment_url: parsed.data.attachmentUrl ?? null,
        attachment_type: parsed.data.attachmentUrl ? 'image' : null,
      })
      .select('id, conversation_id, sender_id, kind, body, attachment_url, created_at, read_at, deleted_at')
      .single();

    if (error || !data) throw new Error(error?.message ?? 'שליחת ההודעה נכשלה');

    revalidatePath(`/messages/${parsed.data.conversationId}`);
    return ok(data as SentMessage);
  });
}

/** סימון השיחה כנקראה עד הרגע הנוכחי. */
export async function markConversationReadAction(conversationId: string): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const supabase = await getScopedClient();

    const { error } = await supabase
      .from('conversation_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('profile_id', session.user.id);

    if (error) throw new Error(error.message);

    // סימון ההודעות הנכנסות כנקראו – מאפשר להציג "נקרא" לשולח.
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .neq('sender_id', session.user.id)
      .is('read_at', null);

    revalidatePath('/messages');
    return ok(undefined);
  });
}

/** מחיקת הודעה של המשתמש עצמו (מחיקה רכה – נשארת בהיסטוריה). */
export async function deleteMessageAction(messageId: string): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const supabase = await getScopedClient();

    const { error } = await supabase
      .from('messages')
      .update({ deleted_at: new Date().toISOString(), body: null, attachment_url: null })
      .eq('id', messageId)
      .eq('sender_id', session.user.id);

    if (error) throw new Error(error.message);
    return ok(undefined, 'ההודעה נמחקה');
  });
}

export async function setConversationMutedAction(
  conversationId: string,
  muted: boolean,
): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const supabase = await getScopedClient();

    const { error } = await supabase
      .from('conversation_members')
      .update({ is_muted: muted })
      .eq('conversation_id', conversationId)
      .eq('profile_id', session.user.id);

    if (error) throw new Error(error.message);

    revalidatePath('/messages');
    return ok(undefined, muted ? 'ההתראות מהשיחה הושתקו' : 'ההתראות הופעלו מחדש');
  });
}

export async function archiveConversationAction(
  conversationId: string,
  archived: boolean,
): Promise<ActionResult> {
  return guard(async () => {
    const session = await requireSession();
    const supabase = await getScopedClient();

    const { error } = await supabase
      .from('conversation_members')
      .update({ is_archived: archived })
      .eq('conversation_id', conversationId)
      .eq('profile_id', session.user.id);

    if (error) throw new Error(error.message);

    revalidatePath('/messages');
    return ok(undefined, archived ? 'השיחה הועברה לארכיון' : 'השיחה הוחזרה');
  });
}
