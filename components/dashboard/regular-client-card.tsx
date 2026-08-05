'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarClock, MapPin, MessageSquare, NotebookPen, Pause, Play, Repeat, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { FREQUENCY_LABELS, SERIES_STATUS_LABELS, WEEKDAYS } from '@/lib/constants';
import { formatFriendlyDateTime, formatPrice, formatRelativeTime, pluralize } from '@/lib/format';
import { saveCustomerNoteAction } from '@/lib/actions/professional';
import { updateSeriesStatusAction } from '@/lib/actions/recurring';
import { openConversationAction } from '@/lib/actions/messages';
import type { Frequency, SeriesStatus } from '@/types/app';

/** כרטיס לקוח קבוע – כולל הערות פרטיות שרק בעל המקצוע רואה. */
export function RegularClientCard({
  seriesId,
  clientId,
  clientName,
  clientUsername,
  clientAvatar,
  serviceName,
  frequency,
  weekday,
  startTime,
  priceAmount,
  status,
  address,
  nextBookingAt,
  completedCount,
  notes,
}: {
  seriesId: string;
  clientId: string;
  clientName: string;
  clientUsername: string;
  clientAvatar: string | null;
  serviceName: string;
  frequency: Frequency;
  weekday: number;
  startTime: string;
  priceAmount: number | null;
  status: SeriesStatus;
  address: string | null;
  nextBookingAt: string | null;
  completedCount: number;
  notes: Array<{ id: string; note: string; created_at: string }>;
}) {
  const router = useRouter();
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [noteText, setNoteText] = React.useState('');
  const [pending, setPending] = React.useState(false);

  const saveNote = async () => {
    setPending(true);
    const result = await saveCustomerNoteAction(clientId, noteText);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success('ההערה נשמרה');
    setNoteText('');
    setNoteOpen(false);
    router.refresh();
  };

  const changeStatus = async (next: 'paused' | 'active' | 'cancelled') => {
    const result = await updateSeriesStatusAction(seriesId, next);
    if (result.ok) {
      toast.success(result.message ?? 'עודכן');
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  const message = async () => {
    const result = await openConversationAction(clientId);
    if (result.ok) router.push(`/messages/${result.data.conversationId}`);
    else toast.error(result.error);
  };

  return (
    <article className="surface space-y-3 p-4">
      <div className="flex items-start gap-3">
        <Link href={`/u/${clientUsername}`} className="shrink-0">
          <UserAvatar src={clientAvatar} name={clientName} className="size-12" />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/u/${clientUsername}`} className="font-semibold hover:underline">
              {clientName}
            </Link>
            <Badge variant={status === 'active' ? 'success' : status === 'paused' ? 'neutral' : 'warning'}>
              {SERIES_STATUS_LABELS[status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{serviceName}</p>
        </div>

        {priceAmount !== null ? (
          <p className="shrink-0 font-bold text-primary">{formatPrice(priceAmount)}</p>
        ) : null}
      </div>

      <dl className="space-y-1.5 text-sm">
        <div className="flex items-center gap-2">
          <Repeat className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <dd>
            {FREQUENCY_LABELS[frequency]} · יום {WEEKDAYS[weekday].long} בשעה{' '}
            <span className="ltr-nums">{startTime.slice(0, 5)}</span>
          </dd>
        </div>

        {nextBookingAt ? (
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <dd>המפגש הבא: {formatFriendlyDateTime(nextBookingAt)}</dd>
          </div>
        ) : null}

        {address ? (
          <div className="flex items-center gap-2">
            <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <dd>{address}</dd>
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {pluralize(completedCount, 'מפגש אחד הושלם', 'מפגשים הושלמו', 'עדיין לא היו מפגשים')}
        </p>
      </dl>

      {notes.length > 0 ? (
        <div className="rounded-xl bg-muted/60 p-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">הערות פרטיות (הלקוח אינו רואה)</p>
          <ul className="space-y-1 text-sm">
            {notes.slice(0, 3).map((note) => (
              <li key={note.id}>
                {note.note}
                <span className="ms-1 text-xs text-muted-foreground">({formatRelativeTime(note.created_at)})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {noteOpen ? (
        <div className="space-y-2">
          <Textarea
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            placeholder="לדוגמה: מעדיפה מספריים ולא מכונה, רגישה לריחות חזקים"
            rows={2}
            aria-label="הערה פרטית על הלקוח"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={saveNote} loading={pending} disabled={!noteText.trim()}>
              שמירת ההערה
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNoteOpen(false)}>
              ביטול
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={message}>
          <MessageSquare className="size-4" aria-hidden />
          הודעה
        </Button>

        <Button variant="ghost" size="sm" asChild>
          <Link href={`/dashboard/recurring/${seriesId}`}>
            <CalendarClock className="size-4" aria-hidden />
            שינוי מועד
          </Link>
        </Button>

        {!noteOpen ? (
          <Button variant="ghost" size="sm" onClick={() => setNoteOpen(true)}>
            <NotebookPen className="size-4" aria-hidden />
            הערה פרטית
          </Button>
        ) : null}

        {status === 'active' ? (
          <Button variant="ghost" size="sm" onClick={() => changeStatus('paused')}>
            <Pause className="size-4" aria-hidden />
            השהיה
          </Button>
        ) : status === 'paused' ? (
          <Button variant="ghost" size="sm" onClick={() => changeStatus('active')}>
            <Play className="size-4" aria-hidden />
            הפעלה
          </Button>
        ) : null}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10">
              <X className="size-4" aria-hidden />
              ביטול הסדרה
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>לבטל את הסדרה הקבועה?</AlertDialogTitle>
            <AlertDialogDescription>
              כל המפגשים העתידיים יבוטלו והלקוח יקבל על כך התראה.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  void changeStatus('cancelled');
                }}
              >
                כן, בטל
              </AlertDialogAction>
              <AlertDialogCancel>חזרה</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </article>
  );
}
