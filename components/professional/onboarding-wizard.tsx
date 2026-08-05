'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, ChevronLeft, ChevronRight, CircleAlert, Rocket, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CityCombobox, MultiCityPicker } from '@/components/shared/city-combobox';
import { SingleImageUploader } from '@/components/shared/image-uploader';
import { PROFILE_STEPS, READINESS_LABELS, WEEKDAYS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import {
  publishProfessionalProfileAction,
  saveAvailabilityAction,
  saveProfessionalDetailsAction,
  saveServiceAction,
  saveServiceLocationAction,
  deleteServiceAction,
  submitProfessionRequest,
} from '@/lib/actions/professional';
import type { City, Profession, ReadinessResult } from '@/types/app';
import type { SessionUser } from '@/lib/auth/session';
import type { Tables } from '@/types/database';

type EditData = {
  profile: Tables<'professional_profiles'> | null;
  contact: Tables<'professional_contact_details'> | null;
  professionIds: string[];
  services: Tables<'professional_services'>[];
  serviceAreas: Array<{ id: string; city_id: string | null; area_name: string | null; travel_fee: number }>;
  availability: Array<{ id: string; weekday: number; start_time: string; end_time: string; is_break: boolean }>;
  blockedDates: Array<{ id: string; start_at: string; end_at: string; reason: string | null; is_vacation: boolean }>;
} | null;

export function OnboardingWizard({
  cities,
  professions,
  user,
  editData,
  readiness,
  portfolioCount,
}: {
  cities: City[];
  professions: Profession[];
  user: SessionUser;
  editData: EditData;
  readiness: ReadinessResult | null;
  portfolioCount: number;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [saving, setSaving] = React.useState(false);

  // ---- שלב 1 ----
  const [details, setDetails] = React.useState({
    businessName: editData?.profile?.business_name ?? user.fullName,
    headline: editData?.profile?.headline ?? '',
    bio: editData?.profile?.bio ?? '',
    professionIds: editData?.professionIds ?? [],
    otherProfession: '',
    cityId: editData?.profile?.city_id ?? user.cityId ?? '',
    yearsExperience: editData?.profile?.years_experience ?? null,
    avatarUrl: editData?.profile?.avatar_url ?? user.avatarUrl,
    coverUrl: editData?.profile?.cover_url ?? null,
    phone: editData?.contact?.phone ?? '',
    websiteUrl: editData?.profile?.website_url ?? '',
    instagramUrl: ((editData?.profile?.social_links ?? {}) as Record<string, string>).instagram ?? '',
  });

  // ---- שלב 2 ----
  const [location, setLocation] = React.useState({
    acceptsHomeVisits: editData?.profile?.accepts_home_visits ?? true,
    acceptsStudio: editData?.profile?.accepts_studio ?? false,
    acceptsEvents: editData?.profile?.accepts_events ?? false,
    acceptsOnline: editData?.profile?.accepts_online ?? false,
    studioAddress: editData?.contact?.studio_address ?? '',
    serviceAreaCityIds: (editData?.serviceAreas ?? [])
      .map((a) => a.city_id)
      .filter((id): id is string => Boolean(id)),
    maxTravelKm: editData?.profile?.max_travel_km ?? 25,
    travelFeeType: (editData?.profile?.travel_fee_type ?? 'none') as 'none' | 'fixed' | 'per_km' | 'per_city',
    travelFee: Number(editData?.profile?.travel_fee ?? 0),
  });

  // ---- שלב 4 ----
  const [availability, setAvailability] = React.useState(() => {
    const base = WEEKDAYS.map((day) => {
      const windows = (editData?.availability ?? []).filter((a) => a.weekday === day.value && !a.is_break);
      const breaks = (editData?.availability ?? []).filter((a) => a.weekday === day.value && a.is_break);
      return {
        weekday: day.value,
        enabled: windows.length > 0,
        startTime: windows[0]?.start_time.slice(0, 5) ?? '09:00',
        endTime: windows[0]?.end_time.slice(0, 5) ?? '19:00',
        breakStart: breaks[0]?.start_time.slice(0, 5) ?? '',
        breakEnd: breaks[0]?.end_time.slice(0, 5) ?? '',
      };
    });
    return base;
  });

  const [policy, setPolicy] = React.useState({
    minLeadTimeMinutes: editData?.profile?.min_lead_time_minutes ?? 120,
    maxLeadTimeDays: editData?.profile?.max_lead_time_days ?? 90,
    cancellationPolicy: editData?.profile?.cancellation_policy ?? 'ביטול עד 24 שעות לפני המועד ללא עלות.',
  });

  const completion = readiness?.completion ?? 0;
  const missing = readiness?.missing ?? [];

  const goNext = () => setStep((current) => Math.min(current + 1, PROFILE_STEPS.length - 1));
  const goBack = () => setStep((current) => Math.max(current - 1, 0));

  const saveDetails = async () => {
    setSaving(true);
    const result = await saveProfessionalDetailsAction({
      ...details,
      yearsExperience: details.yearsExperience ?? undefined,
      websiteUrl: details.websiteUrl || null,
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(result.message ?? 'נשמר');
    if (result.data.professionRequestSent) {
      toast.info('בקשת המקצוע החדש נשלחה לאישור מנהל');
    }
    router.refresh();
    goNext();
  };

  const saveLocation = async () => {
    setSaving(true);
    const result = await saveServiceLocationAction(location);
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'נשמר');
    router.refresh();
    goNext();
  };

  const saveAvailability = async () => {
    const windows = availability
      .filter((day) => day.enabled)
      .flatMap((day) => {
        const rows = [
          { weekday: day.weekday, startTime: day.startTime, endTime: day.endTime, isBreak: false },
        ];
        if (day.breakStart && day.breakEnd && day.breakEnd > day.breakStart) {
          rows.push({
            weekday: day.weekday,
            startTime: day.breakStart,
            endTime: day.breakEnd,
            isBreak: true,
          });
        }
        return rows;
      });

    if (windows.length === 0) {
      toast.error('יש להגדיר לפחות יום פעילות אחד');
      return;
    }

    setSaving(true);
    const result = await saveAvailabilityAction({ windows, ...policy });
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'נשמר');
    router.refresh();
    goNext();
  };

  const publish = async () => {
    setSaving(true);
    const result = await publishProfessionalProfileAction();
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(result.message ?? 'הפרופיל פורסם');
    router.push('/dashboard/pro');
    router.refresh();
  };

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <div>
          <h1 className="text-xl font-bold">
            {editData?.profile ? 'הפרופיל המקצועי שלי' : 'יצירת פרופיל מקצועי'}
          </h1>
          <p className="text-sm text-muted-foreground">
            אפשר לשמור בכל שלב ולהמשיך מאוחר יותר. הפרופיל יופיע בחיפוש רק אחרי פרסום.
          </p>
        </div>

        <div className="surface space-y-2 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">השלמת הפרופיל</span>
            <span className="font-bold text-primary">{completion}%</span>
          </div>
          <Progress value={completion} aria-label={`הפרופיל הושלם ב־${completion} אחוז`} />

          {missing.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5 pt-1">
              {missing.map((item) => (
                <li key={item}>
                  <Badge variant="warning">
                    <CircleAlert className="size-3" aria-hidden />
                    {READINESS_LABELS[item] ?? item}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-success">
              <Check className="size-4" aria-hidden />
              כל שדות החובה הושלמו – אפשר לפרסם!
            </p>
          )}
        </div>
      </header>

      {/* ניווט בין שלבים */}
      <nav aria-label="שלבי הגדרת הפרופיל" className="scroll-x">
        {PROFILE_STEPS.map((item, index) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setStep(index)}
            aria-current={step === index ? 'step' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm transition-colors',
              step === index ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'flex size-5 items-center justify-center rounded-full text-xs font-bold',
                step === index ? 'bg-primary-foreground/25' : 'bg-background',
              )}
            >
              {index + 1}
            </span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* שלב 1 – פרטים מקצועיים */}
      {step === 0 ? (
        <section className="surface space-y-4 p-4">
          <h2 className="font-semibold">פרטים מקצועיים</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="תמונת פרופיל מקצועית" required hint="חובה לפרסום הפרופיל">
              <SingleImageUploader
                value={details.avatarUrl}
                onChange={(url) => setDetails((d) => ({ ...d, avatarUrl: url }))}
                bucket="avatars"
                label="תמונה"
              />
            </Field>
            <Field label="תמונת כיסוי">
              <SingleImageUploader
                value={details.coverUrl}
                onChange={(url) => setDetails((d) => ({ ...d, coverUrl: url }))}
                bucket="covers"
                shape="cover"
                label="כיסוי"
              />
            </Field>
          </div>

          <Field label="שם העסק או השם המקצועי" htmlFor="businessName" required>
            <Input
              id="businessName"
              value={details.businessName}
              onChange={(event) => setDetails((d) => ({ ...d, businessName: event.target.value }))}
              placeholder="לדוגמה: דנה שיער ואיפור"
            />
          </Field>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              מקצועות <span className="text-destructive">*</span>
            </legend>
            <p className="text-xs text-muted-foreground">אפשר לבחור כמה מקצועות, למשל ספר וגם מעצב זקן.</p>
            <div className="flex flex-wrap gap-2">
              {professions.map((profession) => {
                const selected = details.professionIds.includes(profession.id);
                const isOther = profession.slug === 'other';
                return (
                  <button
                    key={profession.id}
                    type="button"
                    onClick={() =>
                      setDetails((d) => ({
                        ...d,
                        professionIds: selected
                          ? d.professionIds.filter((id) => id !== profession.id)
                          : [...d.professionIds, profession.id],
                      }))
                    }
                    aria-pressed={selected}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm transition-colors',
                      selected ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted',
                      isOther && 'border-dashed',
                    )}
                  >
                    {profession.name}
                  </button>
                );
              })}
            </div>

            {details.professionIds.some(
              (id) => professions.find((p) => p.id === id)?.slug === 'other',
            ) ? (
              <div className="rounded-xl bg-muted/60 p-3">
                <Field
                  label="איזה מקצוע?"
                  htmlFor="otherProfession"
                  hint="הבקשה תישלח לאישור מנהל. לאחר האישור המקצוע יתווסף לרשימה הראשית ויהיה זמין לכולם."
                >
                  <Input
                    id="otherProfession"
                    value={details.otherProfession}
                    onChange={(event) => setDetails((d) => ({ ...d, otherProfession: event.target.value }))}
                    placeholder="לדוגמה: מעצב/ת תסרוקות אפרו"
                  />
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={async () => {
                    const result = await submitProfessionRequest({
                      rawName: details.otherProfession,
                      note: null,
                    });
                    if (result.ok) toast.success(result.message ?? 'הבקשה נשלחה');
                    else toast.error(result.error);
                  }}
                  disabled={details.otherProfession.trim().length < 2}
                >
                  שליחת בקשה לאישור
                </Button>
              </div>
            ) : null}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="עיר" htmlFor="proCity" required>
              <CityCombobox
                id="proCity"
                cities={cities}
                value={details.cityId || null}
                onChange={(id) => setDetails((d) => ({ ...d, cityId: id ?? '' }))}
              />
            </Field>

            <Field label="שנות ניסיון" htmlFor="years">
              <Input
                id="years"
                type="number"
                min={0}
                max={70}
                value={details.yearsExperience ?? ''}
                onChange={(event) =>
                  setDetails((d) => ({
                    ...d,
                    yearsExperience: event.target.value ? Number(event.target.value) : null,
                  }))
                }
              />
            </Field>
          </div>

          <Field label="תיאור קצר" htmlFor="headline" hint="שורה אחת שמופיעה מתחת לשם שלך בחיפוש">
            <Input
              id="headline"
              maxLength={140}
              value={details.headline}
              onChange={(event) => setDetails((d) => ({ ...d, headline: event.target.value }))}
              placeholder="ספרית ומאפרת, מגיעה עד הבית באזור השרון"
            />
          </Field>

          <Field label="תיאור מפורט" htmlFor="bio">
            <Textarea
              id="bio"
              rows={5}
              value={details.bio}
              onChange={(event) => setDetails((d) => ({ ...d, bio: event.target.value }))}
              placeholder="ספרו על עצמכם, על הניסיון, על סוגי הטיפולים ועל מה שחשוב לכם בעבודה."
            />
          </Field>

          <Field
            label="מספר טלפון"
            htmlFor="phone"
            required
            hint="נשמר באופן פרטי. נחשף ללקוח רק לאחר אישור הזמנה."
          >
            <Input
              id="phone"
              type="tel"
              dir="ltr"
              value={details.phone}
              onChange={(event) => setDetails((d) => ({ ...d, phone: event.target.value }))}
              placeholder="050-1234567"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="אתר אינטרנט" htmlFor="website">
              <Input
                id="website"
                type="url"
                dir="ltr"
                value={details.websiteUrl}
                onChange={(event) => setDetails((d) => ({ ...d, websiteUrl: event.target.value }))}
                placeholder="https://"
              />
            </Field>
            <Field label="אינסטגרם" htmlFor="instagram">
              <Input
                id="instagram"
                dir="ltr"
                value={details.instagramUrl}
                onChange={(event) => setDetails((d) => ({ ...d, instagramUrl: event.target.value }))}
                placeholder="https://instagram.com/…"
              />
            </Field>
          </div>

          <Button block size="lg" onClick={saveDetails} loading={saving}>
            שמירה והמשך
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
        </section>
      ) : null}

      {/* שלב 2 – מקום מתן השירות */}
      {step === 1 ? (
        <section className="surface space-y-4 p-4">
          <h2 className="font-semibold">איפה אתם נותנים את השירות?</h2>

          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                { key: 'acceptsHomeVisits', label: 'מגיע לבית הלקוח' },
                { key: 'acceptsStudio', label: 'מקבל בבית העסק / סטודיו' },
                { key: 'acceptsEvents', label: 'נותן שירות באירועים' },
                { key: 'acceptsOnline', label: 'ייעוץ אונליין' },
              ] as const
            ).map((option) => (
              <label
                key={option.key}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm transition-colors',
                  location[option.key] ? 'border-primary bg-primary/5' : 'border-border',
                )}
              >
                <Checkbox
                  checked={location[option.key]}
                  onCheckedChange={(checked) =>
                    setLocation((l) => ({ ...l, [option.key]: checked === true }))
                  }
                />
                {option.label}
              </label>
            ))}
          </div>

          {location.acceptsStudio ? (
            <Field
              label="כתובת הסטודיו"
              htmlFor="studioAddress"
              required
              hint="נשמרת באופן פרטי ונחשפת ללקוח רק לאחר אישור הזמנה."
            >
              <Input
                id="studioAddress"
                value={location.studioAddress}
                onChange={(event) => setLocation((l) => ({ ...l, studioAddress: event.target.value }))}
                placeholder="רחוב, מספר, עיר"
              />
            </Field>
          ) : null}

          {location.acceptsHomeVisits ? (
            <>
              <Field label="אזורי שירות" required hint="הערים שאליהן אתם מגיעים">
                <MultiCityPicker
                  cities={cities}
                  value={location.serviceAreaCityIds}
                  onChange={(ids) => setLocation((l) => ({ ...l, serviceAreaCityIds: ids }))}
                />
              </Field>

              <Field label={`מרחק נסיעה מקסימלי: ${location.maxTravelKm} ק״מ`} htmlFor="maxTravel">
                <input
                  id="maxTravel"
                  type="range"
                  min={5}
                  max={150}
                  step={5}
                  value={location.maxTravelKm}
                  onChange={(event) => setLocation((l) => ({ ...l, maxTravelKm: Number(event.target.value) }))}
                  className="w-full accent-[hsl(var(--primary))]"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="תוספת מחיר לנסיעה" htmlFor="travelFeeType">
                  <Select
                    value={location.travelFeeType}
                    onValueChange={(value) =>
                      setLocation((l) => ({ ...l, travelFeeType: value as typeof l.travelFeeType }))
                    }
                  >
                    <SelectTrigger id="travelFeeType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">ללא תוספת</SelectItem>
                      <SelectItem value="fixed">סכום קבוע</SelectItem>
                      <SelectItem value="per_km">לפי מרחק</SelectItem>
                      <SelectItem value="per_city">משתנה לפי עיר</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                {location.travelFeeType !== 'none' ? (
                  <Field label="סכום התוספת (₪)" htmlFor="travelFee">
                    <Input
                      id="travelFee"
                      type="number"
                      min={0}
                      value={location.travelFee}
                      onChange={(event) => setLocation((l) => ({ ...l, travelFee: Number(event.target.value) }))}
                    />
                  </Field>
                ) : null}
              </div>
            </>
          ) : null}

          <div className="flex gap-2">
            <Button variant="outline" onClick={goBack}>
              <ChevronRight className="size-4" aria-hidden />
              חזרה
            </Button>
            <Button block onClick={saveLocation} loading={saving}>
              שמירה והמשך
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
          </div>
        </section>
      ) : null}

      {/* שלב 3 – שירותים ומחירים */}
      {step === 2 ? (
        <ServicesStep
          services={editData?.services ?? []}
          professions={professions}
          location={location}
          onDone={goNext}
          onBack={goBack}
        />
      ) : null}

      {/* שלב 4 – שעות וזמינות */}
      {step === 3 ? (
        <section className="surface space-y-4 p-4">
          <h2 className="font-semibold">שעות פעילות וזמינות</h2>

          <ul className="space-y-2">
            {availability.map((day, index) => (
              <li key={day.weekday} className="rounded-xl border border-border p-3">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id={`day-${day.weekday}`}
                    checked={day.enabled}
                    onCheckedChange={(checked) =>
                      setAvailability((current) =>
                        current.map((item, i) => (i === index ? { ...item, enabled: checked === true } : item)),
                      )
                    }
                  />
                  <Label htmlFor={`day-${day.weekday}`} className="w-16 cursor-pointer">
                    {WEEKDAYS[day.weekday].long}
                  </Label>

                  {day.enabled ? (
                    <div className="flex flex-1 items-center gap-2" dir="ltr">
                      <Input
                        type="time"
                        value={day.startTime}
                        aria-label={`שעת פתיחה ביום ${WEEKDAYS[day.weekday].long}`}
                        onChange={(event) =>
                          setAvailability((current) =>
                            current.map((item, i) =>
                              i === index ? { ...item, startTime: event.target.value } : item,
                            ),
                          )
                        }
                        className="h-9"
                      />
                      <span className="text-muted-foreground">–</span>
                      <Input
                        type="time"
                        value={day.endTime}
                        aria-label={`שעת סגירה ביום ${WEEKDAYS[day.weekday].long}`}
                        onChange={(event) =>
                          setAvailability((current) =>
                            current.map((item, i) =>
                              i === index ? { ...item, endTime: event.target.value } : item,
                            ),
                          )
                        }
                        className="h-9"
                      />
                    </div>
                  ) : (
                    <span className="flex-1 text-sm text-muted-foreground">סגור</span>
                  )}
                </div>

                {day.enabled ? (
                  <div className="mt-2 flex items-center gap-2 ps-8" dir="ltr">
                    <span className="text-xs text-muted-foreground" dir="rtl">
                      הפסקה:
                    </span>
                    <Input
                      type="time"
                      value={day.breakStart}
                      aria-label="תחילת הפסקה"
                      onChange={(event) =>
                        setAvailability((current) =>
                          current.map((item, i) =>
                            i === index ? { ...item, breakStart: event.target.value } : item,
                          ),
                        )
                      }
                      className="h-8 w-28"
                    />
                    <Input
                      type="time"
                      value={day.breakEnd}
                      aria-label="סוף הפסקה"
                      onChange={(event) =>
                        setAvailability((current) =>
                          current.map((item, i) =>
                            i === index ? { ...item, breakEnd: event.target.value } : item,
                          ),
                        )
                      }
                      className="h-8 w-28"
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="זמן מינימלי להזמנה מראש (דקות)" htmlFor="minLead">
              <Input
                id="minLead"
                type="number"
                min={0}
                value={policy.minLeadTimeMinutes}
                onChange={(event) =>
                  setPolicy((p) => ({ ...p, minLeadTimeMinutes: Number(event.target.value) }))
                }
              />
            </Field>
            <Field label="זמן מקסימלי להזמנה מראש (ימים)" htmlFor="maxLead">
              <Input
                id="maxLead"
                type="number"
                min={1}
                max={365}
                value={policy.maxLeadTimeDays}
                onChange={(event) => setPolicy((p) => ({ ...p, maxLeadTimeDays: Number(event.target.value) }))}
              />
            </Field>
          </div>

          <Field label="מדיניות ביטול" htmlFor="cancellation">
            <Textarea
              id="cancellation"
              rows={3}
              value={policy.cancellationPolicy}
              onChange={(event) => setPolicy((p) => ({ ...p, cancellationPolicy: event.target.value }))}
            />
          </Field>

          <p className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
            חסימת תאריכים, חופשות וסימון &quot;זמין עכשיו&quot; מתבצעים מלוח הזמנים אחרי הפרסום.
          </p>

          <div className="flex gap-2">
            <Button variant="outline" onClick={goBack}>
              <ChevronRight className="size-4" aria-hidden />
              חזרה
            </Button>
            <Button block onClick={saveAvailability} loading={saving}>
              שמירה והמשך
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
          </div>
        </section>
      ) : null}

      {/* שלב 5 – תיק עבודות ופרסום */}
      {step === 4 ? (
        <section className="surface space-y-4 p-4">
          <h2 className="font-semibold">תיק עבודות</h2>
          <p className="text-sm text-muted-foreground">
            כדי לפרסם את הפרופיל צריך להעלות לפחות שלוש תמונות עבודה. כרגע יש{' '}
            <strong>{portfolioCount}</strong>.
          </p>

          <Progress value={Math.min((portfolioCount / 3) * 100, 100)} />

          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/create">העלאת עבודה</Link>
            </Button>
            {editData?.profile ? (
              <Button variant="outline" asChild>
                <Link href={`/u/${user.username}`}>צפייה בפרופיל</Link>
              </Button>
            ) : null}
          </div>

          <div className="rounded-xl border border-border p-4">
            <h3 className="font-medium">מה נדרש לפרסום</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {Object.entries(READINESS_LABELS)
                .filter(([key]) => key !== 'profile')
                .map(([key, label]) => {
                  const done = !missing.includes(key);
                  return (
                    <li key={key} className={cn('flex items-center gap-2', done ? 'text-success' : 'text-muted-foreground')}>
                      {done ? (
                        <Check className="size-4" aria-hidden />
                      ) : (
                        <CircleAlert className="size-4" aria-hidden />
                      )}
                      {label}
                    </li>
                  );
                })}
            </ul>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={goBack}>
              <ChevronRight className="size-4" aria-hidden />
              חזרה
            </Button>
            <Button block size="lg" onClick={publish} loading={saving} disabled={missing.length > 0}>
              <Rocket className="size-4" aria-hidden />
              פרסום הפרופיל
            </Button>
          </div>

          {missing.length > 0 ? (
            <p className="text-center text-xs text-muted-foreground">
              עדיין חסרים: {missing.map((item) => READINESS_LABELS[item] ?? item).join(', ')}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------
// שלב השירותים
// ---------------------------------------------------------------------

function ServicesStep({
  services,
  professions,
  location,
  onDone,
  onBack,
}: {
  services: Tables<'professional_services'>[];
  professions: Profession[];
  location: { acceptsHomeVisits: boolean; acceptsStudio: boolean; acceptsEvents: boolean };
  onDone: () => void;
  onBack: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [draft, setDraft] = React.useState({
    name: '',
    description: '',
    professionId: null as string | null,
    priceType: 'fixed' as 'fixed' | 'range' | 'on_request',
    priceMin: '' as string,
    priceMax: '' as string,
    durationMinutes: 60,
    bufferMinutes: 15,
    atClientHome: location.acceptsHomeVisits,
    atStudio: location.acceptsStudio,
    atEvent: location.acceptsEvents,
    supportsRecurring: true,
  });

  const addService = async () => {
    setSaving(true);
    const result = await saveServiceAction({
      ...draft,
      priceMin: draft.priceMin ? Number(draft.priceMin) : null,
      priceMax: draft.priceMax ? Number(draft.priceMax) : null,
      imageUrl: null,
      isActive: true,
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success('השירות נוסף');
    setDraft((d) => ({ ...d, name: '', description: '', priceMin: '', priceMax: '' }));
    router.refresh();
  };

  const removeService = async (id: string) => {
    const result = await deleteServiceAction(id);
    if (result.ok) {
      toast.success('השירות הוסר');
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <section className="space-y-4">
      {services.length > 0 ? (
        <ul className="space-y-2">
          {services.map((service) => (
            <li key={service.id} className="surface flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="font-medium">{service.name}</p>
                <p className="text-xs text-muted-foreground">
                  {service.duration_minutes} דק׳ ·{' '}
                  {service.price_type === 'on_request'
                    ? 'מחיר לאחר שיחה'
                    : service.price_type === 'range'
                      ? `${service.price_min}–${service.price_max} ₪`
                      : `${service.price_min} ₪`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => removeService(service.id)}
                aria-label={`הסרת ${service.name}`}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="surface space-y-4 p-4">
        <h2 className="font-semibold">הוספת שירות</h2>

        <Field label="שם השירות" htmlFor="serviceName" required>
          <Input
            id="serviceName"
            value={draft.name}
            onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
            placeholder="לדוגמה: תספורת נשים + פן"
          />
        </Field>

        <Field label="תיאור" htmlFor="serviceDescription">
          <Textarea
            id="serviceDescription"
            rows={2}
            value={draft.description}
            onChange={(event) => setDraft((d) => ({ ...d, description: event.target.value }))}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="קטגוריה" htmlFor="serviceProfession">
            <Select
              value={draft.professionId ?? 'none'}
              onValueChange={(value) => setDraft((d) => ({ ...d, professionId: value === 'none' ? null : value }))}
            >
              <SelectTrigger id="serviceProfession">
                <SelectValue placeholder="בחרו קטגוריה" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">ללא</SelectItem>
                {professions
                  .filter((p) => p.slug !== 'other')
                  .map((profession) => (
                    <SelectItem key={profession.id} value={profession.id}>
                      {profession.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="סוג תמחור" htmlFor="priceType">
            <Select
              value={draft.priceType}
              onValueChange={(value) => setDraft((d) => ({ ...d, priceType: value as typeof d.priceType }))}
            >
              <SelectTrigger id="priceType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">מחיר קבוע</SelectItem>
                <SelectItem value="range">טווח מחירים</SelectItem>
                <SelectItem value="on_request">מחיר לאחר שיחה</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {draft.priceType !== 'on_request' ? (
            <>
              <Field label={draft.priceType === 'range' ? 'מחיר מ־ (₪)' : 'מחיר (₪)'} htmlFor="priceMin" required>
                <Input
                  id="priceMin"
                  type="number"
                  min={0}
                  value={draft.priceMin}
                  onChange={(event) => setDraft((d) => ({ ...d, priceMin: event.target.value }))}
                />
              </Field>
              {draft.priceType === 'range' ? (
                <Field label="עד (₪)" htmlFor="priceMax" required>
                  <Input
                    id="priceMax"
                    type="number"
                    min={0}
                    value={draft.priceMax}
                    onChange={(event) => setDraft((d) => ({ ...d, priceMax: event.target.value }))}
                  />
                </Field>
              ) : null}
            </>
          ) : null}

          <Field label="משך הטיפול (דקות)" htmlFor="duration" required>
            <Input
              id="duration"
              type="number"
              min={5}
              max={1440}
              value={draft.durationMinutes}
              onChange={(event) => setDraft((d) => ({ ...d, durationMinutes: Number(event.target.value) }))}
            />
          </Field>

          <Field
            label="זמן התארגנות בין לקוחות (דקות)"
            htmlFor="buffer"
            hint="נלקח בחשבון ביומן כדי למנוע הזמנות צמודות מדי"
          >
            <Input
              id="buffer"
              type="number"
              min={0}
              max={240}
              value={draft.bufferMinutes}
              onChange={(event) => setDraft((d) => ({ ...d, bufferMinutes: Number(event.target.value) }))}
            />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">איפה אפשר להזמין את השירות</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { key: 'atClientHome', label: 'בבית הלקוח' },
                { key: 'atStudio', label: 'בסטודיו' },
                { key: 'atEvent', label: 'באירוע' },
                { key: 'supportsRecurring', label: 'אפשר כמפגש קבוע' },
              ] as const
            ).map((option) => (
              <label
                key={option.key}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm"
              >
                <Checkbox
                  checked={draft[option.key]}
                  onCheckedChange={(checked) => setDraft((d) => ({ ...d, [option.key]: checked === true }))}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <Button block onClick={addService} loading={saving} disabled={!draft.name.trim()}>
          הוספת השירות
        </Button>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack}>
          <ChevronRight className="size-4" aria-hidden />
          חזרה
        </Button>
        <Button block onClick={onDone} disabled={services.length === 0}>
          המשך
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
      </div>
    </section>
  );
}
