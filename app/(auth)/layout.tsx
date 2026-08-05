import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { APP_NAME, APP_TAGLINE } from '@/lib/constants';
import { ThemeToggle } from '@/components/layout/theme-toggle';

/**
 * פריסת מסכי האימות.
 *
 * ההפניה של משתמש מחובר מטופלת ב־middleware ובמסכי ההתחברות והשחזור עצמם,
 * ובכוונה לא כאן: פעולת שרת מרנדרת מחדש את המסלול שממנו נקראה, ולכן הפניה
 * ברמת ה־layout הייתה מקפיצה את המשתמש מיד לאחר ההרשמה – לפני שהספיק לשמור
 * את קוד השחזור שמוצג פעם אחת בלבד.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      {/* רקע עדין בגוון הצבע המוביל */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/0.14),transparent_70%)]"
        aria-hidden
      />

      <header className="flex items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="flex size-9 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
            <Sparkles className="size-5" aria-hidden />
          </span>
          {APP_NAME}
        </Link>
        <ThemeToggle />
      </header>

      <main id="main" className="flex flex-1 items-center justify-center px-5 pb-12">
        <div className="w-full max-w-md">
          {children}
        </div>
      </main>

      <footer className="px-5 pb-6 text-center text-xs text-muted-foreground">
        {APP_TAGLINE}
      </footer>
    </div>
  );
}
