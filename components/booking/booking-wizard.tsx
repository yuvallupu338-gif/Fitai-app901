'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Home,
  Loader2,
  MapPin,
  Repeat,
  Store,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { UserAvatar } from '@/components/ui/avatar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AddressDialog } from '@/components/booking/address-dialog';
import { SlotPicker } from '@/components/booking/slot-picker';
import { cn } from '@/lib/utils';
import { LOCATION_LABELS } from '@/lib/constants';
import { formatDuration, formatFriendlyDateTime, formatPrice, formatServicePrice } from '@/lib/format';
import { createBookingAction } from '@/lib/actions/bookings';
import type { City, LocationType } from '@/types/app';
import type { SessionUser } from '@/lib/auth/session';
import type { Tables } from '@/types/database';

type Professional = {
  id: string;
  business_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  accepts_home_visits: boolean;
  accepts_studio: boolean;
  accepts_events: boolean;
  accepts_online: boolean;
  travel_fee: number;
  travel_fee_type: string;
  cancellation_policy: string | null;
  min_lead_time_minutes: number;
  profiles: { id: string; username: string; full_name: string; avatar_url: string | null } | null;
  cities: { id: string; name: string } | null;
};

type Address = Tables<'service_addresses'> & { cities: { id: string; name: string } | null };

const STEPS = ['שירות', 'מיקום', 'מועד', 'פרטים', 'סיכום'] as const;

