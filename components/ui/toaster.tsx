'use client';

import { Toaster as SonnerToaster } from 'sonner';
import { useTheme } from 'next-themes';

/** הודעות הצלחה ושגיאה. ממוקם ב־RTL בתחתית המסך בטלפון. */
export function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <SonnerToaster
      dir="rtl"
      position="top-center"
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      closeButton
      richColors
      toastOptions={{
        classNames: {
          toast: 'rounded-2xl border border-border shadow-lifted font-sans',
          description: 'text-muted-foreground',
        },
      }}
    />
  );
}
