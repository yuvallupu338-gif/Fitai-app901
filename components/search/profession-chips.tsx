import Link from 'next/link';
import type { Profession } from '@/types/app';

/** קטגוריות המקצועות – נטענות מהמסד וניתנות להרחבה. */
export function ProfessionChips({ professions }: { professions: Profession[] }) {
  if (professions.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2">
      {professions.map((profession) => (
        <li key={profession.id}>
          <Link
            href={`/search?profession=${profession.id}`}
            className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
          >
            <span>{profession.name}</span>
            {profession.professionals_count > 0 ? (
              <span className="text-xs text-muted-foreground">{profession.professionals_count}</span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
