import { WifiOff } from 'lucide-react';

export const metadata = { title: 'אין חיבור לאינטרנט' };

export default function OfflinePage() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-3xl bg-muted text-muted-foreground">
        <WifiOff className="size-8" aria-hidden />
      </span>
      <h1 className="text-2xl font-bold">אין חיבור לאינטרנט</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        התוכן באפליקציה מתעדכן בזמן אמת ולכן דרוש חיבור פעיל. ברגע שהחיבור יחזור, אפשר לרענן את הדף.
      </p>
    </main>
  );
}
