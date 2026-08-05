import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = {
  title: 'התחברות',
  description: 'התחברות לחשבון בעזרת שם משתמש וסיסמה.',
};

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect('/');

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">ברוכים השבים</h1>
        <p className="text-sm text-muted-foreground">התחברו עם שם המשתמש והסיסמה שלכם</p>
      </div>

      <div className="surface p-6">
        <LoginForm />
      </div>

      <p className="text-center text-sm text-muted-foreground">
        עדיין אין לכם חשבון?{' '}
        <Link href="/register" className="font-medium text-primary hover:underline">
          הרשמה חינם
        </Link>
      </p>
    </div>
  );
}
