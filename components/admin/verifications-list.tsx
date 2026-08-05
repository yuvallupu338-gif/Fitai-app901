'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, FileText, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatRelativeTime } from '@/lib/format';
import { reviewVerificationAction } from '@/lib/actions/admin';

type Verification = {
  id: string;
  kind: string;
  title: string | null;
  document_url: string | null;
  status: string;
  created_at: string;
  professional_profiles: {
    id: string;
    business_name: string;
    profiles: { username: string } | null;
  } | null;
};

const KIND_LABELS: Record<string, string> = {
  phone: 'אימות טלפון',
  certificate: 'תעודה מקצועית',
  identity: 'אימות זהות',
};

/** אישור בקשות אימות של בעלי מקצוע. */
export function VerificationsList({ verifications }: { verifications: Verification[] }) {
  const router = useRouter();

  const run = async (id: string, status: 'approved' | 'rejected') => {
    const result = await reviewVerificationAction(id, status);
    if (result.ok) {
      toast.success(result.message ?? 'בוצע');
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  if (verifications.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="אין בקשות אימות ממתינות"
        description="בעלי מקצוע יכולים להעלות תעודה מקצועית מההגדרות המקצועיות שלהם."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {verifications.map((verification) => (
        <li key={verification.id} className="surface flex flex-wrap items-center gap-3 p-4">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileText className="size-5" aria-hidden />
          </span>

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-medium">
              <Link
                href={`/u/${verification.professional_profiles?.profiles?.username ?? ''}`}
                className="truncate hover:underline"
              >
                {verification.professional_profiles?.business_name}
              </Link>
              <Badge variant="secondary">{KIND_LABELS[verification.kind] ?? verification.kind}</Badge>
            </p>
            <p className="text-xs text-muted-foreground">
              {verification.title ?? '—'} · {formatRelativeTime(verification.created_at)}
            </p>
          </div>

          <div className="flex gap-1">
            {verification.document_url ? (
              <Button variant="outline" size="sm" asChild>
                <a href={verification.document_url} target="_blank" rel="noopener noreferrer">
                  צפייה במסמך
                </a>
              </Button>
            ) : null}
            <Button size="sm" onClick={() => run(verification.id, 'approved')}>
              <Check className="size-4" aria-hidden />
              אישור
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => run(verification.id, 'rejected')}
            >
              <X className="size-4" aria-hidden />
              דחייה
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
