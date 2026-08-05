'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
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
import { AddressDialog } from '@/components/booking/address-dialog';
import { deleteAddressAction } from '@/lib/actions/profile';
import type { City } from '@/types/app';
import type { Tables } from '@/types/database';

type Address = Tables<'service_addresses'> & { cities: { id: string; name: string } | null };

/** ניהול הכתובות של המשתמש לביקורי בית. */
export function AddressManager({ addresses, cities }: { addresses: Address[]; cities: City[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Address | null>(null);

  const remove = async (id: string) => {
    const result = await deleteAddressAction(id);
    if (result.ok) {
      toast.success('הכתובת נמחקה');
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="space-y-4">
      <Button
        onClick={() => {
          setEditing(null);
          setOpen(true);
        }}
      >
        <Plus className="size-4" aria-hidden />
        הוספת כתובת
      </Button>

      {addresses.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="אין כתובות שמורות"
          description="הוסיפו כתובת כדי להזמין בעלי מקצוע עד הבית. הכתובת נחשפת רק לאחר אישור הזמנה."
        />
      ) : (
        <ul className="space-y-2">
          {addresses.map((address) => (
            <li key={address.id} className="surface flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium">
                  {address.label}
                  {address.is_default ? <Badge variant="default">ברירת מחדל</Badge> : null}
                </p>
                <p className="text-sm text-muted-foreground">
                  {address.street} {address.house_number}
                  {address.apartment ? `, דירה ${address.apartment}` : ''}
                  {address.floor ? `, קומה ${address.floor}` : ''}
                  {address.cities?.name ? `, ${address.cities.name}` : ''}
                </p>
                {address.arrival_notes ? (
                  <p className="text-xs text-muted-foreground">{address.arrival_notes}</p>
                ) : null}
              </div>

              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`עריכת ${address.label}`}
                  onClick={() => {
                    setEditing(address);
                    setOpen(true);
                  }}
                >
                  <Pencil className="size-4" aria-hidden />
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`מחיקת ${address.label}`}>
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogTitle>למחוק את הכתובת?</AlertDialogTitle>
                    <AlertDialogDescription>
                      הזמנות קיימות שמקושרות לכתובת יישארו ללא שינוי.
                    </AlertDialogDescription>
                    <AlertDialogFooter>
                      <AlertDialogAction
                        onClick={(event) => {
                          event.preventDefault();
                          void remove(address.id);
                        }}
                      >
                        מחיקה
                      </AlertDialogAction>
                      <AlertDialogCancel>ביטול</AlertDialogCancel>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddressDialog
        open={open}
        onOpenChange={setOpen}
        cities={cities}
        address={editing}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
