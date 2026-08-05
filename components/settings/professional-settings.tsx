'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BadgeCheck, FileUp, Pause, Play, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { PROFESSIONAL_STATUS_LABELS } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/format';
import { setProfessionalStatusAction, submitVerificationAction } from '@/lib/actions/professional';
import { uploadFile } from '@/lib/upload-client';
import type { ProfessionalStatus } from '@/types/app';

const STATUS_LABELS: Record<string, string> = {
  pending: 'ממתין לבדיקה',
  approved: 'אושר',
  rejected: 'נדחה',
  merged: 'מוזג',
};

/** הגדרות הפרופיל המקצועי: השהיה, אימות ותעודות. */
export function ProfessionalSettings({
  status,
  isVerified,
  phoneVerified,
  verifications,
}: {
  status: ProfessionalStatus;
  isVerified: boolean;
  phoneVerified: boolean;
  verifications: Array<{ id: string; kind: string; title: string | null; status: string; created_at: string }>;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [certificateTitle, setCertificateTitle] = React.useState('');
  const fileRef = React.useRef<HTMLInputElement>(null);

  const changeStatus = async (next: 'active' | 'paused') => {
    setPending(true);
    const result = await setProfessionalStatusAction(next);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'עודכן');
    router.refresh();
  };

  const uploadCertificate = async (file: File) => {
    setPending(true);
    try {
      const uploaded = await uploadFile(file, 'certificates');
      const result = await submitVerificationAction('certificate', uploaded.url, certificateTitle || file.name);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success('התעודה נשלחה לבדיקה');
      setCertificateTitle('');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ההעלאה נכשלה');
    } finally {
      setPending(false);
    }
  };

  const requestPhoneVerification = async () => {
    setPending(true);
    const result = await submitVerificationAction('phone', null, 'אימות מספר טלפון');
    setPending(false);

    if (result.ok) {
      toast.success('הבקשה נשלחה. הצוות ייצור קשר לאימות.');
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="space-y-4">
      <section className="surface space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">סטטוס הפרופיל</h2>
          <Badge variant={status === 'active' ? 'success' : 'warning'}>
            {PROFESSIONAL_STATUS_LABELS[status]}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground">
          {status === 'active'
            ? 'הפרופיל שלך מופיע בחיפוש ויכול לקבל הזמנות.'
            : 'הפרופיל אינו מופיע בחיפוש. החשבון האישי שלך נשאר פעיל ואפשר להמשיך לגלוש ולהזמין.'}
        </p>

        {status === 'active' ? (
          <Button variant="outline" onClick={() => changeStatus('paused')} loading={pending}>
            <Pause className="size-4" aria-hidden />
            השהיית הפרופיל המקצועי
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => changeStatus('active')} loading={pending}>
              <Play className="size-4" aria-hidden />
              הפעלת הפרופיל
            </Button>
            <Button variant="outline" asChild>
              <Link href="/pro/onboarding">השלמת פרטים</Link>
            </Button>
          </div>
        )}
      </section>

      <section className="surface space-y-3 p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <BadgeCheck className="size-4 text-primary" aria-hidden />
          אימות
        </h2>

        <div className="flex items-center justify-between gap-2 text-sm">
          <span>תג בעל מקצוע מאומת</span>
          <Badge variant={isVerified ? 'success' : 'neutral'}>{isVerified ? 'מאומת' : 'לא מאומת'}</Badge>
        </div>

        <div className="flex items-center justify-between gap-2 text-sm">
          <span>אימות מספר טלפון</span>
          {phoneVerified ? (
            <Badge variant="success">מאומת</Badge>
          ) : (
            <Button variant="outline" size="sm" onClick={requestPhoneVerification} loading={pending}>
              בקשת אימות
            </Button>
          )}
        </div>
      </section>

      <section className="surface space-y-3 p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-4 text-primary" aria-hidden />
          תעודות מקצועיות
        </h2>
        <p className="text-sm text-muted-foreground">
          התעודות נשמרות באחסון פרטי ונגישות רק לך ולצוות הבדיקה.
        </p>

        <Field label="שם התעודה" htmlFor="certTitle">
          <Input
            id="certTitle"
            value={certificateTitle}
            onChange={(event) => setCertificateTitle(event.target.value)}
            placeholder="לדוגמה: תעודת קוסמטיקה מוסמכת"
          />
        </Field>

        <Button variant="outline" onClick={() => fileRef.current?.click()} loading={pending}>
          <FileUp className="size-4" aria-hidden />
          העלאת תעודה
        </Button>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadCertificate(file);
            event.target.value = '';
          }}
        />

        {verifications.length > 0 ? (
          <ul className="space-y-1.5 pt-2">
            {verifications.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{item.title ?? item.kind}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{formatRelativeTime(item.created_at)}</span>
                  <Badge variant={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'danger' : 'warning'}>
                    {STATUS_LABELS[item.status] ?? item.status}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
