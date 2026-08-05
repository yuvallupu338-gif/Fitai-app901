import Link from 'next/link';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
        <Compass className="size-8" aria-hidden />
      </span>
      <h1 className="text-2xl font-bold">הדף לא נמצא</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        ייתכן שהקישור השתנה, שהפוסט נמחק או שהפרופיל המקצועי הושהה ואינו מוצג יותר בחיפוש.
      </p>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/">לדף הבית</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/search">לחיפוש</Link>
        </Button>
      </div>
    </main>
  );
}
