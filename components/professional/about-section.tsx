import { Award, CalendarDays, Car, Info, MapPin, Phone, Store } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { WEEKDAYS } from '@/lib/constants';
import { formatDate, formatPrice } from '@/lib/format';


type AboutProps = {
  professional: {
    bio: string | null;
    accepts_home_visits: boolean;
    accepts_studio: boolean;
    accepts_events: boolean;
    accepts_online: boolean;
    max_travel_km: number | null;
    travel_fee: number;
    travel_fee_type: string;
    cancellation_policy: string | null;
    min_lead_time_minutes: number;
    max_lead_time_days: number;
    website_url: string | null;
    social_links: unknown;
    phone_verified: boolean;
  };
  professions: Array<{ id: string; name: string; slug: string }>;
  serviceAreas: Array<{
    id: string;
    area_name: string | null;
    travel_fee: number;
    cities: { id: string; name: string } | null;
  }>;
  availability: Array<{ id: string; weekday: number; start_time: string; end_time: string; is_break: boolean }>;
  certificates: Array<{ id: string; kind: string; title: string | null; status: string }>;
  contact: { phone: string | null; studio_address: string | null; studio_notes: string | null } | null;
  joinedAt: string;
};

const TRAVEL_FEE_LABELS: Record<string, string> = {
  none: 'ללא תוספת נסיעה',
  fixed: 'תוספת נסיעה קבועה',
  per_km: 'תוספת נסיעה לפי מרחק',
  per_city: 'תוספת נסיעה משתנה לפי עיר',
};

/** לשונית "אודות" – מידע מלא על בעל המקצוע ומדיניות ההזמנות. */
export function AboutSection({
  professional,
  serviceAreas,
  availability,
  certificates,
  contact,
  joinedAt,
}: AboutProps) {
  const workingHours = availability.filter((a) => !a.is_break);
  const breaks = availability.filter((a) => a.is_break);
  const socials = (professional.social_links ?? {}) as Record<string, string>;

  return (
    <div className="space-y-4">
      {professional.bio ? (
        <section className="surface p-4">
          <h3 className="mb-2 font-semibold">קצת עליי</h3>
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{professional.bio}</p>
        </section>
      ) : null}

      <section className="surface space-y-3 p-4">
        <h3 className="font-semibold">איפה נותנים את השירות</h3>
        <ul className="flex flex-wrap gap-1.5">
          {professional.accepts_home_visits ? <Badge variant="secondary">מגיע לבית הלקוח</Badge> : null}
          {professional.accepts_studio ? <Badge variant="secondary">מקבל בסטודיו</Badge> : null}
          {professional.accepts_events ? <Badge variant="secondary">שירות באירועים</Badge> : null}
          {professional.accepts_online ? <Badge variant="secondary">ייעוץ אונליין</Badge> : null}
        </ul>

        {serviceAreas.length > 0 ? (
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <MapPin className="size-4 text-primary" aria-hidden />
              אזורי שירות
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {serviceAreas.map((area) => (
                <li key={area.id}>
                  <Badge variant="outline">
                    {area.cities?.name ?? area.area_name}
                    {Number(area.travel_fee) > 0 ? ` · +${formatPrice(Number(area.travel_fee))}` : ''}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {professional.accepts_home_visits ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Car className="size-4" aria-hidden />
            {TRAVEL_FEE_LABELS[professional.travel_fee_type] ?? ''}
            {Number(professional.travel_fee) > 0 ? ` · ${formatPrice(Number(professional.travel_fee))}` : ''}
            {professional.max_travel_km ? ` · עד ${professional.max_travel_km} ק״מ` : ''}
          </p>
        ) : null}

        {contact?.studio_address ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Store className="size-4" aria-hidden />
            {contact.studio_address}
          </p>
        ) : null}
      </section>

      {workingHours.length > 0 ? (
        <section className="surface p-4">
          <h3 className="mb-2 flex items-center gap-1.5 font-semibold">
            <CalendarDays className="size-4 text-primary" aria-hidden />
            שעות פעילות
          </h3>
          <ul className="space-y-1 text-sm">
            {WEEKDAYS.map((day) => {
              const windows = workingHours.filter((w) => w.weekday === day.value);
              const dayBreaks = breaks.filter((w) => w.weekday === day.value);

              return (
                <li key={day.value} className="flex items-center justify-between gap-2 py-0.5">
                  <span className="text-muted-foreground">יום {day.long}</span>
                  {windows.length === 0 ? (
                    <span className="text-muted-foreground">סגור</span>
                  ) : (
                    <span className="font-medium" dir="ltr">
                      {windows.map((w) => `${w.start_time.slice(0, 5)}–${w.end_time.slice(0, 5)}`).join(', ')}
                      {dayBreaks.length > 0
                        ? ` (הפסקה ${dayBreaks
                            .map((b) => `${b.start_time.slice(0, 5)}–${b.end_time.slice(0, 5)}`)
                            .join(', ')})`
                        : ''}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="surface space-y-2 p-4">
        <h3 className="flex items-center gap-1.5 font-semibold">
          <Info className="size-4 text-primary" aria-hidden />
          מדיניות הזמנות
        </h3>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>
            הזמנה מראש: לפחות{' '}
            {professional.min_lead_time_minutes >= 60
              ? `${Math.round(professional.min_lead_time_minutes / 60)} שעות`
              : `${professional.min_lead_time_minutes} דקות`}{' '}
            מראש, ועד {professional.max_lead_time_days} ימים קדימה.
          </li>
          {professional.cancellation_policy ? <li>{professional.cancellation_policy}</li> : null}
        </ul>
      </section>

      {certificates.length > 0 ? (
        <section className="surface p-4">
          <h3 className="mb-2 flex items-center gap-1.5 font-semibold">
            <Award className="size-4 text-primary" aria-hidden />
            תעודות והסמכות
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {certificates.map((certificate) => (
              <li key={certificate.id}>
                <Badge variant="success">{certificate.title ?? 'תעודה מקצועית מאומתת'}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="surface space-y-2 p-4 text-sm text-muted-foreground">
        {contact?.phone ? (
          <p className="flex items-center gap-1.5">
            <Phone className="size-4" aria-hidden />
            <a href={`tel:${contact.phone}`} className="text-primary hover:underline" dir="ltr">
              {contact.phone}
            </a>
            <span className="text-xs">(נחשף לך כי יש ביניכם הזמנה מאושרת)</span>
          </p>
        ) : professional.phone_verified ? (
          <p className="flex items-center gap-1.5">
            <Phone className="size-4" aria-hidden />
            מספר הטלפון מאומת ויוצג לאחר אישור הזמנה
          </p>
        ) : null}

        {professional.website_url ? (
          <p>
            <a
              href={professional.website_url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-primary hover:underline"
            >
              אתר אינטרנט
            </a>
          </p>
        ) : null}

        {socials.instagram ? (
          <p>
            <a
              href={socials.instagram}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-primary hover:underline"
            >
              אינסטגרם
            </a>
          </p>
        ) : null}

        <p>הצטרף לאפליקציה ב־{formatDate(joinedAt)}</p>
      </section>
    </div>
  );
}
