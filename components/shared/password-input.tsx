'use client';

import * as React from 'react';
import { Eye, EyeOff, Check, X } from 'lucide-react';
import { Input, type InputProps } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** מד חוזק סיסמה – זהה לחישוב שמתבצע בשרת. */
export function evaluatePassword(password: string) {
  const hasLetter = /[A-Za-zא-ת]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9א-ת]/.test(password);
  const longEnough = password.length >= 8;
  const meetsMinimum = longEnough && hasLetter && hasDigit;

  let score = 0;
  if (longEnough) score += 1;
  if (password.length >= 12) score += 1;
  if (hasLetter && hasDigit) score += 1;
  if (hasSymbol || password.length >= 16) score += 1;
  if (!meetsMinimum) score = Math.min(score, 1);

  return {
    score,
    meetsMinimum,
    checks: { longEnough, hasLetter, hasDigit, hasSymbol },
    label: ['חלשה מאוד', 'חלשה', 'בינונית', 'טובה', 'חזקה מאוד'][score],
  };
}

const BAR_COLORS = [
  'bg-destructive',
  'bg-destructive',
  'bg-warning',
  'bg-success/70',
  'bg-success',
];

export const PasswordInput = React.forwardRef<HTMLInputElement, InputProps & { showToggle?: boolean }>(
  ({ showToggle = true, className, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={cn('pe-11', className)}
          autoComplete={props.autoComplete ?? 'current-password'}
          {...props}
        />
        {showToggle ? (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute end-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={visible ? 'הסתרת הסיסמה' : 'הצגת הסיסמה'}
            aria-pressed={visible}
            tabIndex={-1}
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        ) : null}
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';

export function PasswordStrength({ password }: { password: string }) {
  const result = evaluatePassword(password);

  if (!password) return null;

  const requirements = [
    { ok: result.checks.longEnough, label: 'לפחות שמונה תווים' },
    { ok: result.checks.hasLetter, label: 'לפחות אות אחת' },
    { ok: result.checks.hasDigit, label: 'לפחות ספרה אחת' },
  ];

  return (
    <div className="space-y-2 animate-fade-in">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" role="img" aria-label={`חוזק הסיסמה: ${result.label}`}>
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors duration-300',
                index < result.score ? BAR_COLORS[result.score] : 'bg-muted',
              )}
            />
          ))}
        </div>
        <span
          className={cn(
            'text-xs font-medium',
            result.score >= 3 ? 'text-success' : result.score >= 2 ? 'text-warning' : 'text-destructive',
          )}
        >
          {result.label}
        </span>
      </div>

      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-3">
        {requirements.map((req) => (
          <li
            key={req.label}
            className={cn('flex items-center gap-1 text-xs', req.ok ? 'text-success' : 'text-muted-foreground')}
          >
            {req.ok ? <Check className="size-3" aria-hidden /> : <X className="size-3" aria-hidden />}
            {req.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
