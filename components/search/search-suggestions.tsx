'use client';

import * as React from 'react';
import { Briefcase, Loader2, MapPin, Scissors, UserRound } from 'lucide-react';
import { getSuggestionsAction } from '@/lib/actions/search';
import type { SearchSuggestion } from '@/types/app';

const ICONS = {
  profession: Scissors,
  city: MapPin,
  professional: UserRound,
  service: Briefcase,
} as const;

const GROUP_LABELS = {
  profession: 'מקצועות',
  city: 'ערים',
  professional: 'בעלי מקצוע',
  service: 'שירותים',
} as const;

/** רשימת השלמה אוטומטית – הצעות מגיעות מהמסד בזמן אמת. */
export function SearchSuggestions({
  term,
  onSelect,
  onClose,
}: {
  term: string;
  onSelect: (suggestion: SearchSuggestion) => void;
  onClose: () => void;
}) {
  const [items, setItems] = React.useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let active = true;
    setLoading(true);

    const timer = setTimeout(async () => {
      const result = await getSuggestionsAction(term);
      if (!active) return;
      setItems(result.ok ? result.data : []);
      setLoading(false);
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [term]);

  React.useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [onClose]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, SearchSuggestion[]>();
    for (const item of items) {
      const list = map.get(item.kind) ?? [];
      if (list.length < 4) list.push(item);
      map.set(item.kind, list);
    }
    return [...map.entries()];
  }, [items]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-2xl border border-border bg-popover shadow-lifted animate-scale-in"
      role="listbox"
      aria-label="הצעות חיפוש"
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          מחפש…
        </div>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          לא נמצאו הצעות. אפשר ללחוץ Enter כדי לחפש בכל זאת.
        </p>
      ) : (
        <div className="max-h-80 overflow-y-auto p-1">
          {grouped.map(([kind, list]) => {
            const Icon = ICONS[kind as keyof typeof ICONS] ?? Briefcase;
            return (
              <div key={kind}>
                <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                  {GROUP_LABELS[kind as keyof typeof GROUP_LABELS]}
                </p>
                {list.map((item) => (
                  <button
                    key={`${item.kind}-${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => onSelect(item)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm hover:bg-accent"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.sublabel ? (
                      <span className="shrink-0 text-xs text-muted-foreground">{item.sublabel}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
