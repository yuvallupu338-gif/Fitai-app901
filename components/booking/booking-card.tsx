'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  CalendarClock,
  Car,
  Check,
  Clock,
  Home,
  MapPin,
  MessageSquare,
  Repeat,
  Star,
  Store,
  X,
} from 'lucide-react';
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
import { BOOKING_STATUS_LABELS, BOOKING_STATUS_TONE, LOCATION_LABELS } from '@/lib/constants';
import { formatDuration, formatFriendlyDateTime, formatPrice, formatUpcoming } from '@/lib/format';
import {
  acceptProposalAction,
  cancelBookingAction,
  rejectBookingAction,
  updateBookingStatusAction,
} from '@/lib/actions/bookings';
import { suggestRecurringAction } from '@/lib/actions/recurring';
import type { BookingStatus } from '@/types/app';

const TONE_VARIANT = {
  neutral: 'neutral',
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
} as const;

export type BookingCardData = {
  id: string;
  status: BookingStatus;
  location_type: 'client_home' | 'studio' | 'event' | 'online';
  scheduled_start: string;
  duration_minutes: number;
  price_amount: number | null;
  travel_fee: number;
  total_price: number;
  notes: string | null;
  address_revealed: boolean;
  series_id: string | null;
  conversation_id: string | null;
  proposed_start: string | null;
  proposed_price: number | null;
  proposed_note: string | null;
  professional_services: { id: string; name: string; duration_minutes: number } | null;
  professional_profiles: {
    id: string;
    business_name: string;
    avatar_url: string | null;
    cancellation_policy: string | null;
    profiles: { id: string; username: string; full_name: string; avatar_url: string | null } | null;
  } | null;
  profiles: { id: string; username: string; full_name: string; avatar_url: string | null } | null;
  service_addresses: {
    id: string;
    label: string;
    street: string;
    house_number: string | null;
    apartment: string | null;
    floor: string | null;
    entrance_code: string | null;
    arrival_notes: string | null;
    has_parking: boolean | null;
    cities: { name: string } | null;
  } | null;
  reviews: { id: string; rating: number } | null;
};

