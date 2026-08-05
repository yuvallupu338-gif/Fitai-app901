'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarOff, CalendarPlus, ChevronLeft, ChevronRight, Coffee, Plane, Trash2 } from 'lucide-react';
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
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { WEEKDAYS, BOOKING_STATUS_LABELS } from '@/lib/constants';
import {
  formatDate,
  formatDateLong,
  formatTime,
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
  toLocalDateString,
} from '@/lib/format';
import { deleteBlockedDateAction, saveBlockedDateAction } from '@/lib/actions/professional';
import type { BookingStatus } from '@/types/app';

type ScheduleBooking = {
  id: string;
  status: BookingStatus;
  scheduled_start: string;
  scheduled_end: string;
  duration_minutes: number;
  buffer_minutes: number;
  location_type: string;
  series_id: string | null;
  professional_services: { name: string } | null;
  profiles: { id: string; username: string; full_name: string; avatar_url: string | null } | null;
  service_addresses: { label: string; street: string; house_number: string | null; cities: { name: string } | null } | null;
};

type Blocked = { id: string; start_at: string; end_at: string; reason: string | null; is_vacation: boolean };

const DAYS_IN_VIEW = 7;

/** יומן בעל המקצוע: הזמנות, חסימות, הפסקות וחופשות. */
export function ScheduleView({
  bookings,
  blocked,
  availability,
}: {
  bookings: ScheduleBooking[];
  blocked: Blocked[];
  availability: Array<{ weekday: number; start_time: string; end_time: string; is_break: boolean }>;
}) {
  const router = useRouter();
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [blockOpen, setBlockOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [blockForm, setBlockForm] = React.useState(() => {
    // ברירת המחדל מתחילה בשעה העגולה הקרובה כדי שלא ייווצר חסימה בעבר.
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);

    return {
      startAt: toDateTimeLocalValue(start),
      endAt: toDateTimeLocalValue(end),
      reason: '',
      isVacation: false,
    };
  });

  const days = React.useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + weekOffset * DAYS_IN_VIEW);
    return Array.from({ length: DAYS_IN_VIEW }, (_, index) => new Date(start.getTime() + index * 86_400_000));
  }, [weekOffset]);

  const bookingsByDay = React.useMemo(() => {
    const map = new Map<string, ScheduleBooking[]>();
    for (const booking of bookings) {
      const key = toLocalDateString(booking.scheduled_start);
      map.set(key, [...(map.get(key) ?? []), booking]);
    }
    return map;
  }, [bookings]);

  const saveBlock = async () => {
    setPending(true);
    const result = await saveBlockedDateAction({
      ...blockForm,
      startAt: fromDateTimeLocalValue(blockForm.startAt),
      endAt: fromDateTimeLocalValue(blockForm.endAt),
    });
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(result.message ?? 'נשמר');
    setBlockOpen(false);
    router.refresh();
  };

  const removeBlock = async (id: string) => {
    const result = await deleteBlockedDateAction(id);
    if (result.ok) {
      toast.success('החסימה הוסרה');
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setWeekOffset((o) => o - 1)}
            aria-label="שבוע קודם"
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          <span className="text-sm font-medium">
            {formatDate(days[0])} – {formatDate(days[days.length - 1])}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setWeekOffset((o) => o + 1)}
            aria-label="שבוע הבא"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
        </div>

        <Button size="sm" onClick={() => setBlockOpen(true)}>
          <CalendarOff className="size-4" aria-hidden />
          חסימת זמן
        </Button>
      </div>

      <div className="space-y-3">
        {days.map((day) => {
          const key = toLocalDateString(day);
          const dayBookings = (bookingsByDay.get(key) ?? []).sort(
            (a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime(),
          );
          const weekday = day.getDay();
          const windows = availability.filter((a) => a.weekday === weekday && !a.is_break);
          const breaks = availability.filter((a) => a.weekday === weekday && a.is_break);
          const dayBlocks = blocked.filter((b) => {
            const start = new Date(b.start_at);
            const end = new Date(b.end_at);
            return start <= new Date(`${key}T23:59:59`) && end >= new Date(`${key}T00:00:00`);
          });

          const isToday = key === toLocalDateString(new Date());

          return (
            <section
              key={key}
              className={cn('surface p-4', isToday && 'border-primary/40 bg-primary/5')}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="font-semibold">
                  {WEEKDAYS[weekday].long} · {formatDateLong(day)}
                  {isToday ? <Badge variant="default" className="ms-2">היום</Badge> : null}
                </h2>
                <span className="text-xs text-muted-foreground" dir="ltr">
                  {windows.length > 0
                    ? windows.map((w) => `${w.start_time.slice(0, 5)}–${w.end_time.slice(0, 5)}`).join(', ')
                    : ''}
                </span>
              </div>

              {dayBlocks.length > 0 ? (
                <ul className="mb-2 space-y-1">
                  {dayBlocks.map((block) => (
                    <li
                      key={block.id}
                      className="flex items-center gap-2 rounded-lg bg-destructive/8 px-3 py-2 text-sm text-destructive"
                    >
                      {block.is_vacation ? (
                        <Plane className="size-4" aria-hidden />
                      ) : (
                        <CalendarOff className="size-4" aria-hidden />
                      )}
                      <span className="flex-1">
                        {block.is_vacation ? 'חופשה' : 'זמן חסום'}
                        {block.reason ? ` · ${block.reason}` : ''}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeBlock(block.id)}
                        aria-label="הסרת החסימה"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {breaks.length > 0 ? (
                <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Coffee className="size-3.5" aria-hidden />
                  הפסקה:{' '}
                  <span dir="ltr">
                    {breaks.map((b) => `${b.start_time.slice(0, 5)}–${b.end_time.slice(0, 5)}`).join(', ')}
                  </span>
                </p>
              ) : null}

              {dayBookings.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {windows.length === 0 ? 'יום סגור' : 'אין הזמנות'}
                </p>
              ) : (
                <ul className="space-y-2">
                  {dayBookings.map((booking) => (
                    <li key={booking.id}>
                      <Link
                        href={`/dashboard/bookings/${booking.id}`}
                        className="flex items-center gap-3 rounded-xl border border-border p-2.5 transition-colors hover:bg-muted/60"
                      >
                        <span className="w-12 shrink-0 text-center">
                          <span className="block text-sm font-bold ltr-nums">
                            {formatTime(booking.scheduled_start)}
                          </span>
                          <span className="block text-[10px] text-muted-foreground">
                            {booking.duration_minutes} דק׳
                          </span>
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {booking.profiles?.full_name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {booking.professional_services?.name}
                            {booking.service_addresses
                              ? ` · ${booking.service_addresses.street} ${booking.service_addresses.house_number ?? ''}${
                                  booking.service_addresses.cities?.name
                                    ? `, ${booking.service_addresses.cities.name}`
                                    : ''
                                }`
                              : ''}
                          </span>
                        </span>

                        <Badge variant={booking.status === 'pending' ? 'warning' : 'success'}>
                          {BOOKING_STATUS_LABELS[booking.status]}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {bookings.length === 0 && blocked.length === 0 ? (
        <EmptyState
          icon={CalendarPlus}
          title="היומן ריק"
          description="ברגע שתקבלו הזמנות הן יופיעו כאן לפי יום ושעה, כולל זמן נסיעה והפסקות."
        />
      ) : null}

      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>חסימת זמן ביומן</DialogTitle>
            <DialogDescription>
              בזמן החסום לא ניתן יהיה להזמין אתכם. אפשר לחסום כמה שעות או לצאת לחופשה של כמה ימים.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="blockStart">מתאריך ושעה</Label>
              <Input
                id="blockStart"
                type="datetime-local"
                value={blockForm.startAt}
                onChange={(event) => setBlockForm((f) => ({ ...f, startAt: event.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="blockEnd">עד תאריך ושעה</Label>
              <Input
                id="blockEnd"
                type="datetime-local"
                value={blockForm.endAt}
                onChange={(event) => setBlockForm((f) => ({ ...f, endAt: event.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="blockReason">סיבה (רשות)</Label>
              <Input
                id="blockReason"
                value={blockForm.reason}
                onChange={(event) => setBlockForm((f) => ({ ...f, reason: event.target.value }))}
                placeholder="לדוגמה: השתלמות מקצועית"
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="isVacation"
                checked={blockForm.isVacation}
                onCheckedChange={(checked) => setBlockForm((f) => ({ ...f, isVacation: checked === true }))}
              />
              <Label htmlFor="isVacation" className="cursor-pointer font-normal">
                זו חופשה
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={saveBlock} loading={pending}>
              שמירה
            </Button>
            <Button variant="outline" onClick={() => setBlockOpen(false)}>
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
