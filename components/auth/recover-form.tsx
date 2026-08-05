'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { AlertCircle, Check, Copy, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { PasswordInput, PasswordStrength } from '@/components/shared/password-input';
import { resetPasswordSchema } from '@/lib/validations';
import { resetPasswordAction } from '@/lib/actions/auth';
import type { z } from 'zod';

type FormValues = z.infer<typeof resetPasswordSchema>;

export function RecoverForm() {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [newCode, setNewCode] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { username: '', recoveryCode: '', newPassword: '', confirmPassword: '' },
  });

  const password = form.watch('newPassword');

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    const result = await resetPasswordAction(values);

    if (!result.ok) {
      setServerError(result.error);
      return;
    }

    setNewCode(result.data.recoveryCode);
    toast.success('הסיסמה אופסה בהצלחה');
  });

  if (newCode) {
    return (
      <div className="space-y-4 text-center animate-fade-in">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-success/10 text-success">
          <ShieldCheck className="size-7" aria-hidden />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">הסיסמה אופסה</h2>
          <p className="text-sm text-muted-foreground">
            קוד השחזור הישן נוצל. זה קוד השחזור החדש שלכם – שמרו אותו במקום בטוח.
          </p>
        </div>

        <div
          className="select-all rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 font-mono text-lg font-bold tracking-widest text-primary"
          dir="ltr"
        >
          {newCode}
        </div>

        <Button
          type="button"
          variant="outline"
          block
          onClick={async () => {
            await navigator.clipboard.writeText(newCode);
            setCopied(true);
            toast.success('הקוד הועתק');
          }}
        >
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          העתקת הקוד
        </Button>

        <Button block size="lg" onClick={() => router.push('/login')}>
          מעבר להתחברות
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {serverError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{serverError}</span>
        </div>
      ) : null}

      <Field label="שם משתמש" htmlFor="username" required error={form.formState.errors.username?.message}>
        <Input id="username" dir="auto" autoComplete="username" {...form.register('username')} />
      </Field>

      <Field
        label="קוד שחזור"
        htmlFor="recoveryCode"
        required
        error={form.formState.errors.recoveryCode?.message}
        hint="הקוד שקיבלתם בהרשמה, בפורמט YOFI-XXXX-XXXX-XXXX-XXXX"
      >
        <Input
          id="recoveryCode"
          dir="ltr"
          className="font-mono tracking-wider"
          placeholder="YOFI-XXXX-XXXX-XXXX-XXXX"
          {...form.register('recoveryCode')}
        />
      </Field>

      <Field label="סיסמה חדשה" htmlFor="newPassword" required error={form.formState.errors.newPassword?.message}>
        <PasswordInput id="newPassword" autoComplete="new-password" {...form.register('newPassword')} />
      </Field>
      <PasswordStrength password={password} />

      <Field
        label="אימות סיסמה"
        htmlFor="confirmPassword"
        required
        error={form.formState.errors.confirmPassword?.message}
      >
        <PasswordInput id="confirmPassword" autoComplete="new-password" {...form.register('confirmPassword')} />
      </Field>

      <Button type="submit" block size="lg" loading={form.formState.isSubmitting}>
        איפוס הסיסמה
      </Button>
    </form>
  );
}
