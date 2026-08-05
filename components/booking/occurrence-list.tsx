'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarClock, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatFriendlyDateTime, fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/format';
import { moveOccurrenceAction, skipOccurrenceAction } from '@/lib/actions/recurring';
import { cn } from '@/lib/utils';

type Occurrence = {
  id: string;
  sequence: number;
  scheduled_date: string;
  scheduled_start: string;
  status: 'planned' | 'booked' | 'skipped' | 'moved' | 'cancelled' | 'completed';
  note: string | null;
  booking_id: string | null;
};

const STATUS_LABELS: Record<Occurrence['status'], string> = {
  planned: 'מתוכנן',
  booked: 'נקבע ביומן',
  skipped: 'דולג',
  moved: 'הוזז',
  cancelled: 'בוטל',
  completed: 'הושלם',
};

const STATUS_VARIANT: Record<Occurrence['status'], 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  planned: 'neutral',
  booked: 'info',
  skipped: 'warning',
  moved: 'warning',
  cancelled: 'danger',
  completed: 'success',
};

/** רשימת המפגשים בסדרה, עם אפשרות לדלג או להזיז מפגש בודד. */
export function OccurrenceList({
  occurrences,
  seriesStatus,
}: {
  occurrences: Occurrence[];
  seriesStatus: string;
  durationMinutes: number;
}) {
  const router = useRouter();
  const [moveTarget, setMoveTarget] = React.useState<Occurrence | null>(null);
  const [newStart, setNewStart] = React.useState('');
  const [applyToFuture, setApplyToFuture] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const skip = async (occurrence: Occurrence) => {
    const result = await skipOccurrenceAction(occurrence.id);
    if (result.ok) {
      toast.success(result.message ?? 'המפגש דולג');
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  const move = async () => {
    if (!moveTarget || !newStart) return;

    setPending(true);
    const result = await moveOccurrenceAction(moveTarget.id, fromDateTimeLocalValue(newStart), applyToFuture);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(result.message ?? 'המפגש הוזז');
    setMoveTarget(null);
    setApplyToFuture(false);
    router.refresh();
  };

  return (
    <section className="surface p-4">
      <h2 className="mb-3 font-semibold">כל המפגשים בסדרה ({occurrences.length})</h2>

      <ol className="space-y-2">
        {occurrences.map((occurrence) => {
          const isPast = new Date(occurrence.scheduled_start) < new Date();
          const canEdit =
            !isPast &&
            ['planned', 'booked', 'moved'].includes(occurrence.status) &&
            ['pending', 'active', 'paused'].includes(seriesStatus);

          return (
            <li
              key={occurrence.id}
              className={cn(
                'flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm',
                occurrence.status === 'skipped' || occurrence.status === 'cancelled'
                  ? 'border-dashed opacity-60'
                  : 'border-border',
              )}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                {occurrence.sequence}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block font-medium">{formatFriendlyDateTime(occurrence.scheduled_start)}</span>
                {occurrence.note ? (
                  <span className="block text-xs text-muted-foreground">{occurrence.note}</span>
                ) : null}
              </span>

              <Badge variant={STATUS_VARIANT[occurrence.status]}>{STATUS_LABELS[occurrence.status]}</Badge>

              {canEdit ? (
                <span className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="שינוי מועד"
                    onClick={() => {
                      setMoveTarget(occurrence);
                      setNewStart(toDateTimeLocalValue(occurrence.scheduled_start));
                    }}
                  >
                    <CalendarClock className="size-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="דילוג על המפגש"
                    onClick={() => skip(occurrence)}
                  >
                    <SkipForward className="size-4" aria-hidden />
                  </Button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      <Dialog open={Boolean(moveTarget)} onOpenChange={(open) => !open && setMoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>שינוי מועד למפגש {moveTarget?.sequence}</DialogTitle>
            <DialogDescription>
              המערכת תבדוק שהמועד החדש פנוי ביומן של בעל המקצוע.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="newStart">מועד חדש</Label>
              <Input
                id="newStart"
                type="datetime-local"
                value={newStart}
                onChange={(event) => setNewStart(event.target.value)}
              />
            </div>

            <div className="flex items-start gap-2 rounded-xl bg-muted/60 p-3">
              <Checkbox
                id="applyFuture"
                checked={applyToFuture}
                onCheckedChange={(checked) => setApplyToFuture(checked === true)}
              />
              <Label htmlFor="applyFuture" className="cursor-pointer text-sm font-normal">
                לשנות גם את כל המפגשים העתידיים בסדרה
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  ללא סימון – רק המפגש הזה ישתנה, ושאר הסדרה תישאר כפי שהיא.
                </span>
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={move} loading={pending} disabled={!newStart}>
              שמירת המועד
            </Button>
            <Button variant="outline" onClick={() => setMoveTarget(null)}>
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
