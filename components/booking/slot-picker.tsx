'use client';

import * as React from 'react';
import { CalendarOff, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDate, toLocalDateString, toLocalTimeString } from '@/lib/format';
import { getAvailableSlotsAction } from '@/lib/actions/bookings';
import { WEEKDAYS } from '@/lib/constants';

const DAYS_IN_VIEW = 14;

/**
 * בחירת מועד – המשבצות מגיעות מהמסד ומביאות בחשבון שעות פעילות,
 * הפסקות, חופשות, הזמנות קיימות וזמן התארגנות.
 */
export function SlotPicker({
  professionalId,
  serviceId,
  value,
  onChange,
  minLeadMinutes,
}: {
  professionalId: string;
  serviceId: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  minLeadMinutes: number;
}) {
  const [offset, setOffset] = React.useState(0);
  const [selectedDate, setSelectedDate] = React.useState(() => toLocalDateString(new Date()));
  const [slots, setSlots] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);

  const days = React.useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: DAYS_IN_VIEW }, (_, index) => {
      const date = new Date(start.getTime() + (offset * DAYS_IN_VIEW + index) * 86_400_000);
      return date;
    });
  }, [offset]);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setSlots([]);

    void (async () => {
      const result = await getAvailableSlotsAction(professionalId, serviceId, selectedDate);
      if (!active) return;
      setSlots(result.ok ? result.data : []);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [professionalId, serviceId, selectedDate]);

  return (
    <section className="space-y-3">
      <div className="surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            disabled={offset === 0}
            aria-label="שבועיים קודמים"
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          <p className="text-sm font-medium">
            {formatDate(days[0])} – {formatDate(days[days.length - 1])}
          </p>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOffset((o) => o + 1)}
            aria-label="שבועיים הבאים"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
        </div>

        <div className="scroll-x">
          {days.map((day) => {
            const dateString = toLocalDateString(day);
            const isSelected = dateString === selectedDate;
            const weekday = WEEKDAYS[day.getDay()];

            return (
              <button
                key={dateString}
                type="button"
                onClick={() => {
                  setSelectedDate(dateString);
                  onChange(null);
                }}
                aria-pressed={isSelected}
                className={cn(
                  'flex w-14 shrink-0 snap-start flex-col items-center gap-0.5 rounded-xl border px-2 py-2 transition-colors',
                  isSelected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:bg-muted',
                )}
              >
                <span className="text-[11px]">{weekday.short}</span>
                <span className="text-lg font-bold leading-none">{day.getDate()}</span>
                <span className="text-[10px] opacity-70">
                  {day.toLocaleDateString('he-IL', { month: 'short' })}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="surface min-h-32 p-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            בודק זמינות…
          </div>
        ) : slots.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CalendarOff className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">אין שעות פנויות ביום הזה</p>
            <p className="text-xs text-muted-foreground">
              אפשר לבחור תאריך אחר. שימו לב שנדרשת הזמנה לפחות{' '}
              {minLeadMinutes >= 60 ? `${Math.round(minLeadMinutes / 60)} שעות` : `${minLeadMinutes} דקות`} מראש.
            </p>
          </div>
        ) : (
          <>
            <p className="mb-2 text-sm font-medium">שעות פנויות</p>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((slot) => (
                <li key={slot}>
                  <button
                    type="button"
                    onClick={() => onChange(slot)}
                    aria-pressed={value === slot}
                    className={cn(
                      'w-full rounded-xl border px-2 py-2.5 text-sm font-medium transition-colors',
                      value === slot
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:border-primary hover:bg-primary/5',
                    )}
                  >
                    {toLocalTimeString(slot)}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
