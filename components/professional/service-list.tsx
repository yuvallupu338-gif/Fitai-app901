import Link from 'next/link';
import { Clock, Home, Repeat, Store, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDuration, formatServicePrice } from '@/lib/format';
import type { Tables } from '@/types/database';

type Service = Tables<'professional_services'>;

/** רשימת השירותים והמחירים של בעל המקצוע, עם הזמנה ישירה. */
export function ServiceList({
  services,
  professionalId,
  isSelf,
  acceptsHomeVisits,
  acceptsStudio,
}: {
  services: Service[];
  professionalId: string;
  isSelf: boolean;
  acceptsHomeVisits: boolean;
  acceptsStudio: boolean;
}) {
  if (services.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="עדיין לא הוגדרו שירותים"
        description={
          isSelf
            ? 'הוסיפו לפחות שירות אחד עם מחיר כדי שהפרופיל יופיע בחיפוש ויוכל לקבל הזמנות.'
            : 'בעל המקצוע עדיין לא פרסם מחירון.'
        }
        action={
          isSelf ? (
            <Button asChild>
              <Link href="/dashboard/pro/services">הוספת שירות</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <ul className="space-y-2">
      {services.map((service) => (
        <li key={service.id} className="surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="font-semibold">{service.name}</h3>
              {service.description ? (
                <p className="text-sm text-muted-foreground">{service.description}</p>
              ) : null}

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <Badge variant="outline">
                  <Clock className="size-3" aria-hidden />
                  {formatDuration(service.duration_minutes)}
                </Badge>
                {service.at_client_home && acceptsHomeVisits ? (
                  <Badge variant="secondary">
                    <Home className="size-3" aria-hidden />
                    בבית הלקוח
                  </Badge>
                ) : null}
                {service.at_studio && acceptsStudio ? (
                  <Badge variant="secondary">
                    <Store className="size-3" aria-hidden />
                    בסטודיו
                  </Badge>
                ) : null}
                {service.at_event ? <Badge variant="secondary">אירועים</Badge> : null}
                {service.supports_recurring ? (
                  <Badge variant="info">
                    <Repeat className="size-3" aria-hidden />
                    אפשר קבוע
                  </Badge>
                ) : null}
                {service.bookings_count > 3 ? (
                  <Badge variant="neutral">{service.bookings_count} הזמנות</Badge>
                ) : null}
              </div>
            </div>

            <div className="shrink-0 text-end">
              <p className="font-bold text-primary">
                {formatServicePrice(
                  service.price_type,
                  service.price_min !== null ? Number(service.price_min) : null,
                  service.price_max !== null ? Number(service.price_max) : null,
                )}
              </p>

              {!isSelf ? (
                <div className="mt-2 flex flex-col gap-1.5">
                  <Button size="sm" asChild>
                    <Link href={`/book/${professionalId}?service=${service.id}`}>הזמנה</Link>
                  </Button>
                  {service.supports_recurring ? (
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={`/book/recurring?professional=${professionalId}&service=${service.id}`}>
                        מפגש קבוע
                      </Link>
                    </Button>
                  ) : null}
                </div>
              ) : (
                <Button size="sm" variant="outline" className="mt-2" asChild>
                  <Link href={`/dashboard/pro/services?edit=${service.id}`}>עריכה</Link>
                </Button>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
