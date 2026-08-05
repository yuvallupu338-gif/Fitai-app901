'use server';

import { getFeed } from '@/lib/data/discovery';
import { guard, ok } from '@/lib/actions/result';
import { PAGE_SIZE } from '@/lib/constants';
import type { ActionResult, FeedPost } from '@/types/app';

/** טעינת עמוד נוסף בפיד (גלילה אינסופית). */
export async function loadFeedPageAction(
  tab: string,
  cityId: string | null,
  offset: number,
): Promise<ActionResult<{ posts: FeedPost[]; hasMore: boolean }>> {
  return guard(async () => {
    const { posts, total } = await getFeed({
      tab,
      cityId,
      limit: PAGE_SIZE.feed,
      offset,
    });

    return ok({ posts, hasMore: offset + posts.length < total });
  });
}
