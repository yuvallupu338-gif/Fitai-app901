'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CityCombobox } from '@/components/shared/city-combobox';
import { saveAddressAction } from '@/lib/actions/profile';
import type { City } from '@/types/app';

type ExistingAddress = {
  id: string;
  label: string;
  city_id: string | null;
  street: string;
  house_number: string | null;
  apartment: string | null;
  floor: string | null;
  entrance_code: string | null;
  arrival_notes: string | null;
  has_parking: boolean | null;
  is_default: boolean;
};

/** הוספה או עריכה של כתובת שירות. */
export function AddressDialog({
  open,
  onOpenChange,
  cities,
  onSaved,
  address,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cities: City[];
  onSaved?: (id: string) => void;
  address?: ExistingAddress | null;
}) {
  const [pending, setPending] = React.useState(false);
  const [form, setForm] = React.useState({
    label: address?.label ?? 'הבית שלי',
    cityId: address?.city_id ?? '',
    street: address?.street ?? '',
    houseNumber: address?.house_number ?? '',
    apartment: address?.apartment ?? '',
    floor: address?.floor ?? '',
    entranceCode: address?.entrance_code ?? '',
    arrivalNotes: address?.arrival_notes ?? '',
    hasParking: address?.has_parking ?? false,
    isDefault: address?.is_default ?? true,
  });

  React.useEffect(() => {
    if (!open) return;
    setForm({
      label: address?.label ?? 'הבית שלי',
      cityId: address?.city_id ?? '',
      street: address?.street ?? '',
      houseNumber: address?.house_number ?? '',
      apartment: address?.apartment ?? '',
      floor: address?.floor ?? '',
      entranceCode: address?.entrance_code ?? '',
      arrivalNotes: address?.arrival_notes ?? '',
      hasParking: address?.has_parking ?? false,
      isDefault: address?.is_default ?? true,
    });
  }, [open, address]);

  const submit = async () => {
    setPending(true);
    const result = await saveAddressAction({ ...form, id: address?.id });
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(result.message ?? 'הכתובת נשמרה');
    onSaved?.(result.data.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{address ? 'עריכת כתובת' : 'הוספת כתובת'}</DialogTitle>
          <DialogDescription>
            הכתובת נשמרת באופן מאובטח ואינה מופיעה בפרופיל הציבורי. היא נחשפת לבעל המקצוע רק לאחר
            אישור ההזמנה.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="שם הכתובת" htmlFor="addr-label">
            <Input
              id="addr-label"
              value={form.label}
              onChange={(event) => setForm((f) => ({ ...f, label: event.target.value }))}
              placeholder="הבית שלי / המשרד"
            />
          </Field>

          <Field label="עיר" htmlFor="addr-city" required>
            <CityCombobox
              id="addr-city"
              cities={cities}
              value={form.cityId || null}
              onChange={(id) => setForm((f) => ({ ...f, cityId: id ?? '' }))}
            />
          </Field>

          <div className="grid grid-cols-3 gap-2">
            <Field label="רחוב" htmlFor="addr-street" required className="col-span-2">
              <Input
                id="addr-street"
                value={form.street}
                onChange={(event) => setForm((f) => ({ ...f, street: event.target.value }))}
              />
            </Field>
            <Field label="מספר" htmlFor="addr-house">
              <Input
                id="addr-house"
                value={form.houseNumber}
                onChange={(event) => setForm((f) => ({ ...f, houseNumber: event.target.value }))}
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Field label="דירה" htmlFor="addr-apartment">
              <Input
                id="addr-apartment"
                value={form.apartment}
                onChange={(event) => setForm((f) => ({ ...f, apartment: event.target.value }))}
              />
            </Field>
            <Field label="קומה" htmlFor="addr-floor">
              <Input
                id="addr-floor"
                value={form.floor}
                onChange={(event) => setForm((f) => ({ ...f, floor: event.target.value }))}
              />
            </Field>
            <Field label="קוד כניסה" htmlFor="addr-code" hint="רשות">
              <Input
                id="addr-code"
                value={form.entranceCode}
                onChange={(event) => setForm((f) => ({ ...f, entranceCode: event.target.value }))}
              />
            </Field>
          </div>

          <Field label="הוראות הגעה" htmlFor="addr-notes">
            <Textarea
              id="addr-notes"
              rows={2}
              value={form.arrivalNotes}
              onChange={(event) => setForm((f) => ({ ...f, arrivalNotes: event.target.value }))}
              placeholder="לדוגמה: הכניסה מהחצר האחורית"
            />
          </Field>

          <div className="flex items-center gap-2">
            <Checkbox
              id="addr-parking"
              checked={form.hasParking}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, hasParking: checked === true }))}
            />
            <Label htmlFor="addr-parking" className="cursor-pointer font-normal">
              יש חניה זמינה
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="addr-default"
              checked={form.isDefault}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, isDefault: checked === true }))}
            />
            <Label htmlFor="addr-default" className="cursor-pointer font-normal">
              כתובת ברירת מחדל
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={submit} loading={pending} disabled={!form.street || !form.cityId}>
            שמירה
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
