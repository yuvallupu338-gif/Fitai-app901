'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Flag, MessageSquare, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { ReportDialog } from '@/components/shared/report-dialog';
import { formatRelativeTime } from '@/lib/format';
import { addCommentAction, deleteCommentAction } from '@/lib/actions/posts';
import { useRealtime } from '@/hooks/use-realtime';

type Comment = {
  id: string;
  body: string;
  created_at: string;
  parent_id: string | null;
  profile_id: string;
  profiles: { id: string; username: string; full_name: string; avatar_url: string | null } | null;
};

/** תגובות לפוסט – נשמרות למסד ומתעדכנות בזמן אמת. */
export function CommentsSection({
  postId,
  initialComments,
  currentUserId,
  postAuthorId,
}: {
  postId: string;
  initialComments: Comment[];
  currentUserId: string | null;
  postAuthorId: string;
}) {
  const router = useRouter();
  const [comments, setComments] = React.useState(initialComments);
  const [body, setBody] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [reportTarget, setReportTarget] = React.useState<string | null>(null);

  React.useEffect(() => setComments(initialComments), [initialComments]);

  // תגובה חדשה של משתמש אחר מופיעה מיד.
  useRealtime<{ id: string; post_id: string }>(
    { table: 'post_comments', event: 'INSERT', filter: `post_id=eq.${postId}` },
    (payload) => {
      const incoming = payload.new as { id: string; profile_id?: string } | null;
      if (!incoming || incoming.profile_id === currentUserId) return;
      router.refresh();
    },
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUserId) {
      toast.error('צריך להתחבר כדי להגיב');
      return;
    }
    if (!body.trim()) return;

    setPending(true);
    const result = await addCommentAction({ postId, body: body.trim(), parentId: null });
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setBody('');
    router.refresh();
  };

  const remove = async (commentId: string) => {
    const result = await deleteCommentAction(commentId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setComments((current) => current.filter((c) => c.id !== commentId));
    toast.success('התגובה נמחקה');
  };

  return (
    <section className="space-y-4" aria-labelledby="comments-heading">
      <h2 id="comments-heading" className="font-semibold">
        תגובות ({comments.length})
      </h2>

      {currentUserId ? (
        <form onSubmit={submit} className="flex gap-2">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="הוספת תגובה…"
            rows={2}
            maxLength={1000}
            className="min-h-11 flex-1"
            aria-label="כתיבת תגובה"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                void submit(event);
              }
            }}
          />
          <Button type="submit" size="icon" loading={pending} disabled={!body.trim()} aria-label="שליחת התגובה">
            <Send className="size-4" aria-hidden />
          </Button>
        </form>
      ) : (
        <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary hover:underline">
            התחברו
          </Link>{' '}
          כדי להגיב על העבודה.
        </p>
      )}

      {comments.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="אין עדיין תגובות"
          description="תהיו הראשונים לכתוב מה דעתכם על העבודה."
        />
      ) : (
        <ul className="space-y-3">
          {comments.map((comment) => {
            const canDelete = currentUserId === comment.profile_id || currentUserId === postAuthorId;

            return (
              <li key={comment.id} className="flex gap-2.5">
                <Link href={`/u/${comment.profiles?.username ?? ''}`} className="shrink-0">
                  <UserAvatar
                    src={comment.profiles?.avatar_url}
                    name={comment.profiles?.full_name ?? 'משתמש'}
                    className="size-9"
                  />
                </Link>

                <div className="min-w-0 flex-1 rounded-2xl bg-muted/60 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/u/${comment.profiles?.username ?? ''}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {comment.profiles?.full_name ?? 'משתמש'}
                    </Link>
                    <time className="text-xs text-muted-foreground" dateTime={comment.created_at}>
                      {formatRelativeTime(comment.created_at)}
                    </time>
                  </div>
                  <p className="mt-0.5 whitespace-pre-line break-words text-sm">{comment.body}</p>
                </div>

                <div className="flex shrink-0 flex-col gap-0.5">
                  {canDelete ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => remove(comment.id)}
                      aria-label="מחיקת התגובה"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  ) : currentUserId ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setReportTarget(comment.id)}
                      aria-label="דיווח על התגובה"
                    >
                      <Flag className="size-4" aria-hidden />
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {reportTarget ? (
        <ReportDialog
          open
          onOpenChange={(open) => !open && setReportTarget(null)}
          targetType="comment"
          targetId={reportTarget}
          title="דיווח על תגובה"
        />
      ) : null}
    </section>
  );
}
