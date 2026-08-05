'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BadgeCheck, CalendarCheck, Loader2, Repeat, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/ui/avatar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AddressDialog } from '@/components/booking/address-dialog';
import { cn } from '@/lib/utils';
import { FREQUENCY_LABELS, LOCATION_LABELS, WEEKDAYS } from '@/lib/constants';
import { formatFriendlyDateTime, formatPrice, toLocalDateString } from '@/lib/format';
import { createSeriesAction, previewSeriesDatesAction } from '@/lib/actions/recurring';
import type { City, Frequency, LocationType, SeriesPreviewDate } from '@/types/app';
import type { Tables } from '@/types/database';

type Professional = {
  id: string;
  business_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  accepts_home_visits: boolean;
  accepts_studio: boolean;
  accepts_events: boolean;
  travel_fee: number;
  travel_fee_type: string;
  profiles: { id: string; username: string; full_name: string } | null;
  cities: { id: string; name: string } | null;
};

type Address = Tables<'service_addresses'> & { cities: { id: string; name: string } | null };

/** אשף קביעת מפגשים קבועים – "כל שבועיים ביום חמישי ב־17:00". */
export function RecurringWizard({
  professional,
  services,
  addresses,
  cities,
  preselectedServiceId,
}: {
  professional: Professional;
  services: Tables<'professional_services'>[];
  addresses: Address[];
  cities: City[];
  preselectedServiceId: string | null;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [addressDialogOpen, setAddressDialogOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<SeriesPreviewDate[]>([]);
  const [loadingPreview, setLoadingPreview] = React.useState(false);
  const [skipped, setSkipped] = React.useState<number[]>([]);

  const [form, setForm] = React.useState({
    serviceId: preselectedServiceId ?? services[0]?.id ?? '',
    locationType: (professional.accepts_home_visits ? 'client_home' : 'studio') as LocationType,
    addressId: addresses.find((a) => a.is_default)?.id ?? addresses[0]?.id ?? null,
    frequency: 'biweekly' as Frequency,
    intervalWeeks: 2,
    weekday: 4,
    startTime: '17:00',
    startDate: toLocalDateString(new Date(Date.now() + 7 * 86_400_000)),
    endMode: 'count' as 'count' | 'date',
    plannedOccurrences: 6,
    endDate: '',
    approvalMode: 'whole_series' as 'whole_series' | 'each_occurrence',
    priceAmount: '' as string,
    notes: '',
  });

  const service = services.find((s) => s.id === form.serviceId) ?? null;

  const travelFee =
    form.locationType === 'client_home' && professional.travel_fee_type !== 'none'
      ? Number(professional.travel_fee)
      : 0;

  const agreedPrice = form.priceAmount
    ? Number(form.priceAmount)
    : service && service.price_type !== 'on_request'
      ? Number(service.price_min ?? 0)
      : null;

  // תצוגה מקדימה של כל המועדים – מגיעה מהמסד כדי שתהיה זהה למה שייווצר בפועל.
  React.useEffect(() => {
    let active = true;
    setLoadingPreview(true);

    const timer = setTimeout(async () => {
      const result = await previewSeriesDatesAction({
        startDate: form.startDate,
        weekday: form.weekday,
        startTime: form.startTime,
        frequency: form.frequency,
        intervalWeeks: form.intervalWeeks,
        endDate: form.endMode === 'date' ? form.endDate || null : null,
        occurrences: form.endMode === 'count' ? form.plannedOccurrences : null,
      });

      if (!active) return;
      setPreview(result.ok ? result.data : []);
      setLoadingPreview(false);
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    form.startDate,
    form.weekday,
    form.startTime,
    form.frequency,
    form.intervalWeeks,
    form.endMode,
    form.endDate,
    form.plannedOccurrences,
  ]);

  const submit = async () => {
    if (!service) return;

    setSubmitting(true);
    const result = await createSeriesAction({
      professionalId: professional.id,
      serviceId: service.id,
      locationType: form.locationType,
      addressId: form.locationType === 'client_home' ? form.addressId : null,
      frequency: form.frequency,
      intervalWeeks: form.intervalWeeks,
      weekday: form.weekday,
      startTime: form.startTime,
      startDate: form.startDate,
      endDate: form.endMode === 'date' ? form.endDate || null : null,
      plannedOccurrences: form.endMode === 'count' ? form.plannedOccurrences : null,
      approvalMode: form.approvalMode,
      priceAmount: agreedPrice,
      notes: form.notes || null,
      skipSequences: skipped,
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(result.message ?? 'הבקשה נשלחה');
    if (result.data.conflicts > 0) {
      toast.warning(`${result.data.conflicts} מהמועדים תפוסים ביומן – בעל המקצוע יוכל להציע חלופה.`);
    }

    router.push('/dashboard/recurring');
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <header className="surface flex items-center gap-3 p-4">
        <UserAvatar src={professional.avatar_url} name={professional.business_name} className="size-12" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 font-semibold">
            <span className="truncate">{professional.business_name}</span>
            {professional.is_verified ? <BadgeCheck className="size-4 text-primary" aria-label="מאומת" /> : null}
          </p>
          <p className="text-xs text-muted-foreground">{professional.cities?.name}</p>
        </div>
        <Badge variant="info">
          <Repeat className="size-3" aria-hidden />
          מפגש קבוע
        </Badge>
      </header>

      {services.length === 0 ? (
        <p className="surface p-6 text-center text-sm text-muted-foreground">
          לבעל המקצוע אין כרגע שירותים שניתן לקבוע כמפגש קבוע.
        </p>
      ) : (
        <>
          <section className="surface space-y-4 p-4">
            <h2 className="font-semibold">מה קובעים?</h2>

            <Field label="השירות הקבוע" htmlFor="service" required>
              <Select value={form.serviceId} onValueChange={(value) => setForm((f) => ({ ...f, serviceId: value }))}>
                <SelectTrigger id="service">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {services.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} · {item.duration_minutes} דק׳
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="תדירות" htmlFor="frequency" required>
              <Select
                value={form.frequency}
                onValueChange={(value) => setForm((f) => ({ ...f, frequency: value as Frequency }))}
              >
                <SelectTrigger id="frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {form.frequency === 'custom' ? (
              <Field label="כל כמה שבועות?" htmlFor="intervalWeeks" required>
                <Input
                  id="intervalWeeks"
                  type="number"
                  min={1}
                  max={12}
                  value={form.intervalWeeks}
                  onChange={(event) => setForm((f) => ({ ...f, intervalWeeks: Number(event.target.value) }))}
                />
              </Field>
            ) : null}

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">יום קבוע</legend>
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
                {WEEKDAYS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, weekday: day.value }))}
                    aria-pressed={form.weekday === day.value}
                    className={cn(
                      'rounded-xl border px-2 py-2 text-sm transition-colors',
                      form.weekday === day.value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:bg-muted',
                    )}
                  >
                    {day.short}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="שעה קבועה" htmlFor="startTime" required>
                <Input
                  id="startTime"
                  type="time"
                  value={form.startTime}
                  onChange={(event) => setForm((f) => ({ ...f, startTime: event.target.value }))}
                />
              </Field>

              <Field label="תאריך התחלה" htmlFor="startDate" required>
                <Input
                  id="startDate"
                  type="date"
                  min={toLocalDateString(new Date())}
                  value={form.startDate}
                  onChange={(event) => setForm((f) => ({ ...f, startDate: event.target.value }))}
                />
              </Field>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">עד מתי?</legend>
              <RadioGroup
                value={form.endMode}
                onValueChange={(value) => setForm((f) => ({ ...f, endMode: value as 'count' | 'date' }))}
                className="gap-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="count" id="end-count" />
                  <Label htmlFor="end-count" className="flex items-center gap-2 font-normal">
                    מספר מפגשים
                    <Input
                      type="number"
                      min={1}
                      max={52}
                      value={form.plannedOccurrences}
                      onChange={(event) =>
                        setForm((f) => ({ ...f, plannedOccurrences: Number(event.target.value) }))
                      }
                      className="h-9 w-20"
                      disabled={form.endMode !== 'count'}
                    />
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="date" id="end-date" />
                  <Label htmlFor="end-date" className="flex items-center gap-2 font-normal">
                    עד תאריך
                    <Input
                      type="date"
                      value={form.endDate}
                      onChange={(event) => setForm((f) => ({ ...f, endDate: event.target.value }))}
                      className="h-9"
                      disabled={form.endMode !== 'date'}
                    />
                  </Label>
                </div>
              </RadioGroup>
            </fieldset>
          </section>

          <section className="surface space-y-4 p-4">
            <h2 className="font-semibold">איפה ובאיזה מחיר?</h2>

            <Field label="מיקום" htmlFor="locationType">
              <Select
                value={form.locationType}
                onValueChange={(value) => setForm((f) => ({ ...f, locationType: value as LocationType }))}
              >
                <SelectTrigger id="locationType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {professional.accepts_home_visits ? (
                    <SelectItem value="client_home">{LOCATION_LABELS.client_home}</SelectItem>
                  ) : null}
                  {professional.accepts_studio ? (
                    <SelectItem value="studio">{LOCATION_LABELS.studio}</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </Field>

            {form.locationType === 'client_home' ? (
              <Field label="כתובת קבועה" required>
                {addresses.length === 0 ? (
                  <Button variant="outline" block onClick={() => setAddressDialogOpen(true)}>
                    הוספת כתובת
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Select
                      value={form.addressId ?? ''}
                      onValueChange={(value) => setForm((f) => ({ ...f, addressId: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="בחרו כתובת" />
                      </SelectTrigger>
                      <SelectContent>
                        {addresses.map((address) => (
                          <SelectItem key={address.id} value={address.id}>
                            {address.label} · {address.street} {address.house_number}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" onClick={() => setAddressDialogOpen(true)}>
                      הוספת כתובת חדשה
                    </Button>
                  </div>
                )}
              </Field>
            ) : null}

            <Field
              label="מחיר קבוע שסוכם (₪)"
              htmlFor="priceAmount"
              hint="אפשר להשאיר ריק כדי להשתמש במחיר השירות. בעל המקצוע יאשר את המחיר."
            >
              <Input
                id="priceAmount"
                type="number"
                min={0}
                value={form.priceAmount}
                onChange={(event) => setForm((f) => ({ ...f, priceAmount: event.target.value }))}
                placeholder={service?.price_min ? String(service.price_min) : ''}
              />
            </Field>

            <Field label="הערות קבועות" htmlFor="notes">
              <Textarea
                id="notes"
                rows={2}
                value={form.notes}
                onChange={(event) => setForm((f) => ({ ...f, notes: event.target.value }))}
                placeholder="לדוגמה: תמיד להביא מסרק צר, לצלצל בפעמון ולא לדפוק"
              />
            </Field>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">אישור המפגשים</legend>
              <RadioGroup
                value={form.approvalMode}
                onValueChange={(value) =>
                  setForm((f) => ({ ...f, approvalMode: value as 'whole_series' | 'each_occurrence' }))
                }
                className="gap-2"
              >
                <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border p-3">
                  <RadioGroupItem value="whole_series" id="approve-all" className="mt-0.5" />
                  <span className="text-sm">
                    <span className="block font-medium">לאשר את כל הסדרה מראש</span>
                    <span className="block text-muted-foreground">
                      כל המפגשים ייווצרו ביומן מיד לאחר אישור בעל המקצוע.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border p-3">
                  <RadioGroupItem value="each_occurrence" id="approve-each" className="mt-0.5" />
                  <span className="text-sm">
                    <span className="block font-medium">לאשר כל מפגש בנפרד</span>
                    <span className="block text-muted-foreground">
                      נקבל תזכורת לפני כל מפגש ונאשר אותו ידנית.
                    </span>
                  </span>
                </label>
              </RadioGroup>
            </fieldset>
          </section>

          {/* תצוגה מקדימה של המועדים */}
          <section className="surface space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold">
                <CalendarCheck className="size-4 text-primary" aria-hidden />
                המועדים הצפויים
              </h2>
              {loadingPreview ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden /> : null}
            </div>

            {preview.length === 0 && !loadingPreview ? (
              <p className="text-sm text-muted-foreground">בחרו תדירות ותאריך התחלה כדי לראות את המועדים.</p>
            ) : (
              <ul className="space-y-1.5">
                {preview.map((item) => {
                  const isSkipped = skipped.includes(item.sequence);
                  return (
                    <li
                      key={item.sequence}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-xl border p-2.5 text-sm',
                        isSkipped ? 'border-dashed opacity-50' : 'border-border',
                      )}
                    >
                      <span className={cn(isSkipped && 'line-through')}>
                        <span className="font-medium">מפגש {item.sequence}</span>
                        <span className="text-muted-foreground">
                          {' · '}
                          {formatFriendlyDateTime(item.scheduled_start)}
                        </span>
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={isSkipped ? 'החזרת המועד' : 'הסרת המועד'}
                        onClick={() =>
                          setSkipped((current) =>
                            isSkipped
                              ? current.filter((s) => s !== item.sequence)
                              : [...current, item.sequence],
                          )
                        }
                      >
                        {isSkipped ? '↺' : <Trash2 className="size-4" aria-hidden />}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="rounded-xl bg-muted/60 p-3 text-sm">
              <p className="flex items-center justify-between">
                <span className="text-muted-foreground">מחיר לכל מפגש</span>
                <span className="font-semibold">
                  {agreedPrice !== null ? formatPrice(agreedPrice + travelFee) : 'לפי פנייה'}
                </span>
              </p>
              <p className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">מספר מפגשים</span>
                <span className="font-semibold">{preview.length - skipped.length}</span>
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              הסדרה תיכנס לתוקף רק לאחר שבעל המקצוע יאשר אותה. כל מפגש נשמר גם כהזמנה עצמאית, כך שאפשר
              לשנות מפגש בודד בלי לשנות את שאר הסדרה.
            </p>
          </section>

          <Button
            block
            size="lg"
            onClick={submit}
            loading={submitting}
            disabled={
              !service ||
              preview.length === 0 ||
              (form.locationType === 'client_home' && !form.addressId)
            }
          >
            שליחת בקשה למפגשים קבועים
          </Button>
        </>
      )}

      <AddressDialog
        open={addressDialogOpen}
        onOpenChange={setAddressDialogOpen}
        cities={cities}
        onSaved={(id) => {
          setForm((f) => ({ ...f, addressId: id }));
          router.refresh();
        }}
      />
    </div>
  );
}