export function BookingWizard({
  professional,
  services,
  addresses,
  cities,
  preselectedServiceId,
  sourcePostId,
  user,
}: {
  professional: Professional;
  services: Tables<'professional_services'>[];
  addresses: Address[];
  cities: City[];
  preselectedServiceId: string | null;
  sourcePostId: string | null;
  user: SessionUser;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(preselectedServiceId ? 1 : 0);
  const [submitting, setSubmitting] = React.useState(false);
  const [addressDialogOpen, setAddressDialogOpen] = React.useState(false);

  const [serviceId, setServiceId] = React.useState(preselectedServiceId ?? services[0]?.id ?? '');
  const [locationType, setLocationType] = React.useState<LocationType>(
    professional.accepts_home_visits ? 'client_home' : professional.accepts_studio ? 'studio' : 'event',
  );
  const [scheduledStart, setScheduledStart] = React.useState<string | null>(null);
  const [addressId, setAddressId] = React.useState<string | null>(
    addresses.find((a) => a.is_default)?.id ?? addresses[0]?.id ?? null,
  );
  const [eventAddress, setEventAddress] = React.useState('');
  const [peopleCount, setPeopleCount] = React.useState(1);
  const [notes, setNotes] = React.useState('');
  const [inspirationUrl, setInspirationUrl] = React.useState('');
  const [shareWithContact, setShareWithContact] = React.useState('');
  const [acceptPolicy, setAcceptPolicy] = React.useState(false);

  const service = services.find((s) => s.id === serviceId) ?? null;

  const availableLocations = React.useMemo(() => {
    const options: LocationType[] = [];
    if (professional.accepts_home_visits && service?.at_client_home) options.push('client_home');
    if (professional.accepts_studio && service?.at_studio) options.push('studio');
    if (professional.accepts_events && service?.at_event) options.push('event');
    if (professional.accepts_online) options.push('online');
    return options;
  }, [professional, service]);

  React.useEffect(() => {
    if (availableLocations.length > 0 && !availableLocations.includes(locationType)) {
      setLocationType(availableLocations[0]);
    }
  }, [availableLocations, locationType]);

  const travelFee =
    locationType === 'client_home' && professional.travel_fee_type !== 'none'
      ? Number(professional.travel_fee)
      : 0;

  const basePrice = service && service.price_type !== 'on_request' ? Number(service.price_min ?? 0) : null;
  const totalPrice = basePrice !== null ? basePrice + travelFee : null;

  const selectedAddress = addresses.find((a) => a.id === addressId) ?? null;

  const needsGuardian = user.isMinor && !user.guardianApproved && locationType === 'client_home';

  const canContinue = () => {
    if (step === 0) return Boolean(serviceId);
    if (step === 1) {
      if (locationType === 'client_home') return Boolean(addressId);
      if (locationType === 'event') return eventAddress.trim().length > 3;
      return true;
    }
    if (step === 2) return Boolean(scheduledStart);
    if (step === 3) return !needsGuardian;
    return acceptPolicy;
  };

  const submit = async () => {
    if (!service || !scheduledStart) return;

    setSubmitting(true);
    const result = await createBookingAction({
      professionalId: professional.id,
      serviceId: service.id,
      locationType,
      scheduledStart,
      addressId: locationType === 'client_home' ? addressId : null,
      eventAddress: locationType === 'event' ? eventAddress : null,
      peopleCount,
      notes: notes || null,
      inspirationUrl: inspirationUrl || null,
      sourcePostId,
      shareWithContact: shareWithContact || null,
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(result.message ?? 'הבקשה נשלחה');
    router.push(`/dashboard/bookings/${result.data.id}`);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {/* כותרת */}
      <header className="surface flex items-center gap-3 p-4">
        <UserAvatar
          src={professional.avatar_url ?? professional.profiles?.avatar_url}
          name={professional.business_name}
          className="size-12"
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 font-semibold">
            <span className="truncate">{professional.business_name}</span>
            {professional.is_verified ? <BadgeCheck className="size-4 text-primary" aria-label="מאומת" /> : null}
          </p>
          <p className="text-xs text-muted-foreground">{professional.cities?.name}</p>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/u/${professional.profiles?.username ?? ''}`}>לפרופיל</Link>
        </Button>
      </header>

      {/* מד התקדמות */}
      <ol className="flex items-center gap-1" aria-label="שלבי ההזמנה">
        {STEPS.map((label, index) => (
          <li key={label} className="flex flex-1 items-center gap-1">
            <button
              type="button"
              onClick={() => index < step && setStep(index)}
              disabled={index > step}
              aria-current={index === step ? 'step' : undefined}
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors',
                index < step
                  ? 'bg-success text-success-foreground'
                  : index === step
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {index < step ? <Check className="size-3.5" aria-hidden /> : index + 1}
            </button>
            {index < STEPS.length - 1 ? (
              <span className={cn('h-0.5 flex-1 rounded', index < step ? 'bg-success' : 'bg-muted')} />
            ) : null}
          </li>
        ))}
      </ol>
      <p className="text-center text-sm font-medium">{STEPS[step]}</p>

      {/* שלב 0 – שירות */}
      {step === 0 ? (
        <section className="space-y-2">
          {services.length === 0 ? (
            <p className="surface p-6 text-center text-sm text-muted-foreground">
              לבעל המקצוע אין עדיין שירותים פעילים.
            </p>
          ) : (
            <RadioGroup value={serviceId} onValueChange={setServiceId} className="gap-2">
              {services.map((item) => (
                <label
                  key={item.id}
                  className={cn(
                    'surface flex cursor-pointer items-start gap-3 p-4 transition-colors',
                    serviceId === item.id && 'border-primary bg-primary/5',
                  )}
                >
                  <RadioGroupItem value={item.id} id={`service-${item.id}`} className="mt-1" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.name}</p>
                    {item.description ? (
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant="outline">
                        <Clock className="size-3" aria-hidden />
                        {formatDuration(item.duration_minutes)}
                      </Badge>
                      {item.supports_recurring ? (
                        <Badge variant="info">
                          <Repeat className="size-3" aria-hidden />
                          אפשר קבוע
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <p className="shrink-0 font-bold text-primary">
                    {formatServicePrice(
                      item.price_type,
                      item.price_min !== null ? Number(item.price_min) : null,
                      item.price_max !== null ? Number(item.price_max) : null,
                    )}
                  </p>
                </label>
              ))}
            </RadioGroup>
          )}

          {service?.supports_recurring ? (
            <Button variant="outline" block asChild>
              <Link href={`/book/recurring?professional=${professional.id}&service=${service.id}`}>
                <Repeat className="size-4" aria-hidden />
                אני רוצה מפגש קבוע במקום חד־פעמי
              </Link>
            </Button>
          ) : null}
        </section>
      ) : null}

      {/* שלב 1 – מיקום */}
      {step === 1 ? (
        <section className="space-y-3">
          <RadioGroup
            value={locationType}
            onValueChange={(value) => setLocationType(value as LocationType)}
            className="gap-2"
          >
            {availableLocations.map((option) => (
              <label
                key={option}
                className={cn(
                  'surface flex cursor-pointer items-center gap-3 p-4',
                  locationType === option && 'border-primary bg-primary/5',
                )}
              >
                <RadioGroupItem value={option} id={`loc-${option}`} />
                <span className="flex items-center gap-2 font-medium">
                  {option === 'client_home' ? (
                    <Home className="size-4" aria-hidden />
                  ) : option === 'studio' ? (
                    <Store className="size-4" aria-hidden />
                  ) : (
                    <MapPin className="size-4" aria-hidden />
                  )}
                  {LOCATION_LABELS[option]}
                </span>
                {option === 'client_home' && travelFee > 0 ? (
                  <Badge variant="neutral" className="ms-auto">
                    +{formatPrice(travelFee)} נסיעה
                  </Badge>
                ) : null}
              </label>
            ))}
          </RadioGroup>

          {locationType === 'client_home' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">כתובת מלאה</h3>
                <Button variant="ghost" size="sm" onClick={() => setAddressDialogOpen(true)}>
                  הוספת כתובת
                </Button>
              </div>

              {addresses.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  עדיין אין כתובת שמורה. הוסיפו כתובת כדי להמשיך.
                </p>
              ) : (
                <RadioGroup value={addressId ?? ''} onValueChange={setAddressId} className="gap-2">
                  {addresses.map((address) => (
                    <label
                      key={address.id}
                      className={cn(
                        'surface flex cursor-pointer items-start gap-3 p-3',
                        addressId === address.id && 'border-primary bg-primary/5',
                      )}
                    >
                      <RadioGroupItem value={address.id} id={`addr-${address.id}`} className="mt-1" />
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="block font-medium">{address.label}</span>
                        <span className="block text-muted-foreground">
                          {address.street} {address.house_number}
                          {address.apartment ? `, דירה ${address.apartment}` : ''}
                          {address.cities?.name ? `, ${address.cities.name}` : ''}
                        </span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              )}

              <p className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
                🔒 הכתובת המלאה אינה מופיעה בפרופיל הציבורי ותיחשף לבעל המקצוע רק לאחר שיאשר את ההזמנה.
              </p>
            </div>
          ) : null}

          {locationType === 'event' ? (
            <Field label="כתובת האירוע" htmlFor="eventAddress" required>
              <Input
                id="eventAddress"
                value={eventAddress}
                onChange={(event) => setEventAddress(event.target.value)}
                placeholder="אולם, רחוב, עיר"
              />
            </Field>
          ) : null}
        </section>
      ) : null}

      {/* שלב 2 – מועד */}
      {step === 2 && service ? (
        <SlotPicker
          professionalId={professional.id}
          serviceId={service.id}
          value={scheduledStart}
          onChange={setScheduledStart}
          minLeadMinutes={professional.min_lead_time_minutes}
        />
      ) : null}

      {/* שלב 3 – פרטים */}
      {step === 3 ? (
        <section className="surface space-y-4 p-4">
          <Field label="מספר האנשים" htmlFor="peopleCount">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" aria-hidden />
              <Input
                id="peopleCount"
                type="number"
                min={1}
                max={50}
                value={peopleCount}
                onChange={(event) => setPeopleCount(Number(event.target.value))}
                className="w-24"
              />
            </div>
          </Field>

          <Field label="הערות לבעל המקצוע" htmlFor="notes">
            <Textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="לדוגמה: השיער שלי צבוע, יש לי אלרגיה ל…"
            />
          </Field>

          <Field label="קישור לתמונת השראה" htmlFor="inspiration" hint="אפשר גם לשלוח תמונה בצ׳אט לאחר האישור">
            <Input
              id="inspiration"
              type="url"
              dir="ltr"
              value={inspirationUrl}
              onChange={(event) => setInspirationUrl(event.target.value)}
              placeholder="https://"
            />
          </Field>

          {locationType === 'client_home' ? (
            <Field
              label="שיתוף פרטי ההזמנה עם איש קשר"
              htmlFor="shareContact"
              hint="לבטיחות: אפשר לרשום שם וטלפון של מישהו שיֵדע על המפגש."
            >
              <Input
                id="shareContact"
                value={shareWithContact}
                onChange={(event) => setShareWithContact(event.target.value)}
                placeholder="לדוגמה: אמא – 050-0000000"
              />
            </Field>
          ) : null}

          {needsGuardian ? (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/8 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              <div>
                <p className="font-medium text-destructive">נדרש אישור הורה או אחראי</p>
                <p className="mt-1 text-muted-foreground">
                  הזמנת בעל מקצוע לבית עבור משתמש מתחת לגיל 18 מחייבת אישור. אפשר להוסיף אותו בהגדרות.
                </p>
                <Button size="sm" variant="outline" className="mt-2" asChild>
                  <Link href="/settings/safety">הוספת אישור הורה</Link>
                </Button>
              </div>
            </div>
          ) : null}

          {locationType === 'client_home' ? (
            <div className="rounded-xl bg-warning/10 p-3 text-xs leading-relaxed">
              <strong className="font-semibold">בטיחות במפגש ביתי:</strong> ודאו שהפרופיל של בעל המקצוע כולל
              עבודות וביקורות, שמרו על תקשורת בתוך האפליקציה, ועדכנו מישהו קרוב על המפגש.
            </div>
          ) : null}
        </section>
      ) : null}

      {/* שלב 4 – סיכום */}
      {step === 4 && service && scheduledStart ? (
        <section className="surface space-y-3 p-4">
          <h2 className="font-semibold">סיכום ההזמנה</h2>

          <dl className="space-y-2 text-sm">
            <Row label="בעל המקצוע" value={professional.business_name} />
            <Row label="השירות" value={service.name} />
            <Row label="משך משוער" value={formatDuration(service.duration_minutes)} />
            <Row
              label="מועד"
              value={
                <span className="flex items-center gap-1">
                  <CalendarDays className="size-4" aria-hidden />
                  {formatFriendlyDateTime(scheduledStart)}
                </span>
              }
            />
            <Row label="מיקום" value={LOCATION_LABELS[locationType]} />
            {locationType === 'client_home' && selectedAddress ? (
              <Row
                label="כתובת"
                value={`${selectedAddress.street} ${selectedAddress.house_number ?? ''}${
                  selectedAddress.cities?.name ? `, ${selectedAddress.cities.name}` : ''
                }`}
              />
            ) : null}
            {locationType === 'event' ? <Row label="כתובת האירוע" value={eventAddress} /> : null}
            <Row label="מספר אנשים" value={String(peopleCount)} />

            <div className="my-2 border-t border-border" />

            <Row
              label="מחיר השירות"
              value={
                basePrice !== null ? formatPrice(basePrice) : 'ייקבע בשיחה עם בעל המקצוע'
              }
            />
            {travelFee > 0 ? <Row label="תוספת נסיעה" value={formatPrice(travelFee)} /> : null}
            <div className="flex items-center justify-between pt-1 text-base font-bold">
              <dt>סה״כ משוער</dt>
              <dd className="text-primary">
                {totalPrice !== null ? formatPrice(totalPrice) : 'לפי פנייה'}
              </dd>
            </div>
          </dl>

          {professional.cancellation_policy ? (
            <div className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
              <strong className="font-medium text-foreground">מדיניות ביטול: </strong>
              {professional.cancellation_policy}
            </div>
          ) : null}

          <div className="flex items-start gap-2">
            <Checkbox
              id="acceptPolicy"
              checked={acceptPolicy}
              onCheckedChange={(checked) => setAcceptPolicy(checked === true)}
            />
            <Label htmlFor="acceptPolicy" className="cursor-pointer text-sm font-normal">
              קראתי ואני מאשר/ת את פרטי ההזמנה ואת מדיניות הביטול
            </Label>
          </div>

          <p className="text-xs text-muted-foreground">
            ההזמנה נשלחת לאישור בעל המקצוע. תקבלו התראה ברגע שהוא יאשר, יציע מועד אחר או יידחה.
          </p>
        </section>
      ) : null}

      {/* ניווט */}
      <div className="flex gap-2">
        {step > 0 ? (
          <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
            <ChevronRight className="size-4" aria-hidden />
            חזרה
          </Button>
        ) : null}

        {step < STEPS.length - 1 ? (
          <Button block size="lg" onClick={() => setStep((s) => s + 1)} disabled={!canContinue()}>
            המשך
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button block size="lg" onClick={submit} disabled={!canContinue() || submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            שליחת בקשת ההזמנה
          </Button>
        )}
      </div>

      <AddressDialog
        open={addressDialogOpen}
        onOpenChange={setAddressDialogOpen}
        cities={cities}
        onSaved={(id) => {
          setAddressId(id);
          router.refresh();
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-end font-medium">{value}</dd>
    </div>
  );
}
