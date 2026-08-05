import type { Metadata } from 'next';
import Link from 'next/link';
import { RegisterFlow } from '@/components/auth/register-flow';
import { getCities } from '@/lib/data/reference';

export const metadata: Metadata = {
  title: 'הרשמה',
  description: 'פתיחת חשבון חדש – בלי אימייל, רק שם משתמש וסיסמה.',
};

export default async function RegisterPage() {
  // רשימת הערים נטענת מהמסד ולא מקוד קבוע.
  const cities = await getCities();

  return (
    <div className="space-y-6 animate-fade-in-up">
      <RegisterFlow cities={cities} />

      <p className="text-center text-sm text-muted-foreground">
        כבר יש לכם חשבון?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          התחברות
        </Link>
      </p>
    </div>
  );
}
