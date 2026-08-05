import Link from 'next/link';
import {
  Bell,
  KeyRound,
  MapPin,
  Shield,
  Sparkles,
  UserCog,
  UserRound,
} from 'lucide-react';
import { getSession } from '@/lib/auth/session';

const SECTIONS = [
  { href: '/settings/profile', label: 'פרופיל אישי', description: 'שם, שם משתמש, עיר ותמונה', icon: UserRound },
  { href: '/settings/security', label: 'אבטחה', description: 'סיסמה, קוד שחזור והתחברויות', icon: KeyRound },
  { href: '/settings/privacy', label: 'פרטיות', description: 'מי רואה מה בפרופיל שלכם', icon: Shield },
  { href: '/settings/notifications', label: 'התראות', description: 'אילו התראות לקבל ואיך', icon: Bell },
  { href: '/settings/addresses', label: 'כתובות', description: 'כתובות לביקורי בית', icon: MapPin },
  { href: '/settings/safety', label: 'בטיחות', description: 'אישור הורה וחסימות', icon: Shield },
  { href: '/settings/account', label: 'החשבון שלי', description: 'הורדת נתונים ומחיקת חשבון', icon: UserCog },
];

export default async function SettingsIndexPage() {
  const session = await getSession();

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {SECTIONS.map((section) => (
        <li key={section.href}>
          <Link href={section.href} className="surface surface-hover flex items-center gap-3 p-4">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <section.icon className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block font-medium">{section.label}</span>
              <span className="block text-xs text-muted-foreground">{section.description}</span>
            </span>
          </Link>
        </li>
      ))}

      <li>
        <Link
          href={session?.user.isProfessional ? '/dashboard/pro/settings' : '/pro/onboarding'}
          className="surface surface-hover flex items-center gap-3 border-primary/30 bg-primary/5 p-4"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <span>
            <span className="block font-medium">
              {session?.user.isProfessional ? 'הגדרות מקצועיות' : 'הפוך לבעל מקצוע'}
            </span>
            <span className="block text-xs text-muted-foreground">
              {session?.user.isProfessional
                ? 'השהיית פרופיל, אימות ותעודות'
                : 'פרסמו את העבודות שלכם וקבלו הזמנות'}
            </span>
          </span>
        </Link>
      </li>
    </ul>
  );
}
