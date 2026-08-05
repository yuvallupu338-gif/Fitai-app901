import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BarChart3, Bookmark, CalendarCheck, Eye, Heart, Star, TrendingUp, Users, Wallet } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { getProfessionalDashboard } from '@/lib/data/dashboard';
import { getMyPosts } from '@/lib/data/posts';
import { StatTile } from '@/components/dashboard/stat-tile';
import { formatCompactNumber, formatPrice, formatRating, formatResponseTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'נתונים מקצועיים' };

export default async function ProStatsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.user.professionalId) redirect('/pro/onboarding');

  const [stats, posts] = await Promise.all([
    getProfessionalDashboard(session.user.professionalId),
    getMyPosts(session.user.professionalId),
  ]);

  const topPosts = [...posts]
    .sort((a, b) => b.likes_count + b.saves_count * 2 - (a.likes_count + a.saves_count * 2))
    .slice(0, 5);

  return (
    <div className="space-y-6 px-4 py-4 lg:px-0">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <BarChart3 className="size-5 text-primary" aria-hidden />
          נתונים מקצועיים
        </h1>
        <p className="text-sm text-muted-foreground">כל המדדים מחושבים מהנתונים האמיתיים במערכת</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label="הכנסה משוערת החודש"
          value={formatPrice(stats.estimatedRevenue, { compact: true })}
          icon={Wallet}
          tone="success"
        />
        <StatTile label="טיפולים שהושלמו" value={stats.profile?.completed_bookings_count ?? 0} icon={CalendarCheck} tone="primary" />
        <StatTile label="לקוחות" value={stats.profile?.clients_count ?? 0} icon={Users} />
        <StatTile
          label="דירוג ממוצע"
          value={stats.profile?.rating_count ? formatRating(stats.profile.rating_avg) : '—'}
          icon={Star}
          hint={`${stats.profile?.rating_count ?? 0} ביקורות`}
        />
        <StatTile label="צפיות בפרופיל" value={formatCompactNumber(stats.profile?.profile_views_count ?? 0)} icon={Eye} />
        <StatTile label="צפיות בפוסטים" value={formatCompactNumber(stats.totalPostViews)} icon={Eye} />
        <StatTile label="לייקים" value={formatCompactNumber(stats.totalLikes)} icon={Heart} />
        <StatTile label="שמירות" value={formatCompactNumber(stats.totalSaves)} icon={Bookmark} />
        <StatTile label="עוקבים" value={formatCompactNumber(stats.profile?.followers_count ?? 0)} icon={TrendingUp} />
      </div>

      <section className="surface p-4">
        <h2 className="mb-1 font-semibold">זמן תגובה ממוצע</h2>
        <p className="text-sm text-muted-foreground">
          {stats.profile?.response_time_minutes
            ? formatResponseTime(stats.profile.response_time_minutes)
            : 'עדיין אין מספיק נתונים. ככל שתגיבו מהר יותר להודעות, כך תדורגו טוב יותר בחיפוש.'}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">הפוסטים שהכי עבדו</h2>
        {topPosts.length === 0 ? (
          <p className="surface p-4 text-sm text-muted-foreground">עדיין לא פרסמתם עבודות.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border/70 bg-card">
            {topPosts.map((post) => (
              <li key={post.id} className="flex items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{post.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {post.likes_count} לייקים · {post.saves_count} שמירות · {post.views_count} צפיות ·{' '}
                    {post.bookings_count} הזמנות
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
