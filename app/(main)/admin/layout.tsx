import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Shield } from 'lucide-react';
import { getSession } from '@/lib/auth/session';

const LINKS = [
  { href: '/admin', label: 'סקירה' },
  { href: '/admin/users', label: 'משתמשים' },
  { href: '/admin/professionals', label: 'בעלי מקצוע' },
  { href: '/admin/professions', label: 'מקצועות' },
  { href: '/admin/reports', label: 'דיווחים' },
  { href: '/admin/verifications', label: 'אימותים' },
];

/** אזור הניהול. ההרשאה נבדקת גם כאן וגם ב־RLS במסד הנתונים. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!session) redirect('/login');
  if (session.user.role !== 'admin' && session.user.role !== 'moderator') redirect('/');

  return (
    <div className="space-y-4 px-4 py-4 lg:px-0">
      <header className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Shield className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-xl font-bold">פאנל ניהול</h1>
          <p className="text-xs text-muted-foreground">
            מחובר כ־{session.user.fullName} ({session.user.role === 'admin' ? 'מנהל' : 'מנחה'})
          </p>
        </div>
      </header>

      <nav className="scroll-x" aria-label="ניווט בפאנל הניהול">
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
