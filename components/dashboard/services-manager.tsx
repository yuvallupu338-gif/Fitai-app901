'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { formatDuration, formatServicePrice } from '@/lib/format';
import { deleteServiceAction, saveServiceAction } from '@/lib/actions/professional';
import type { Profession } from '@/types/app';
import type { Tables } from '@/types/database';

type Service = Tables<'professional_services'>;

const EMPTY = {
  id: undefined as string | undefined,
  name: '',
  description: '',
  professionId: null as string | null,
  priceType: 'fixed' as 'fixed' | 'range' | 'on_request',
  priceMin: '',
  priceMax: '',
  durationMinutes: 60,
  bufferMinutes: 15,
  atClientHome: true,
  atStudio: false,
  atEvent: false,
  supportsRecurring: true,
  isActive: true,
};

/** ניהול מלא של השירותים והמחירים. */
export function ServicesManager({
  services,
  professions,
}: {
  services: Service[];
  professions: Profession[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [form, setForm] = React.useState(EMPTY);

  const openNew = () => {
    setForm(EMPTY);
    setOpen(true);
  };

  const openEdit = (service: Service) => {
    setForm({
      id: service.id,
      name: service.name,
      description: service.description ?? '',
      professionId: service.profession_id,
      priceType: service.price_type,
      priceMin: service.price_min !== null ? String(service.price_min) : '',
      priceMax: service.price_max !== null ? String(service.price_max) : '',
      durationMinutes: service.duration_minutes,
      bufferMinutes: service.buffer_minutes,
      atClientHome: service.at_client_home,
      atStudio: service.at_studio,
      atEvent: service.at_event,
      supportsRecurring: service.supports_recurring,
      isActive: service.is_active,
    });
    setOpen(true);
  };

  const save = async () => {
    setPending(true);
    const result = await saveServiceAction({
      ...form,
      priceMin: form.priceMin ? Number(form.priceMin) : null,
      priceMax: form.priceMax ? Number(form.priceMax) : null,
      imageUrl: null,
    });
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(result.message ?? 'השירות נשמר');
    setOpen(false);
    router.refresh();
  };

  const remove = async (id: string) => {
    const result = await deleteServiceAction(id);
    if (result.ok) {
      toast.success('השירות הוסר');
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="space-y-4">
      <Button onClick={openNew}>
        <Plus className="size-4" aria-hidden />
        הוספת שירות
      </Button>

      {services.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="עדיין אין שירותים"
          description="הוסיפו לפחות שירות אחד עם מחיר כדי שהפרופיל יופיע בחיפוש ויוכל לקבל הזמנות."
        />
      ) : (
        <ul className="space-y-2">
          {services.map((service) => (
            <li key={service.id} className="surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{service.name}</h2>
                    {!service.is_active ? <Badge variant="neutral">לא פעיל</Badge> : null}
                    {service.supports_recurring ? <Badge variant="info">אפשר קבוע</Badge> : null}
                  </div>
                  {service.description ? (
                    <p className="text-sm text-muted-foreground">{service.description}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDuration(service.duration_minutes)}
                    {service.buffer_minutes ? ` · ${service.buffer_minutes} דק׳ התארגנות` : ''}
                    {service.bookings_count ? ` · ${service.bookings_count} הזמנות` : ''}
                  </p>
                </div>

                <div className="shrink-0 text-end">
                  <p className="font-bold text-primary">
                    {formatServicePrice(
                      service.price_type,
                      service.price_min !== null ? Number(service.price_min) : null,
                      service.price_max !== null ? Number(service.price_max) : null,
                    )}
                  </p>
                  <div className="mt-1 flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openEdit(service)}
                      aria-label={`עריכת ${service.name}`}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`מחיקת ${service.name}`}>
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogTitle>למחוק את השירות?</AlertDialogTitle>
                        <AlertDialogDescription>
                          השירות יוסר מהפרופיל ולא יהיה ניתן להזמנה. הזמנות קיימות יישארו.
                        </AlertDialogDescription>
                        <AlertDialogFooter>
                          <AlertDialogAction
                            onClick={(event) => {
                              event.preventDefault();
                              void remove(service.id);
                            }}
                          >
                            מחיקה
                          </AlertDialogAction>
                          <AlertDialogCancel>ביטול</AlertDialogCancel>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? 'עריכת שירות' : 'שירות חדש'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <Field label="שם השירות" htmlFor="svc-name" required>
              <Input
                id="svc-name"
                value={form.name}
                onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
              />
            </Field>

            <Field label="תיאור" htmlFor="svc-desc">
              <Textarea
                id="svc-desc"
                rows={2}
                value={form.description}
                onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="קטגוריה" htmlFor="svc-profession">
                <Select
                  value={form.professionId ?? 'none'}
                  onValueChange={(value) =>
                    setForm((f) => ({ ...f, professionId: value === 'none' ? null : value }))
                  }
                >
                  <SelectTrigger id="svc-profession">
                    <SelectValue />
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

              <Field label="סוג תמחור" htmlFor="svc-price-type">
                <Select
                  value={form.priceType}
                  onValueChange={(value) => setForm((f) => ({ ...f, priceType: value as typeof f.priceType }))}
                >
                  <SelectTrigger id="svc-price-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">מחיר קבוע</SelectItem>
                    <SelectItem value="range">טווח מחירים</SelectItem>
                    <SelectItem value="on_request">מחיר לאחר שיחה</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {form.priceType !== 'on_request' ? (
                <>
                  <Field label={form.priceType === 'range' ? 'מ־ (₪)' : 'מחיר (₪)'} htmlFor="svc-min" required>
                    <Input
                      id="svc-min"
                      type="number"
                      min={0}
                      value={form.priceMin}
                      onChange={(event) => setForm((f) => ({ ...f, priceMin: event.target.value }))}
                    />
                  </Field>
                  {form.priceType === 'range' ? (
                    <Field label="עד (₪)" htmlFor="svc-max" required>
                      <Input
                        id="svc-max"
                        type="number"
                        min={0}
                        value={form.priceMax}
                        onChange={(event) => setForm((f) => ({ ...f, priceMax: event.target.value }))}
                      />
                    </Field>
                  ) : null}
                </>
              ) : null}

              <Field label="משך (דקות)" htmlFor="svc-duration" required>
                <Input
                  id="svc-duration"
                  type="number"
                  min={5}
                  max={1440}
                  value={form.durationMinutes}
                  onChange={(event) => setForm((f) => ({ ...f, durationMinutes: Number(event.target.value) }))}
                />
              </Field>

              <Field label="זמן התארגנות (דקות)" htmlFor="svc-buffer">
                <Input
                  id="svc-buffer"
                  type="number"
                  min={0}
                  max={240}
                  value={form.bufferMinutes}
                  onChange={(event) => setForm((f) => ({ ...f, bufferMinutes: Number(event.target.value) }))}
                />
              </Field>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">זמינות השירות</legend>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { key: 'atClientHome', label: 'בבית הלקוח' },
                    { key: 'atStudio', label: 'בסטודיו' },
                    { key: 'atEvent', label: 'באירוע' },
                    { key: 'supportsRecurring', label: 'אפשר כמפגש קבוע' },
                    { key: 'isActive', label: 'פעיל' },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.key}
                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm"
                  >
                    <Checkbox
                      checked={form[option.key]}
                      onCheckedChange={(checked) => setForm((f) => ({ ...f, [option.key]: checked === true }))}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <DialogFooter>
            <Button onClick={save} loading={pending} disabled={!form.name.trim()}>
              שמירה
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
