'use server';

import { getSearchSuggestions } from '@/lib/data/discovery';
import { guard, ok } from '@/lib/actions/result';
import type { ActionResult, SearchSuggestion } from '@/types/app';

/** הצעות השלמה אוטומטית לשורת החיפוש. */
export async function getSuggestionsAction(term: string): Promise<ActionResult<SearchSuggestion[]>> {
  return guard(async () => {
    const suggestions = await getSearchSuggestions(term, 6);
    return ok(suggestions);
  });
}
