import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';

/** קיצור דרך: /profile מעביר לפרופיל הציבורי של המשתמש המחובר. */
export default async function ProfileRedirectPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  redirect(`/u/${session.user.username}`);
}
