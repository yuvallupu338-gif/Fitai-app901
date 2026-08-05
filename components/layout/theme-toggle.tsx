'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** מעבר בין מצב בהיר, כהה ומצב המערכת. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const options = [
    { value: 'light', label: 'בהיר', icon: Sun },
    { value: 'dark', label: 'כהה', icon: Moon },
    { value: 'system', label: 'לפי המערכת', icon: Monitor },
  ] as const;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={className} aria-label="בחירת ערכת נושא">
          {mounted && theme === 'dark' ? <Moon className="size-5" /> : <Sun className="size-5" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => setTheme(option.value)}
            className={mounted && theme === option.value ? 'bg-accent' : undefined}
          >
            <option.icon className="size-4" aria-hidden />
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
