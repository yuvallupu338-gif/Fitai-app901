'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Briefcase, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { switchModeAction } from '@/lib/actions/profile';
import type { SessionUser } from '@/lib/auth/session';

/**
 * מעבר בין מצב משתמש למצב בעל מקצוע.
 * אותו חשבון – שתי חוויות שונות.
 */
export function ModeSwitcher({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [mode, setMode] = React.useState(user.activeMode);

  React.useEffect(() => setMode(user.activeMode), [user.activeMode]);

  const change = (next: 'user' | 'professional') => {
    if (next === mode || pending) return;
    setMode(next);

    startTransition(async () => {
      const result = await switchModeAction(next);
      if (!result.ok) {
        setMode(mode);
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'המצב הוחלף');
      router.replace(next === 'professional' ? '/dashboard/pro' : '/');
      router.refresh();
    });
  };

  return (
    <div
      className="flex items-center gap-0.5 rounded-full bg-muted p-0.5"
      role="group"
      aria-label="מעבר בין מצב משתמש למצב בעל מקצוע"
    >
      {(
        [
          { value: 'user', label: 'משתמש', icon: UserRound },
          { value: 'professional', label: 'בעל מקצוע', icon: Briefcase },
        ] as const
      ).map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => change(option.value)}
          aria-pressed={mode === option.value}
          disabled={pending}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
            mode === option.value
              ? 'bg-card text-foreground shadow-soft'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <option.icon className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
