'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { EyeOff, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { formatRelativeTime } from '@/lib/format';
import { resolveReportAction } from '@/lib/actions/admin';
import { REPORT_REASONS } from '@/lib/constants';
import { cn } from '@/lib/utils';

type Report = {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  profiles: { id: string; username: string; full_name: string; avatar_url: string | null } | null;
};

const TARGET_LABELS: Record<string, string> = {
  user: 'משתמש',
  professional: 'בעל מקצוע',
  post: 'פוסט',
  comment: 'תגובה',
  message: 'הודעה',
  review: 'ביקורת',
};

const TARGET_LINKS: Record<string, (id: string) => string | null> = {
  post: (id) => `/p/${id}`,
  professional: () => null,
  user: () => null,
  comment: () => null,
  message: () => null,
  review: () => null,
};

const FILTERS = [
  { value: 'open', label: 'פתוחים' },
  { value: 'reviewing', label: 'בבדיקה' },
  { value: 'resolved', label: 'טופלו' },
  { value: 'dismissed', label: 'נדחו' },
];

/** טיפול בדיווחים מהקהילה. */
export function ReportsTable({ reports, activeStatus }: { reports: Report[]; activeStatus: string }) {
  const router = useRouter();

  const run = async (id: string, action: 'hide_content' | 'dismiss' | 'resolve') => {
    const result = await resolveReportAction(id, action);
    if (result.ok) {
      toast.success(result.message ?? 'בוצע');
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="space-y-3">
      <nav className="scroll-x" aria-label="סינון דיווחים">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={`/admin/reports?status=${filter.value}`}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              activeStatus === filter.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      {reports.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="אין דיווחים בקטגוריה הזו" description="הקהילה שקטה 🙂" />
      ) : (
        <ul className="space-y-2">
          {reports.map((report) => {
            const link = TARGET_LINKS[report.target_type]?.(report.target_id) ?? null;
            const reasonLabel =
              REPORT_REASONS.find((item) => item.value === report.reason)?.label ?? report.reason;

            return (
              <li key={report.id} className="surface space-y-2 p-4">
                <div className="flex items-start gap-3">
                  <UserAvatar
                    src={report.profiles?.avatar_url}
                    name={report.profiles?.full_name ?? 'מדווח'}
                    className="size-9"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{report.profiles?.full_name}</span> דיווח על{' '}
                      <Badge variant="secondary">{TARGET_LABELS[report.target_type]}</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {reasonLabel} · {formatRelativeTime(report.created_at)}
                    </p>
                  </div>
                </div>

                {report.details ? (
                  <p className="rounded-xl bg-muted/60 p-2.5 text-sm">{report.details}</p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {link ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={link}>צפייה בתוכן</Link>
                    </Button>
                  ) : null}

                  {report.status === 'open' || report.status === 'reviewing' ? (
                    <>
                      <Button size="sm" onClick={() => run(report.id, 'hide_content')}>
                        <EyeOff className="size-4" aria-hidden />
                        הסתרת התוכן
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => run(report.id, 'resolve')}>
                        סימון כטופל
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => run(report.id, 'dismiss')}>
                        <X className="size-4" aria-hidden />
                        דחיית הדיווח
                      </Button>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
