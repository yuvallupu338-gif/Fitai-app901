'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Zap } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { setQuickAvailabilityAction } from '@/lib/actions/professional';
import { formatTime } from '@/lib/format';

/** מתגי "זמין היום" ו"זמין עכשיו" – משפיעים מיד על החיפוש. */
export function QuickAvailability({
  availableToday,
  availableNow,
  availableNowUntil,
}: {
  availableToday: boolean;
  availableNow: boolean;
  availableNowUntil: string | null;
}) {
  const router = useRouter();
  const [today, setToday] = React.useState(availableToday);
  const [now, setNow] = React.useState(
    availableNow && (!availableNowUntil || new Date(availableNowUntil) > new Date()),
  );
  const [pending, setPending] = React.useState(false);

  const update = async (nextToday: boolean, nextNow: boolean) => {
    setPending(true);
    const result = await setQuickAvailabilityAction(nextToday, nextNow);
    setPending(false);

    if (!result.ok) {
      setToday(availableToday);
      setNow(availableNow);
      toast.error(result.error);
      return;
    }

    toast.success(result.message ?? 'הזמינות עודכנה');
    router.refresh();
  };

  return (
    <section className="surface space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <Zap className="size-4 text-primary" aria-hidden />
        זמינות מהירה
      </h2>

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="available-today" className="cursor-pointer font-normal">
          זמין היום
          <span className="block text-xs text-muted-foreground">מופיע במסנן &quot;זמין היום&quot; בחיפוש</span>
        </Label>
        <Switch
          id="available-today"
          checked={today}
          disabled={pending}
          onCheckedChange={(checked) => {
            setToday(checked);
            void update(checked, now);
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="available-now" className="cursor-pointer font-normal">
          זמין עכשיו
          <span className="block text-xs text-muted-foreground">
            {now && availableNowUntil
              ? `פעיל עד ${formatTime(availableNowUntil)}`
              : 'סימון לשלוש שעות – בולט בחיפוש ובפיד'}
          </span>
        </Label>
        <Switch
          id="available-now"
          checked={now}
          disabled={pending}
          onCheckedChange={(checked) => {
            setNow(checked);
            void update(checked ? true : today, checked);
          }}
        />
      </div>
    </section>
  );
}
