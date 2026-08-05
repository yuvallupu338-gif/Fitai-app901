'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ShieldAlert, ShieldCheck, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { UserAvatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { setGuardianApprovalAction } from '@/lib/actions/profile';
import { toggleBlockUserAction } from '@/lib/actions/social';

/** בטיחות: אישור הורה לקטינים, חסימות והנחיות למפגש ביתי. */
export function SafetySettings({
  isMinor,
  guardianApproved,
  blocked,
}: {
  isMinor: boolean;
  guardianApproved: boolean;
  blocked: Array<{ id: string; username: string; full_name: string; avatar_url: string | null }>;
}) {
  const router = useRouter();
  const [form, setForm] = React.useState({ guardianName: '', guardianPhone: '' });
  const [pending, setPending] = React.useState(false);

  const save = async () => {
    setPending(true);
    const result = await setGuardianApprovalAction(form);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'האישור נשמר');
    router.refresh();
  };

  const unblock = async (id: string) => {
    const result = await toggleBlockUserAction(id, false);
    if (result.ok) {
      toast.success('החסימה הוסרה');
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="space-y-4">
      {isMinor ? (
        <section className="surface space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            {guardianApproved ? (
              <ShieldCheck className="size-4 text-success" aria-hidden />
            ) : (
              <ShieldAlert className="size-4 text-warning" aria-hidden />
            )}
            אישור הורה או אחראי
          </h2>

          {guardianApproved ? (
            <p className="text-sm text-success">
              האישור נשמר. אפשר להזמין בעלי מקצוע לביקור בית.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                החשבון שלך מסומן כמשתמש מתחת לגיל 18. כדי להזמין בעל מקצוע לבית נדרש אישור של הורה או
                אחראי. בלי האישור לא ניתן לשתף כתובת בית.
              </p>

              <Field label="שם ההורה או האחראי" htmlFor="guardianName" required>
                <Input
                  id="guardianName"
                  value={form.guardianName}
                  onChange={(event) => setForm((f) => ({ ...f, guardianName: event.target.value }))}
                />
              </Field>

              <Field label="טלפון ליצירת קשר" htmlFor="guardianPhone" required>
                <Input
                  id="guardianPhone"
                  type="tel"
                  dir="ltr"
                  value={form.guardianPhone}
                  onChange={(event) => setForm((f) => ({ ...f, guardianPhone: event.target.value }))}
                  placeholder="050-1234567"
                />
              </Field>

              <Button onClick={save} loading={pending} disabled={!form.guardianName || !form.guardianPhone}>
                שמירת האישור
              </Button>
            </>
          )}
        </section>
      ) : null}

      <section className="surface space-y-2 p-4">
        <h2 className="font-semibold">בטיחות במפגש ביתי</h2>
        <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
          <li>בדקו שלבעל המקצוע יש תיק עבודות, ביקורות ורצוי גם תג &quot;מאומת&quot;.</li>
          <li>שמרו על התכתבות בתוך האפליקציה – כך יש תיעוד.</li>
          <li>הכתובת המלאה שלכם נחשפת רק אחרי שההזמנה מאושרת.</li>
          <li>אפשר לשתף את פרטי ההזמנה עם איש קשר בשלב ההזמנה.</li>
          <li>אם משהו לא מרגיש בסדר – אפשר לבטל, לחסום ולדווח.</li>
        </ul>
      </section>

      <section className="surface p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <UserX className="size-4 text-primary" aria-hidden />
          משתמשים חסומים ({blocked.length})
        </h2>

        {blocked.length === 0 ? (
          <EmptyState
            icon={UserX}
            title="לא חסמתם אף אחד"
            description="חסימה מונעת מהמשתמש לשלוח לכם הודעות, לעקוב או ליצור קשר."
          />
        ) : (
          <ul className="space-y-2">
            {blocked.map((user) => (
              <li key={user.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                <UserAvatar src={user.avatar_url} name={user.full_name} className="size-10" />
                <div className="min-w-0 flex-1">
                  <Link href={`/u/${user.username}`} className="truncate font-medium hover:underline">
                    {user.full_name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground" dir="ltr">
                    @{user.username}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => unblock(user.id)}>
                  הסרת חסימה
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
