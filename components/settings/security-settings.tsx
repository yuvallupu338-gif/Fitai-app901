'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Check, Copy, KeyRound, Monitor, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { PasswordInput, PasswordStrength } from '@/components/shared/password-input';
import { changePasswordSchema } from '@/lib/validations';
import { changePasswordAction, regenerateRecoveryCodeAction, revokeSessionAction } from '@/lib/actions/auth';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import type { z } from 'zod';

type FormValues = z.infer<typeof changePasswordSchema>;

type LoginSession = {
  id: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  revoked_at: string | null;
};

/** אבטחת החשבון: סיסמה, קוד שחזור והתחברויות פעילות. */
export function SecuritySettings({
  sessions,
  currentSessionId,
}: {
  sessions: LoginSession[];
  currentSessionId: string;
}) {
  const router = useRouter();
  const [recoveryPassword, setRecoveryPassword] = React.useState('');
  const [newCode, setNewCode] = React.useState<string | null>(null);
  const [regenerating, setRegenerating] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const changePassword = form.handleSubmit(async (values) => {
    const result = await changePasswordAction(values);

    if (!result.ok) {
      toast.error(result.error);
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          form.setError(field as keyof FormValues, { message: messages[0] });
        }
      }
      return;
    }

    toast.success(result.message ?? 'הסיסמה עודכנה');
    form.reset();
    router.refresh();
  });

  const regenerate = async () => {
    setRegenerating(true);
    const result = await regenerateRecoveryCodeAction(recoveryPassword);
    setRegenerating(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setNewCode(result.data.recoveryCode);
    setRecoveryPassword('');
    toast.success(result.message ?? 'נוצר קוד חדש');
  };

  const revoke = async (id: string) => {
    const result = await revokeSessionAction(id);
    if (result.ok) {
      toast.success('המכשיר נותק');
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  const activeSessions = sessions.filter(
    (item) => !item.revoked_at && new Date(item.expires_at) > new Date(),
  );

  return (
    <div className="space-y-4">
      <section className="surface space-y-4 p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <KeyRound className="size-4 text-primary" aria-hidden />
          שינוי סיסמה
        </h2>

        <form onSubmit={changePassword} className="space-y-3" noValidate>
          <Field
            label="הסיסמה הנוכחית"
            htmlFor="currentPassword"
            required
            error={form.formState.errors.currentPassword?.message}
          >
            <PasswordInput id="currentPassword" autoComplete="current-password" {...form.register('currentPassword')} />
          </Field>

          <Field
            label="סיסמה חדשה"
            htmlFor="newPassword"
            required
            error={form.formState.errors.newPassword?.message}
          >
            <PasswordInput id="newPassword" autoComplete="new-password" {...form.register('newPassword')} />
          </Field>
          <PasswordStrength password={form.watch('newPassword')} />

          <Field
            label="אימות הסיסמה החדשה"
            htmlFor="confirmPassword"
            required
            error={form.formState.errors.confirmPassword?.message}
          >
            <PasswordInput id="confirmPassword" autoComplete="new-password" {...form.register('confirmPassword')} />
          </Field>

          <p className="text-xs text-muted-foreground">
            לאחר שינוי הסיסמה כל המכשירים האחרים ינותקו אוטומטית.
          </p>

          <Button type="submit" loading={form.formState.isSubmitting}>
            עדכון הסיסמה
          </Button>
        </form>
      </section>

      <section className="surface space-y-3 p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-4 text-primary" aria-hidden />
          קוד שחזור
        </h2>
        <p className="text-sm text-muted-foreground">
          קוד השחזור הוא הדרך היחידה לאפס סיסמה בלי אימייל. יצירת קוד חדש מבטלת את הקוד הקודם.
        </p>

        {newCode ? (
          <div className="space-y-2">
            <div
              className="select-all rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 text-center font-mono text-lg font-bold tracking-widest text-primary"
              dir="ltr"
            >
              {newCode}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(newCode);
                setCopied(true);
                toast.success('הקוד הועתק');
              }}
            >
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              העתקה
            </Button>
            <p className="text-xs text-warning">שמרו את הקוד עכשיו – הוא לא יוצג שוב.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <PasswordInput
              value={recoveryPassword}
              onChange={(event) => setRecoveryPassword(event.target.value)}
              placeholder="הסיסמה שלך לאישור"
              aria-label="סיסמה לאישור יצירת קוד שחזור"
              className="flex-1"
            />
            <Button onClick={regenerate} loading={regenerating} disabled={!recoveryPassword}>
              יצירת קוד חדש
            </Button>
          </div>
        )}
      </section>

      <section className="surface p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <Monitor className="size-4 text-primary" aria-hidden />
          התחברויות פעילות ({activeSessions.length})
        </h2>

        <ul className="space-y-2">
          {sessions.map((item) => {
            const isCurrent = item.id === currentSessionId;
            const isActive = !item.revoked_at && new Date(item.expires_at) > new Date();

            return (
              <li key={item.id} className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
                <div className="min-w-0 text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <span className="truncate">{item.user_agent?.slice(0, 60) ?? 'מכשיר לא ידוע'}</span>
                    {isCurrent ? <Badge variant="success">המכשיר הזה</Badge> : null}
                    {!isActive ? <Badge variant="neutral">נותק</Badge> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    התחברות: {formatDateTime(item.created_at)} · פעילות אחרונה:{' '}
                    {formatRelativeTime(item.last_used_at)}
                    {item.ip_address ? ` · ${item.ip_address}` : ''}
                  </p>
                </div>

                {isActive && !isCurrent ? (
                  <Button variant="ghost" size="sm" onClick={() => revoke(item.id)}>
                    ניתוק
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
