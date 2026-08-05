import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';

const LINKS = [
  { href: '/settings/profile', label: 'פרופיל' },
  { href: '/settings/security', label: 'אבטחה' },
  { href: '/settings/privacy', label: 'פרטיות' },
  { href: '/settings/notifications', label: 'התראות' },
  { href: '/settings/addresses', label: 'כתובות' },
  { href: '/settings/safety', label: 'בטיחות' },
  { href: '/settings/account', label: 'חשבון' },
];

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="space-y-4 px-4 py-4 lg:px-0">
      <h1 className="text-xl font-bold">הגדרות</h1>

      <nav className="scroll-x" aria-label="ניווט בהגדרות">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="shrink-0 rounded-full bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
