'use client';

import { useEffect } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app]', error);
  }, [error]);

  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-3xl bg-destructive/10 text-destructive">
        <TriangleAlert className="size-8" aria-hidden />
      </span>
      <h1 className="text-2xl font-bold">משהו השתבש</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        אירעה שגיאה בטעינת הדף. אפשר לנסות שוב – אם הבעיה חוזרת, נסו לרענן את הדפדפן.
      </p>
      <Button onClick={reset}>נסה שוב</Button>
    </main>
  );
}
