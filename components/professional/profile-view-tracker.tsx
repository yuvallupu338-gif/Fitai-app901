'use client';

import { useEffect } from 'react';
import { recordProfileViewAction } from '@/lib/actions/social';

/** רושם צפייה בפרופיל מקצועי – פעם ביום לכל צופה. */
export function ProfileViewTracker({ professionalId }: { professionalId: string }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      void recordProfileViewAction(professionalId);
    }, 2000);

    return () => clearTimeout(timer);
  }, [professionalId]);

  return null;
}
