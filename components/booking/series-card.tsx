'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarClock, Check, MapPin, Pause, Play, Repeat, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { FREQUENCY_LABELS, LOCATION_LABELS, SERIES_STATUS_LABELS, WEEKDAYS } from '@/lib/constants';
import { formatPrice } from '@/lib/format';
import { approveSeriesAction, updateSeriesStatusAction } from '@/lib/actions/recurring';
import type { Frequency, LocationType, SeriesStatus } from '@/types/app';

const STATUS_VARIANT: Record<SeriesStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  pending: 'warning',
  active: 'success',
  paused: 'neutral',
  completed: 'info',
  cancelled: 'danger',
};

export type SeriesCardData = {
  id: string;
  status: SeriesStatus;
  frequency: Frequency;
  interval_weeks: number;
  weekday: number;
  start_time: string;
  duration_minutes: number;
  start_date: string;
  end_date: string | null;
  planned_occurrences: number | null;
  price_amount: number | null;
  travel_fee: number;
  notes: string | null;
  location_type: LocationType;
  client_approved_at: string | null;
  professional_approved_at: string | null;
  professional_services: { id: string; name: string; duration_minutes: number } | null;
  professional_profiles: {
    id: string;
    business_name: string;
    avatar_url: string | null;
    profiles: { id: string; username: string; full_name: string; avatar_url: string | null } | null;
  } | null;
  profiles: { id: string; username: string; full_name: string; avatar_url: string | null } | null;
  service_addresses: {
    id: string;
    label: string;
    street: string;
    house_number: string | null;
    cities: { name: string } | null;
  } | null;
};

/** כרטיס סדרה קבועה עם כל פעולות הניהול. */
export function SeriesCard({
  series,
  viewer,
}: {
  series: SeriesCardData;
  viewer: 'client' | 'professional';
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const isClient = viewer === 'client';
  const counterpartName = isClient
    ? series.professional_profiles?.business_name
    : series.profiles?.full_name;
  const counterpartUsername = isClient
    ? series.professional_profiles?.profiles?.username
    : series.profiles?.username;
  const counterpartAvatar = isClient
    ? series.professional_profiles?.avatar_url
    : series.profiles?.avatar_url;

  const run = async (action: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setPending(true);
    const result = await action();
    setPending(false);

    if (!result.ok) {
      toast.error(result.error ?? 'הפעולה נכשלה');
      return;
    }
    toast.success(result.message ?? 'בוצע');
    router.refresh();
  };

  const totalPerMeeting = Number(series.price_amount ?? 0) + Number(series.travel_fee ?? 0);
  const awaitingProfessional = series.status === 'pending' && !series.professional_approved_at;

  return (
    <article className="surface space-y-3 p-4">
      <div className="flex items-start gap-3">
        <Link href={`/u/${counterpartUsername ?? ''}`} className="shrink-0">
          <UserAvatar src={counterpartAvatar} name={counterpartName ?? 'משתמש'} className="size-12" />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/u/${counterpartUsername ?? ''}`} className="font-semibold hover:underline">
              {counterpartName}
            </Link>
            <Badge variant={STATUS_VARIANT[series.status]}>{SERIES_STATUS_LABELS[series.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{series.professional_services?.name}</p>
        </div>

        <p className="shrink-0 text-end font-bold text-primary">
          {series.price_amount !== null ? formatPrice(totalPerMeeting) : 'לפי פנייה'}
        </p>
      </div>

      <dl className="space-y-1.5 text-sm">
        <div className="flex items-center gap-2">
          <Repeat className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <dd>
            {FREQUENCY_LABELS[series.frequency]} · יום {WEEKDAYS[series.weekday].long} בשעה{' '}
            <span className="ltr-nums">{series.start_time.slice(0, 5)}</span>
          </dd>
        </div>

        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <dd>
            מתאריך {new Date(series.start_date).toLocaleDateString('he-IL')}
            {series.planned_occurrences ? ` · ${series.planned_occurrences} מפגשים` : ''}
            {series.end_date ? ` · עד ${new Date(series.end_date).toLocaleDateString('he-IL')}` : ''}
          </dd>
        </div>

        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <dd>
            {LOCATION_LABELS[series.location_type]}
            {series.service_addresses ? (
              <span className="block text-muted-foreground">
                {series.service_addresses.street} {series.service_addresses.house_number}
                {series.service_addresses.cities?.name ? `, ${series.service_addresses.cities.name}` : ''}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      {series.notes ? (
        <p className="rounded-xl bg-muted/60 p-2.5 text-sm">
          <span className="font-medium">הערות קבועות: </span>
          {series.notes}
        </p>
      ) : null}

      {awaitingProfessional ? (
        <p className="rounded-xl bg-warning/10 p-2.5 text-sm">
          {isClient
            ? 'הבקשה נשלחה. הסדרה תיכנס לתוקף רק לאחר אישור בעל המקצוע.'
            : 'הלקוח מבקש לקבוע סדרה קבועה. אישור ייצור את כל המפגשים ביומן.'}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/recurring/${series.id}`}>כל המפגשים</Link>
        </Button>

        {!isClient && awaitingProfessional ? (
          <Button size="sm" onClick={() => run(() => approveSeriesAction(series.id))} loading={pending}>
            <Check className="size-4" aria-hidden />
            אישור הסדרה
          </Button>
        ) : null}

        {series.status === 'active' ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => run(() => updateSeriesStatusAction(series.id, 'paused'))}
            loading={pending}
          >
            <Pause className="size-4" aria-hidden />
            השהיה
          </Button>
        ) : null}

        {series.status === 'paused' ? (
          <Button
            size="sm"
            onClick={() => run(() => updateSeriesStatusAction(series.id, 'active'))}
            loading={pending}
          >
            <Play className="size-4" aria-hidden />
            הפעלה מחדש
          </Button>
        ) : null}

        {['pending', 'active', 'paused'].includes(series.status) ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10">
                <X className="size-4" aria-hidden />
                ביטול הסדרה
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogTitle>לבטל את כל הסדרה?</AlertDialogTitle>
              <AlertDialogDescription>
                כל המפגשים העתידיים שטרם התקיימו יבוטלו. המפגשים שכבר התקיימו יישארו בהיסטוריה.
                הפעולה אינה הפיכה.
              </AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogAction
                  onClick={(event) => {
                    event.preventDefault();
                    void run(() => updateSeriesStatusAction(series.id, 'cancelled'));
                  }}
                >
                  כן, בטל את הסדרה
                </AlertDialogAction>
                <AlertDialogCancel>חזרה</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    </article>
  );
}
