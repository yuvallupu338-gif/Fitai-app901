'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BadgeCheck, Check, Pause, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { PROFESSIONAL_STATUS_LABELS } from '@/lib/constants';
import { formatDate, formatRating } from '@/lib/format';
import { setProfessionalReviewStatusAction, setVerifiedAction } from '@/lib/actions/admin';
import { cn } from '@/lib/utils';
import type { ProfessionalStatus } from '@/types/app';

type AdminProfessional = {
  id: string;
  business_name: string;
  headline: string | null;
  avatar_url: string | null;
  status: ProfessionalStatus;
  is_verified: boolean;
  rating_avg: number;
  rating_count: number;
  created_at: string;
  published_at: string | null;
  profiles: { id: string; username: string; full_name: string } | null;
  cities: { name: string } | null;
};

const FILTERS = [
  { value: '', label: 'הכול' },
  { value: 'active', label: 'פעילים' },
  { value: 'pending_review', label: 'ממתינים' },
  { value: 'draft', label: 'טיוטות' },
  { value: 'paused', label: 'מושהים' },
];

/** ניהול בעלי מקצוע: אישור, אימות והשהיה. */
export function ProfessionalsTable({
  professionals,
  activeStatus,
}: {
  professionals: AdminProfessional[];
  activeStatus: string;
}) {
  const router = useRouter();

  const run = async (action: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    const result = await action();
    if (result.ok) {
      toast.success(result.message ?? 'בוצע');
      router.refresh();
    } else {
      toast.error(result.error ?? 'הפעולה נכשלה');
    }
  };

  return (
    <div className="space-y-3">
      <nav className="scroll-x" aria-label="סינון לפי סטטוס">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value ? `/admin/professionals?status=${filter.value}` : '/admin/professionals'}
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

      {professionals.length === 0 ? (
        <EmptyState icon={Check} title="אין בעלי מקצוע בקטגוריה הזו" />
      ) : (
        <ul className="space-y-2">
          {professionals.map((professional) => (
            <li key={professional.id} className="surface flex flex-wrap items-center gap-3 p-3">
              <UserAvatar
                src={professional.avatar_url}
                name={professional.business_name}
                className="size-11"
              />

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <Link
                    href={`/u/${professional.profiles?.username ?? ''}`}
                    className="truncate font-medium hover:underline"
                  >
                    {professional.business_name}
                  </Link>
                  {professional.is_verified ? (
                    <BadgeCheck className="size-4 text-primary" aria-label="מאומת" />
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {professional.cities?.name ?? '—'} · נוצר {formatDate(professional.created_at)}
                  {professional.rating_count > 0
                    ? ` · ${formatRating(professional.rating_avg)} (${professional.rating_count})`
                    : ''}
                </p>
              </div>

              <Badge variant={professional.status === 'active' ? 'success' : 'warning'}>
                {PROFESSIONAL_STATUS_LABELS[professional.status]}
              </Badge>

              <div className="flex flex-wrap gap-1">
                {professional.status !== 'active' ? (
                  <Button
                    size="sm"
                    onClick={() => run(() => setProfessionalReviewStatusAction(professional.id, 'active'))}
                  >
                    <Check className="size-4" aria-hidden />
                    אישור
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => run(() => setProfessionalReviewStatusAction(professional.id, 'paused'))}
                  >
                    <Pause className="size-4" aria-hidden />
                    השהיה
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => run(() => setVerifiedAction(professional.id, !professional.is_verified))}
                >
                  <BadgeCheck className="size-4" aria-hidden />
                  {professional.is_verified ? 'הסרת אימות' : 'אימות'}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() =>
                    run(() => setProfessionalReviewStatusAction(professional.id, 'rejected', 'לא עומד בקריטריונים'))
                  }
                >
                  <X className="size-4" aria-hidden />
                  דחייה
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
