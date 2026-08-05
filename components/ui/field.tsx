import * as React from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type FieldProps = {
  label?: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
};

/** עטיפה אחידה לשדה בטופס: תווית, רמז, שגיאה וקישור נגיש ביניהם. */
export function Field({ label, htmlFor, error, hint, required, children, className }: FieldProps) {
  const describedBy = [hint ? `${htmlFor}-hint` : null, error ? `${htmlFor}-error` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <Label htmlFor={htmlFor}>
          {label}
          {required ? <span className="text-destructive" aria-hidden> *</span> : null}
        </Label>
      ) : null}

      {React.isValidElement(children) && describedBy
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            'aria-describedby': describedBy,
            'aria-invalid': error ? true : undefined,
          })
        : children}

      {hint && !error ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
