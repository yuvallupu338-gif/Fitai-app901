'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowRight,
  BadgeCheck,
  Ban,
  BellOff,
  Bell,
  CalendarPlus,
  Check,
  CheckCheck,
  Flag,
  ImagePlus,
  Loader2,
  MoreVertical,
  Send,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ReportDialog } from '@/components/shared/report-dialog';
import { cn } from '@/lib/utils';
import { formatDate, formatTime } from '@/lib/format';
import { uploadFile } from '@/lib/upload-client';
import {
  deleteMessageAction,
  markConversationReadAction,
  sendMessageAction,
  setConversationMutedAction,
} from '@/lib/actions/messages';
import { toggleBlockUserAction } from '@/lib/actions/social';
import { useRealtime } from '@/hooks/use-realtime';
import type { SessionUser } from '@/lib/auth/session';

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  kind: 'text' | 'image' | 'system';
  body: string | null;
  attachment_url: string | null;
  system_event: unknown;
  booking_id: string | null;
  created_at: string;
  deleted_at: string | null;
  read_at: string | null;
  profiles?: { id: string; username: string; full_name: string; avatar_url: string | null } | null;
};

type OtherProfile = {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  is_professional: boolean;
  last_seen_at: string;
} | null;

/** חדר צ׳אט בזמן אמת. */
export function ChatRoom({
  conversationId,
  initialMessages,
  currentUser,
  other,
  otherProfessional,
  isMuted,
}: {
  conversationId: string;
  initialMessages: Message[];
  currentUser: SessionUser;
  other: OtherProfile;
  otherProfessional: { id: string; business_name: string; avatar_url: string | null; is_verified: boolean } | null;
  isMuted: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = React.useState<Message[]>(initialMessages);
  const [body, setBody] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [muted, setMuted] = React.useState(isMuted);
  const [reportOpen, setReportOpen] = React.useState(false);

  const bottomRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const displayName = otherProfessional?.business_name ?? other?.full_name ?? 'משתמש';

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  /** מוסיף הודעה לרשימה פעם אחת בלבד (מונע כפילות מול אירוע Realtime). */
  const appendMessage = React.useCallback((incoming: Message) => {
    setMessages((current) =>
      current.some((message) => message.id === incoming.id) ? current : [...current, incoming],
    );
  }, []);

  React.useEffect(() => {
    scrollToBottom('auto');
    void markConversationReadAction(conversationId);
  }, [conversationId, scrollToBottom]);

  // הודעות חדשות מגיעות מיד, בלי לרענן את הדף.
  useRealtime<Message>(
    { table: 'messages', event: 'INSERT', filter: `conversation_id=eq.${conversationId}` },
    (payload) => {
      const incoming = payload.new as Message;
      appendMessage(incoming);

      if (incoming.sender_id !== currentUser.id) {
        void markConversationReadAction(conversationId);
      }
      setTimeout(() => scrollToBottom(), 50);
    },
  );

  useRealtime<Message>(
    { table: 'messages', event: 'UPDATE', filter: `conversation_id=eq.${conversationId}` },
    (payload) => {
      const updated = payload.new as Message;
      setMessages((current) => current.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
    },
  );

  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;

    setSending(true);
    setBody('');

    const result = await sendMessageAction({ conversationId, body: text, attachmentUrl: null });
    setSending(false);

    if (!result.ok) {
      toast.error(result.error);
      setBody(text);
      return;
    }

    // מוסיפים מיד ולא מחכים לאירוע Realtime – כך ההודעה מופיעה
    // גם אם החיבור בזמן אמת מתעכב. כפילות נמנעת לפי מזהה ההודעה.
    appendMessage(result.data as Message);
    setTimeout(() => scrollToBottom(), 50);
  };

  const sendImage = async (file: File) => {
    setUploading(true);
    try {
      const uploaded = await uploadFile(file, 'messages');
      const result = await sendMessageAction({
        conversationId,
        body: null,
        attachmentUrl: uploaded.url,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      appendMessage(result.data as Message);
      setTimeout(() => scrollToBottom(), 50);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'שליחת התמונה נכשלה');
    } finally {
      setUploading(false);
    }
  };

  const toggleMute = async () => {
    const next = !muted;
    setMuted(next);
    const result = await setConversationMutedAction(conversationId, next);
    if (!result.ok) {
      setMuted(!next);
      toast.error(result.error);
    } else {
      toast.success(result.message ?? '');
    }
  };

  const blockUser = async () => {
    if (!other) return;
    const result = await toggleBlockUserAction(other.id, true);
    if (result.ok) {
      toast.success('המשתמש נחסם');
      router.push('/messages');
    } else {
      toast.error(result.error);
    }
  };

  // קיבוץ הודעות לפי יום
  const grouped = React.useMemo(() => {
    const groups: Array<{ date: string; items: Message[] }> = [];
    for (const message of messages) {
      const date = formatDate(message.created_at);
      const last = groups[groups.length - 1];
      if (last && last.date === date) last.items.push(message);
      else groups.push({ date, items: [message] });
    }
    return groups;
  }, [messages]);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col lg:h-[calc(100dvh-3.5rem)]">
      {/* כותרת השיחה */}
      <header className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
        <Button variant="ghost" size="icon-sm" asChild aria-label="חזרה לרשימת השיחות">
          <Link href="/messages">
            <ArrowRight className="size-5" aria-hidden />
          </Link>
        </Button>

        <Link href={`/u/${other?.username ?? ''}`} className="flex min-w-0 flex-1 items-center gap-2">
          <UserAvatar
            src={otherProfessional?.avatar_url ?? other?.avatar_url}
            name={displayName}
            className="size-9"
          />
          <span className="min-w-0">
            <span className="flex items-center gap-1 font-medium">
              <span className="truncate">{displayName}</span>
              {otherProfessional?.is_verified ? (
                <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="מאומת" />
              ) : null}
            </span>
            <span className="block truncate text-xs text-muted-foreground" dir="ltr">
              @{other?.username}
            </span>
          </span>
        </Link>

        {otherProfessional ? (
          <Button variant="ghost" size="icon-sm" asChild aria-label="הזמנת טיפול">
            <Link href={`/book/${otherProfessional.id}`}>
              <CalendarPlus className="size-5" aria-hidden />
            </Link>
          </Button>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="אפשרויות שיחה">
              <MoreVertical className="size-5" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={toggleMute}>
              {muted ? <Bell aria-hidden /> : <BellOff aria-hidden />}
              {muted ? 'הפעלת התראות' : 'השתקת השיחה'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setReportOpen(true)}>
              <Flag aria-hidden />
              דיווח
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={blockUser}>
              <Ban aria-hidden />
              חסימת המשתמש
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* הודעות */}
      <div className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            אין עדיין הודעות. אפשר לפתוח בשאלה על השירות או על מועד פנוי.
          </p>
        ) : null}

        {grouped.map((group) => (
          <div key={group.date} className="space-y-2">
            <p className="sticky top-0 z-10 mx-auto w-fit rounded-full bg-muted px-3 py-0.5 text-xs text-muted-foreground">
              {group.date}
            </p>

            {group.items.map((message) => {
              if (message.kind === 'system') {
                return (
                  <p
                    key={message.id}
                    className="mx-auto w-fit rounded-full bg-primary/8 px-3 py-1 text-center text-xs text-primary"
                  >
                    {message.body}
                  </p>
                );
              }

              const mine = message.sender_id === currentUser.id;
              const deleted = Boolean(message.deleted_at);

              return (
                <div key={message.id} className={cn('flex', mine ? 'justify-start' : 'justify-end')}>
                  <div
                    className={cn(
                      'group relative max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-soft',
                      mine
                        ? 'rounded-bl-md bg-primary text-primary-foreground'
                        : 'rounded-br-md bg-card border border-border',
                    )}
                  >
                    {deleted ? (
                      <p className="italic opacity-70">ההודעה נמחקה</p>
                    ) : (
                      <>
                        {message.attachment_url ? (
                          <a
                            href={message.attachment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mb-1 block overflow-hidden rounded-xl"
                          >
                            <Image
                              src={message.attachment_url}
                              alt="תמונה בשיחה"
                              width={280}
                              height={280}
                              className="h-auto w-full max-w-[260px] object-cover"
                            />
                          </a>
                        ) : null}
                        {message.body ? (
                          <p className="whitespace-pre-line break-words">{message.body}</p>
                        ) : null}
                      </>
                    )}

                    <div
                      className={cn(
                        'mt-0.5 flex items-center justify-end gap-1 text-[10px]',
                        mine ? 'text-primary-foreground/70' : 'text-muted-foreground',
                      )}
                    >
                      <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>
                      {mine ? (
                        message.read_at ? (
                          <CheckCheck className="size-3" aria-label="נקרא" />
                        ) : (
                          <Check className="size-3" aria-label="נשלח" />
                        )
                      ) : null}
                    </div>

                    {mine && !deleted ? (
                      <button
                        type="button"
                        onClick={async () => {
                          const result = await deleteMessageAction(message.id);
                          if (result.ok) {
                            setMessages((current) =>
                              current.map((m) =>
                                m.id === message.id
                                  ? { ...m, deleted_at: new Date().toISOString(), body: null, attachment_url: null }
                                  : m,
                              ),
                            );
                          } else {
                            toast.error(result.error);
                          }
                        }}
                        className="absolute -start-8 top-1/2 hidden -translate-y-1/2 rounded-full p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 sm:block"
                        aria-label="מחיקת ההודעה"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* כתיבה */}
      <div className="safe-bottom border-t border-border bg-card p-2">
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label="שליחת תמונה"
          >
            {uploading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ImagePlus className="size-5" aria-hidden />}
          </Button>

          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="כתבו הודעה…"
            rows={1}
            maxLength={4000}
            className="max-h-32 min-h-11 flex-1 resize-none py-2.5"
            aria-label="כתיבת הודעה"
          />

          <Button type="submit" size="icon" disabled={!body.trim() || sending} aria-label="שליחה">
            {sending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Send className="size-5" aria-hidden />}
          </Button>
        </form>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void sendImage(file);
            event.target.value = '';
          }}
        />
      </div>

      {other ? (
        <ReportDialog
          open={reportOpen}
          onOpenChange={setReportOpen}
          targetType="user"
          targetId={other.id}
          title="דיווח על משתמש"
        />
      ) : null}
    </div>
  );
}
