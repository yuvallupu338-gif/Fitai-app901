import type { Metadata } from 'next';
import Link from 'next/link';
import { RegisterFlow } from '@/components/auth/register-flow';

export const metadata: Metadata = {
  title: 'הרשמה',
  description: 'פתיחת חשבון חדש – בלי אימייל, רק שם משתמש וסיסמה.',
};

export default function RegisterPage() {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <RegisterFlow />

      <p className="text-center text-sm text-muted-foreground">
        כבר יש לכם חשבון?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          התחברות
        </Link>
      </p>
    </div>
  );
}
