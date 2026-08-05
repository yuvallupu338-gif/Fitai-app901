import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** אריח מדד בלוח הבקרה. */
export function StatTile({
  label,
  value,
  icon: Icon,
  href,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  href?: string;
  hint?: string;
  tone?: 'default' | 'primary' | 'success' | 'warning';
}) {
  const tones = {
    default: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/12 text-success',
    warning: 'bg-warning/15 text-warning',
  };

  const content = (
    <div className={cn('surface flex items-center gap-3 p-4', href && 'surface-hover')}>
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-xl font-bold leading-tight">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        {hint ? <p className="truncate text-[11px] text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}
