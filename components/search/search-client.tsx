'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BellPlus, Clock, Flame, Search, SlidersHorizontal, Star, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CityCombobox } from '@/components/shared/city-combobox';
import { SearchSuggestions } from '@/components/search/search-suggestions';
import { SORT_OPTIONS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { logSearchAction, saveSearchAction, deleteSavedSearchAction } from '@/lib/actions/social';
import type { City, Profession } from '@/types/app';
import type { Json } from '@/types/database';

type Filters = {
  term: string;
  professionIds: string[];
  cityId: string | null;
  maxDistanceKm: number | null;
  priceMin: number | null;
  priceMax: number | null;
  minRating: number | null;
  minExperience: number | null;
  homeVisit?: boolean;
  studio?: boolean;
  event?: boolean;
  online?: boolean;
  availableToday?: boolean;
  availableNow?: boolean;
  recurring?: boolean;
  verified?: boolean;
  sort: string;
  page: number;
};

const TOGGLES = [
  { key: 'homeVisit', label: 'מגיע הביתה' },
  { key: 'studio', label: 'בסטודיו' },
  { key: 'event', label: 'לאירועים' },
  { key: 'online', label: 'אונליין' },
  { key: 'availableToday', label: 'זמין היום' },
  { key: 'availableNow', label: 'זמין עכשיו' },
  { key: 'recurring', label: 'מפגש קבוע' },
  { key: 'verified', label: 'מאומת' },
] as const;

export function SearchClient({
  cities,
  professions,
  popularSearches,
  recentSearches,
  savedSearches,
  filters,
  isLoggedIn,
}: {
  cities: City[];
  professions: Profession[];
  popularSearches: string[];
  recentSearches: string[];
  savedSearches: Array<{ id: string; name: string; query: Json; notify_on_match: boolean }>;
  filters: Filters;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [term, setTerm] = React.useState(filters.term);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(filters);

  React.useEffect(() => {
    setTerm(filters.term);
    setDraft(filters);
  }, [filters]);

  const applyParams = (next: Partial<Filters>, resetPage = true) => {
    const merged = { ...filters, ...next };
    const params = new URLSearchParams();

    if (merged.term) params.set('term', merged.term);
    if (merged.professionIds.length) params.set('profession', merged.professionIds.join(','));
    if (merged.cityId) params.set('city', merged.cityId);
    if (merged.maxDistanceKm) params.set('distance', String(merged.maxDistanceKm));
    if (merged.priceMin) params.set('priceMin', String(merged.priceMin));
    if (merged.priceMax) params.set('priceMax', String(merged.priceMax));
    if (merged.minRating) params.set('rating', String(merged.minRating));
    if (merged.minExperience) params.set('experience', String(merged.minExperience));
    for (const toggle of TOGGLES) {
      if (merged[toggle.key]) params.set(toggle.key, 'true');
    }
    if (merged.sort && merged.sort !== 'recommended') params.set('sort', merged.sort);
    if (!resetPage && merged.page > 1) params.set('page', String(merged.page));

    router.push(`/search?${params.toString()}`);
  };

  const submitSearch = (value: string) => {
    setShowSuggestions(false);
    if (value.trim()) void logSearchAction(value.trim(), 0);
    applyParams({ term: value.trim() });
  };

  const activeFilterCount =
    (filters.professionIds.length ? 1 : 0) +
    (filters.maxDistanceKm ? 1 : 0) +
    (filters.priceMin || filters.priceMax ? 1 : 0) +
    (filters.minRating ? 1 : 0) +
    (filters.minExperience ? 1 : 0) +
    TOGGLES.filter((toggle) => filters[toggle.key]).length;

  const saveCurrentSearch = async () => {
    const name = filters.term || professions.find((p) => p.id === filters.professionIds[0])?.name || 'החיפוש שלי';
    const result = await saveSearchAction({
      name,
      query: Object.fromEntries(searchParams.entries()),
      notifyOnMatch: true,
    });

    if (result.ok) toast.success(result.message ?? 'החיפוש נשמר');
    else toast.error(result.error);
  };

  return (
    <div className="space-y-3">
      {/* שורת החיפוש */}
      <div className="relative">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch(term);
          }}
          role="search"
        >
          <label htmlFor="search-term" className="sr-only">
            חיפוש בעלי מקצוע
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="search-term"
              value={term}
              onChange={(event) => {
                setTerm(event.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="נסו: ספר שמגיע הביתה, מניקוריסטית פנויה היום…"
              className="h-12 ps-10 pe-10"
              autoComplete="off"
            />
            {term ? (
              <button
                type="button"
                onClick={() => {
                  setTerm('');
                  applyParams({ term: '' });
                }}
                className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted"
                aria-label="ניקוי החיפוש"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        </form>

        {showSuggestions && term.trim().length >= 2 ? (
          <SearchSuggestions
            term={term}
            onSelect={(suggestion) => {
              setShowSuggestions(false);
              if (suggestion.kind === 'city') {
                applyParams({ cityId: suggestion.id, term: '' });
              } else if (suggestion.kind === 'profession') {
                applyParams({ professionIds: [suggestion.id], term: '' });
              } else {
                submitSearch(suggestion.label);
              }
            }}
            onClose={() => setShowSuggestions(false)}
          />
        ) : null}
      </div>

      {/* עיר, מיון ומסננים */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-40 flex-1">
          <CityCombobox
            cities={cities}
            value={filters.cityId}
            onChange={(cityId) => applyParams({ cityId })}
          />
        </div>

        <Select value={filters.sort} onValueChange={(value) => applyParams({ sort: value })}>
          <SelectTrigger className="w-40" aria-label="מיון תוצאות">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="relative h-11 rounded-xl">
              <SlidersHorizontal className="size-4" aria-hidden />
              מסננים
              {activeFilterCount > 0 ? (
                <span className="absolute -end-1 -top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>
          </SheetTrigger>

          <SheetContent side="bottom" className="max-h-[85dvh]">
            <SheetHeader>
              <SheetTitle>מסננים</SheetTitle>
            </SheetHeader>

            <div className="space-y-5 pb-4">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">מקצוע</legend>
                <div className="flex flex-wrap gap-2">
                  {professions
                    .filter((p) => p.slug !== 'other')
                    .map((profession) => {
                      const selected = draft.professionIds.includes(profession.id);
                      return (
                        <button
                          key={profession.id}
                          type="button"
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              professionIds: selected
                                ? current.professionIds.filter((id) => id !== profession.id)
                                : [...current.professionIds, profession.id],
                            }))
                          }
                          aria-pressed={selected}
                          className={cn(
                            'rounded-full border px-3 py-1.5 text-sm transition-colors',
                            selected
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border hover:bg-muted',
                          )}
                        >
                          {profession.name}
                        </button>
                      );
                    })}
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">סוג שירות וזמינות</legend>
                <div className="grid grid-cols-2 gap-2">
                  {TOGGLES.map((toggle) => (
                    <label
                      key={toggle.key}
                      className="flex cursor-pointer items-center gap-2 rounded-xl border border-border p-2.5 text-sm"
                    >
                      <Checkbox
                        checked={Boolean(draft[toggle.key])}
                        onCheckedChange={(checked) =>
                          setDraft((current) => ({ ...current, [toggle.key]: checked === true ? true : undefined }))
                        }
                      />
                      {toggle.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="priceMin">מחיר מ־</Label>
                  <Input
                    id="priceMin"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={draft.priceMin ?? ''}
                    onChange={(event) =>
                      setDraft((c) => ({ ...c, priceMin: event.target.value ? Number(event.target.value) : null }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="priceMax">עד</Label>
                  <Input
                    id="priceMax"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={draft.priceMax ?? ''}
                    onChange={(event) =>
                      setDraft((c) => ({ ...c, priceMax: event.target.value ? Number(event.target.value) : null }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="distance">מרחק מקסימלי: {draft.maxDistanceKm ?? 'ללא הגבלה'} ק״מ</Label>
                <input
                  id="distance"
                  type="range"
                  min={0}
                  max={150}
                  step={5}
                  value={draft.maxDistanceKm ?? 0}
                  onChange={(event) =>
                    setDraft((c) => ({ ...c, maxDistanceKm: Number(event.target.value) || null }))
                  }
                  className="w-full accent-[hsl(var(--primary))]"
                />
              </div>

              <div className="space-y-2">
                <Label>דירוג מינימלי</Label>
                <div className="flex gap-2">
                  {[0, 3, 4, 4.5].map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      onClick={() => setDraft((c) => ({ ...c, minRating: rating || null }))}
                      aria-pressed={(draft.minRating ?? 0) === rating}
                      className={cn(
                        'flex flex-1 items-center justify-center gap-1 rounded-xl border px-2 py-2 text-sm',
                        (draft.minRating ?? 0) === rating
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border',
                      )}
                    >
                      {rating === 0 ? (
                        'הכול'
                      ) : (
                        <>
                          <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
                          {rating}+
                        </>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="experience">שנות ניסיון מינימליות</Label>
                <Input
                  id="experience"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={70}
                  value={draft.minExperience ?? ''}
                  onChange={(event) =>
                    setDraft((c) => ({ ...c, minExperience: event.target.value ? Number(event.target.value) : null }))
                  }
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  block
                  onClick={() => {
                    applyParams(draft);
                    setFiltersOpen(false);
                  }}
                >
                  הצגת התוצאות
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const cleared: Filters = {
                      term: filters.term,
                      professionIds: [],
                      cityId: filters.cityId,
                      maxDistanceKm: null,
                      priceMin: null,
                      priceMax: null,
                      minRating: null,
                      minExperience: null,
                      sort: 'recommended',
                      page: 1,
                    };
                    setDraft(cleared);
                    applyParams(cleared);
                    setFiltersOpen(false);
                  }}
                >
                  ניקוי
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {isLoggedIn && (filters.term || activeFilterCount > 0) ? (
          <Button variant="ghost" size="icon" onClick={saveCurrentSearch} aria-label="שמירת החיפוש והתראה על התאמות">
            <BellPlus className="size-5" aria-hidden />
          </Button>
        ) : null}
      </div>

      {/* מסננים פעילים */}
      {activeFilterCount > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {filters.professionIds.map((id) => {
            const profession = professions.find((p) => p.id === id);
            if (!profession) return null;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() =>
                    applyParams({ professionIds: filters.professionIds.filter((p) => p !== id) })
                  }
                  className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary"
                >
                  {profession.name}
                  <X className="size-3" aria-hidden />
                </button>
              </li>
            );
          })}
          {TOGGLES.filter((toggle) => filters[toggle.key]).map((toggle) => (
            <li key={toggle.key}>
              <button
                type="button"
                onClick={() => applyParams({ [toggle.key]: undefined } as Partial<Filters>)}
                className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary"
              >
                {toggle.label}
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* חיפושים אחרונים, פופולריים ושמורים */}
      {!filters.term && activeFilterCount === 0 ? (
        <div className="space-y-3">
          {recentSearches.length > 0 ? (
            <section className="space-y-2">
              <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <Clock className="size-3.5" aria-hidden />
                חיפושים אחרונים
              </h2>
              <ul className="flex flex-wrap gap-1.5">
                {recentSearches.map((item) => (
                  <li key={item}>
                    <button
                      type="button"
                      onClick={() => submitSearch(item)}
                      className="rounded-full bg-muted px-3 py-1.5 text-sm hover:bg-muted/70"
                    >
                      {item}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {popularSearches.length > 0 ? (
            <section className="space-y-2">
              <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <Flame className="size-3.5" aria-hidden />
                חיפושים פופולריים
              </h2>
              <ul className="flex flex-wrap gap-1.5">
                {popularSearches.map((item) => (
                  <li key={item}>
                    <button
                      type="button"
                      onClick={() => submitSearch(item)}
                      className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted"
                    >
                      {item}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {savedSearches.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">חיפושים שמורים</h2>
              <ul className="space-y-1.5">
                {savedSearches.map((item) => (
                  <li key={item.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/search?${new URLSearchParams(item.query as Record<string, string>).toString()}`)
                      }
                      className="flex flex-1 items-center gap-2 rounded-xl border border-border px-3 py-2 text-start text-sm hover:bg-muted"
                    >
                      <span className="flex-1">{item.name}</span>
                      {item.notify_on_match ? <Badge variant="secondary">התראות</Badge> : null}
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`מחיקת החיפוש ${item.name}`}
                      onClick={async () => {
                        const result = await deleteSavedSearchAction(item.id);
                        if (result.ok) {
                          toast.success('החיפוש נמחק');
                          router.refresh();
                        }
                      }}
                    >
                      <X className="size-4" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
