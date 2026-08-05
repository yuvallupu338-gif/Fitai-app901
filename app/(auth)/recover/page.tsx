import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { RecoverForm } from '@/components/auth/recover-form';

export const metadata: Metadata = {
  title: 'שחזור סיסמה',
  description: 'איפוס סיסמה באמצעות שם משתמש וקוד שחזור אישי.',
};

export default async function RecoverPage() {
  const session = await getSession();
  if (session) redirect('/');

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">שחזור סיסמה</h1>
        <p className="text-sm text-muted-foreground">
          אין לנו את כתובת האימייל שלכם – השחזור מתבצע באמצעות קוד השחזור שקיבלתם בהרשמה.
        </p>
      </div>

      <div className="surface p-6">
        <RecoverForm />
      </div>

      <p className="text-center text-sm text-muted-foreground">
        נזכרתם בסיסמה?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          חזרה להתחברות
        </Link>
      </p>
    </div>
  );
}
