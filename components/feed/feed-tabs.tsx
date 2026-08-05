'use client';

import Link from 'next/link';
import { FEED_TABS, type FeedTab } from '@/lib/constants';
import { cn } from '@/lib/utils';

/** לשוניות הפיד. שומרות על ניווט אמיתי כדי שהמצב יישמר בכתובת. */
export function FeedTabs({ active }: { active: FeedTab }) {
  return (
    <nav aria-label="סינון הפיד" className="scroll-x px-4 lg:px-0">
      {FEED_TABS.map((tab) => (
        <Link
          key={tab.value}
          href={tab.value === 'for_you' ? '/' : `/?tab=${tab.value}`}
          aria-current={active === tab.value ? 'page' : undefined}
          className={cn(
            'shrink-0 snap-start rounded-full px-4 py-2 text-sm font-medium transition-colors',
            active === tab.value
              ? 'bg-primary text-primary-foreground shadow-soft'
              : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
