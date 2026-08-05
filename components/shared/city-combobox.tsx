'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { City } from '@/types/app';

type CityComboboxProps = {
  cities: City[];
  value: string | null;
  onChange: (cityId: string | null) => void;
  placeholder?: string;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
};

/**
 * בחירת עיר עם חיפוש והשלמה אוטומטית.
 * הרשימה מגיעה מטבלת cities במסד הנתונים ולא מקוד קבוע.
 */
export function CityCombobox({
  cities,
  value,
  onChange,
  placeholder = 'חיפוש עיר…',
  id,
  invalid,
  disabled,
}: CityComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const selected = cities.find((city) => city.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn(
            'h-11 w-full justify-between rounded-xl px-4 font-normal',
            !selected && 'text-muted-foreground',
            invalid && 'border-destructive',
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <MapPin className="size-4 shrink-0 opacity-60" aria-hidden />
            {selected ? selected.name : 'בחרו עיר'}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            const normalized = search.trim();
            if (!normalized) return 1;
            return itemValue.includes(normalized) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>לא נמצאה עיר בשם הזה</CommandEmpty>
            <CommandGroup>
              {cities.map((city) => (
                <CommandItem
                  key={city.id}
                  value={city.name}
                  onSelect={() => {
                    onChange(city.id === value ? null : city.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('size-4', city.id === value ? 'opacity-100 text-primary' : 'opacity-0')} />
                  <span className="flex-1">{city.name}</span>
                  {city.district ? (
                    <span className="text-xs text-muted-foreground">{city.district}</span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** בחירה מרובה של ערים – לאזורי שירות. */
export function MultiCityPicker({
  cities,
  value,
  onChange,
  max = 30,
}: {
  cities: City[];
  value: string[];
  onChange: (ids: string[]) => void;
  max?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = cities.filter((city) => value.includes(city.id));

  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else if (value.length < max) {
      onChange([...value, id]);
    }
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="h-11 w-full justify-between rounded-xl font-normal">
            <span className="truncate">
              {selected.length ? `נבחרו ${selected.length} אזורי שירות` : 'בחרו אזורי שירות'}
            </span>
            <ChevronsUpDown className="size-4 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command
            filter={(itemValue, search) => (itemValue.includes(search.trim()) ? 1 : 0)}
          >
            <CommandInput placeholder="חיפוש עיר…" />
            <CommandList>
              <CommandEmpty>לא נמצאה עיר</CommandEmpty>
              <CommandGroup>
                {cities.map((city) => (
                  <CommandItem key={city.id} value={city.name} onSelect={() => toggle(city.id)}>
                    <Check
                      className={cn('size-4', value.includes(city.id) ? 'opacity-100 text-primary' : 'opacity-0')}
                    />
                    <span className="flex-1">{city.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((city) => (
            <li key={city.id}>
              <button
                type="button"
                onClick={() => toggle(city.id)}
                className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary transition-colors hover:bg-primary/20"
                aria-label={`הסרת ${city.name}`}
              >
                {city.name} ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
