import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className, label = 'טוען…' }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-muted-foreground', className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function FullPageSpinner({ label = 'טוען…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="size-7 animate-spin text-primary" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}
