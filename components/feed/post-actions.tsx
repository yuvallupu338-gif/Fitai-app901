'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, Heart, MessageCircle, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCompactNumber } from '@/lib/format';
import { toggleLikeAction, toggleSavePostAction, recordShareAction } from '@/lib/actions/posts';
import { useRealtime } from '@/hooks/use-realtime';

/** שורת הפעולות של פוסט – מתעדכנת בזמן אמת כשמישהו אחר עושה לייק. */
export function PostActions({
  postId,
  likedByMe,
  savedByMe,
  likesCount,
  commentsCount,
  isLoggedIn,
}: {
  postId: string;
  likedByMe: boolean;
  savedByMe: boolean;
  likesCount: number;
  commentsCount: number;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [liked, setLiked] = React.useState(likedByMe);
  const [likes, setLikes] = React.useState(likesCount);
  const [saved, setSaved] = React.useState(savedByMe);

  useRealtime<{ post_id: string }>(
    { table: 'post_likes', event: '*', filter: `post_id=eq.${postId}` },
    (payload) => {
      if (payload.eventType === 'INSERT') setLikes((count) => count + 1);
      if (payload.eventType === 'DELETE') setLikes((count) => Math.max(0, count - 1));
    },
  );

  const requireLogin = () => {
    if (isLoggedIn) return false;
    toast.error('צריך להתחבר', { action: { label: 'התחברות', onClick: () => router.push('/login') } });
    return true;
  };

  const onLike = async () => {
    if (requireLogin()) return;
    const next = !liked;
    setLiked(next);
    const result = await toggleLikeAction(postId, next);
    if (!result.ok) {
      setLiked(!next);
      toast.error(result.error);
    }
  };

  const onSave = async () => {
    if (requireLogin()) return;
    const next = !saved;
    setSaved(next);
    const result = await toggleSavePostAction(postId, next);
    if (!result.ok) {
      setSaved(!next);
      toast.error(result.error);
    } else {
      toast.success(next ? 'הפוסט נשמר' : 'הוסר מהשמורים');
    }
  };

  const onShare = async () => {
    const url = `${window.location.origin}/p/${postId}`;
    try {
      if (navigator.share) await navigator.share({ url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success('הקישור הועתק');
      }
      void recordShareAction(postId);
    } catch {
      /* בוטל */
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={onLike} aria-pressed={liked}>
        <Heart className={cn('size-5', liked && 'fill-destructive text-destructive')} aria-hidden />
        {formatCompactNumber(likes)}
      </Button>

      <Button variant="ghost" size="sm" asChild>
        <a href="#comments">
          <MessageCircle className="size-5" aria-hidden />
          {formatCompactNumber(commentsCount)}
        </a>
      </Button>

      <Button variant="ghost" size="sm" onClick={onShare}>
        <Share2 className="size-5" aria-hidden />
        שיתוף
      </Button>

      <div className="flex-1" />

      <Button variant="ghost" size="icon" onClick={onSave} aria-pressed={saved} aria-label="שמירת הפוסט">
        <Bookmark className={cn('size-5', saved && 'fill-current')} aria-hidden />
      </Button>
    </div>
  );
}
