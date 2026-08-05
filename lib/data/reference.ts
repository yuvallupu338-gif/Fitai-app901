import 'server-only';
import { cache } from 'react';
import { createAnonClient } from '@/lib/supabase/server';
import type { City, Profession } from '@/types/app';

/** רשימת הערים – נטענת מהמסד ונשמרת במטמון (משתנה לעיתים רחוקות). */
export const getCities = cache(async (): Promise<City[]> => {
  const supabase = createAnonClient();
  const { data } = await supabase
    .from('cities')
    .select('id, name, district')
    .eq('is_active', true)
    .order('population', { ascending: false, nullsFirst: false })
    .order('name');

  return data ?? [];
});

export const getCityById = cache(async (id: string): Promise<City | null> => {
  const cities = await getCities();
  return cities.find((c) => c.id === id) ?? null;
});

/**
 * רשימת המקצועות – מגיעה תמיד מהמסד ולא מקוד קבוע,
 * כך שמקצוע חדש שאושר על ידי מנהל מופיע מיד בכל האפליקציה.
 */
export const getProfessions = cache(async (): Promise<Profession[]> => {
  const supabase = createAnonClient();
  const { data } = await supabase
    .from('professions')
    .select('id, slug, name, description, icon, category, professionals_count')
    .eq('is_active', true)
    .order('sort_order')
    .order('name');

  return data ?? [];
});

/** המקצועות שיש בהם בעלי מקצוע פעילים – להצגה בעמוד הגילוי. */
export const getPopularProfessions = cache(async (limit = 8): Promise<Profession[]> => {
  const professions = await getProfessions();
  return professions
    .filter((p) => p.slug !== 'other')
    .sort((a, b) => b.professionals_count - a.professionals_count)
    .slice(0, limit);
});

export const getPopularSearches = cache(async (limit = 8): Promise<string[]> => {
  const supabase = createAnonClient();
  const { data } = await supabase
    .from('popular_searches')
    .select('term')
    .order('hits', { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => row.term);
});
