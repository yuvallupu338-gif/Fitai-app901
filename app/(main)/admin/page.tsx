import type { Metadata } from 'next';
import {
  CalendarCheck,
  FileWarning,
  Image as ImageIcon,
  Repeat,
  ShieldCheck,
  Sparkles,
  Star,
  UserPlus,
  Users,
} from 'lucide-react';
import { getAdminStats } from '@/lib/data/dashboard';
import { StatTile } from '@/components/dashboard/stat-tile';
import { SignupsChart } from '@/components/admin/signups-chart';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'פאנל ניהול' };

export default async function AdminOverviewPage() {
  const stats = await getAdminStats();

  if (!stats) {
    return <p className="surface p-6 text-center text-sm text-muted-foreground">לא ניתן לטעון סטטיסטיקות.</p>;
  }

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile label="משתמשים" value={stats.users_total} icon={Users} tone="primary" hint={`+${stats.users_today} היום`} />
        <StatTile label="הרשמות בשבוע" value={stats.users_7d} icon={UserPlus} />
        <StatTile
          label="בעלי מקצוע פעילים"
          value={stats.professionals_active}
          icon={Sparkles}
          tone="success"
          hint={`+${stats.professionals_today} היום`}
        />
        <StatTile
          label="ממתינים לאישור"
          value={stats.professionals_pending}
          icon={ShieldCheck}
          tone="warning"
          href="/admin/professionals?status=pending_review"
        />
        <StatTile label="פוסטים" value={stats.posts_total} icon={ImageIcon} hint={`+${stats.posts_today} היום`} />
        <StatTile label="הזמנות" value={stats.bookings_total} icon={CalendarCheck} hint={`+${stats.bookings_today} היום`} />
        <StatTile label="סדרות קבועות פעילות" value={stats.series_active} icon={Repeat} />
        <StatTile label="ביקורות" value={stats.reviews_total} icon={Star} />
        <StatTile
          label="דיווחים פתוחים"
          value={stats.reports_open}
          icon={FileWarning}
          tone="warning"
          href="/admin/reports"
        />
        <StatTile
          label="בקשות מקצוע חדש"
          value={stats.profession_requests_open}
          icon={Sparkles}
          href="/admin/professions"
        />
        <StatTile
          label="בקשות אימות"
          value={stats.verifications_pending}
          icon={ShieldCheck}
          href="/admin/verifications"
        />
      </section>

      <section className="surface p-4">
        <h2 className="mb-3 font-semibold">הרשמות ב־30 הימים האחרונים</h2>
        <SignupsChart data={stats.signups_by_day} />
      </section>
    </div>
  );
}