/** כרטיס הזמנה – משמש גם את הלקוח וגם את בעל המקצוע, עם פעולות שונות. */
export function BookingCard({
  booking,
  viewer,
}: {
  booking: BookingCardData;
  viewer: 'client' | 'professional';
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const isClient = viewer === 'client';
  const counterpartName = isClient
    ? booking.professional_profiles?.business_name
    : booking.profiles?.full_name;
  const counterpartUsername = isClient
    ? booking.professional_profiles?.profiles?.username
    : booking.profiles?.username;
  const counterpartAvatar = isClient
    ? (booking.professional_profiles?.avatar_url ?? booking.professional_profiles?.profiles?.avatar_url)
    : booking.profiles?.avatar_url;

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

  const setStatus = (status: BookingStatus) => run(() => updateBookingStatusAction(booking.id, status));

  const address = booking.service_addresses;
  const isUpcoming = new Date(booking.scheduled_start) > new Date();

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
            <Badge variant={TONE_VARIANT[BOOKING_STATUS_TONE[booking.status]]}>
              {BOOKING_STATUS_LABELS[booking.status]}
            </Badge>
            {booking.series_id ? (
              <Badge variant="info">
                <Repeat className="size-3" aria-hidden />
                מפגש קבוע
              </Badge>
            ) : null}
          </div>

          <p className="mt-0.5 text-sm text-muted-foreground">{booking.professional_services?.name}</p>
        </div>

        <p className="shrink-0 text-end">
          <span className="block font-bold text-primary">{formatPrice(Number(booking.total_price))}</span>
          {Number(booking.travel_fee) > 0 ? (
            <span className="block text-xs text-muted-foreground">
              כולל {formatPrice(Number(booking.travel_fee))} נסיעה
            </span>
          ) : null}
        </p>
      </div>

      <dl className="grid gap-1.5 text-sm">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <dd>
            {formatFriendlyDateTime(booking.scheduled_start)}
            {isUpcoming ? (
              <span className="text-muted-foreground"> · {formatUpcoming(booking.scheduled_start)}</span>
            ) : null}
          </dd>
        </div>

        <div className="flex items-center gap-2">
          <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <dd>{formatDuration(booking.duration_minutes)}</dd>
        </div>

        <div className="flex items-start gap-2">
          {booking.location_type === 'client_home' ? (
            <Home className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          ) : booking.location_type === 'studio' ? (
            <Store className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <dd>
            {LOCATION_LABELS[booking.location_type]}
            {address ? (
              <span className="block text-muted-foreground">
                {address.street} {address.house_number}
                {address.apartment ? `, דירה ${address.apartment}` : ''}
                {address.floor ? `, קומה ${address.floor}` : ''}
                {address.cities?.name ? `, ${address.cities.name}` : ''}
              </span>
            ) : booking.location_type === 'client_home' && !booking.address_revealed ? (
              <span className="block text-xs text-muted-foreground">
                🔒 הכתובת המלאה תיחשף לאחר אישור ההזמנה
              </span>
            ) : null}
            {address?.arrival_notes ? (
              <span className="block text-xs text-muted-foreground">{address.arrival_notes}</span>
            ) : null}
            {address?.has_parking ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Car className="size-3" aria-hidden />
                יש חניה
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      {booking.notes ? (
        <p className="rounded-xl bg-muted/60 p-2.5 text-sm">
          <span className="font-medium">הערות הלקוח: </span>
          {booking.notes}
        </p>
      ) : null}

      {booking.status === 'change_proposed' ? (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="font-medium">הוצע שינוי</p>
          {booking.proposed_start ? (
            <p>מועד חדש: {formatFriendlyDateTime(booking.proposed_start)}</p>
          ) : null}
          {booking.proposed_price !== null ? (
            <p>מחיר חדש: {formatPrice(Number(booking.proposed_price))}</p>
          ) : null}
          {booking.proposed_note ? <p className="text-muted-foreground">{booking.proposed_note}</p> : null}

          {isClient ? (
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => run(() => acceptProposalAction(booking.id))} loading={pending}>
                <Check className="size-4" aria-hidden />
                אישור ההצעה
              </Button>
              <CancelButton bookingId={booking.id} onDone={() => router.refresh()} />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* פעולות */}
      <div className="flex flex-wrap items-center gap-2">
        {booking.conversation_id ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/messages/${booking.conversation_id}`}>
              <MessageSquare className="size-4" aria-hidden />
              הודעה
            </Link>
          </Button>
        ) : null}

        <Button variant="ghost" size="sm" asChild>
          <Link href={isClient ? `/dashboard/bookings/${booking.id}` : `/dashboard/pro/bookings/${booking.id}`}>
            פרטים מלאים
          </Link>
        </Button>

        {/* פעולות בעל המקצוע */}
        {!isClient ? (
          <>
            {booking.status === 'pending' ? (
              <>
                <Button size="sm" onClick={() => setStatus('confirmed')} loading={pending}>
                  <Check className="size-4" aria-hidden />
                  אישור
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => run(() => rejectBookingAction(booking.id))}
                  loading={pending}
                >
                  <X className="size-4" aria-hidden />
                  דחייה
                </Button>
              </>
            ) : null}

            {booking.status === 'confirmed' ? (
              <Button size="sm" onClick={() => setStatus('on_the_way')} loading={pending}>
                <Car className="size-4" aria-hidden />
                יוצא לדרך
              </Button>
            ) : null}

            {booking.status === 'on_the_way' ? (
              <Button size="sm" onClick={() => setStatus('arrived')} loading={pending}>
                הגעתי
              </Button>
            ) : null}

            {booking.status === 'arrived' ? (
              <Button size="sm" onClick={() => setStatus('in_progress')} loading={pending}>
                התחלת הטיפול
              </Button>
            ) : null}

            {booking.status === 'in_progress' ? (
              <Button size="sm" onClick={() => setStatus('completed')} loading={pending}>
                סיום הטיפול
              </Button>
            ) : null}

            {booking.status === 'completed' && !booking.series_id ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => run(() => suggestRecurringAction(booking.id))}
                loading={pending}
              >
                <Repeat className="size-4" aria-hidden />
                הצע טיפול קבוע
              </Button>
            ) : null}
          </>
        ) : null}

        {/* פעולות הלקוח */}
        {isClient && booking.status === 'completed' && !booking.reviews ? (
          <Button size="sm" asChild>
            <Link href={`/dashboard/bookings/${booking.id}?review=1`}>
              <Star className="size-4" aria-hidden />
              כתיבת ביקורת
            </Link>
          </Button>
        ) : null}

        {['pending', 'confirmed', 'change_proposed'].includes(booking.status) ? (
          <CancelButton bookingId={booking.id} onDone={() => router.refresh()} />
        ) : null}
      </div>
    </article>
  );
}

function CancelButton({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const [pending, setPending] = React.useState(false);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10">
          ביטול
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>לבטל את ההזמנה?</AlertDialogTitle>
        <AlertDialogDescription>
          הצד השני יקבל התראה על הביטול. שימו לב למדיניות הביטול של בעל המקצוע.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogAction
            onClick={async (event) => {
              event.preventDefault();
              setPending(true);
              const result = await cancelBookingAction({ bookingId, reason: null });
              setPending(false);
              if (result.ok) {
                toast.success('ההזמנה בוטלה');
                onDone();
              } else {
                toast.error(result.error);
              }
            }}
          >
            {pending ? 'מבטל…' : 'כן, בטל'}
          </AlertDialogAction>
          <AlertDialogCancel>השאר את ההזמנה</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
