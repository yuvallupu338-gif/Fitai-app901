import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

/** מצב ריק מעוצב – משמש בכל רשימה שאין בה עדיין תוכן. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/80 bg-card/50 px-6 py-12 text-center',
        className,
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-primary/8 text-primary">
        <Icon className="size-7" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {description ? <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
