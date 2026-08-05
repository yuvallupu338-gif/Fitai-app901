'use client';

import { useEffect } from 'react';
import { recordPostViewAction } from '@/lib/actions/posts';

/** רושם צפייה בפוסט לאחר שהייה קצרה במסך. */
export function PostViewTracker({ postId }: { postId: string }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      void recordPostViewAction(postId);
    }, 2500);

    return () => clearTimeout(timer);
  }, [postId]);

  return null;
}
