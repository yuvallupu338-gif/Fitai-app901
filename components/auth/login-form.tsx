'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Field } from '@/components/ui/field';
import { PasswordInput } from '@/components/shared/password-input';
import { loginSchema, type LoginInput } from '@/lib/validations';
import { loginAction } from '@/lib/actions/auth';

export function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '', remember: true },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    const result = await loginAction(values);

    if (!result.ok) {
      setServerError(result.error);
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          form.setError(field as keyof LoginInput, { message: messages[0] });
        }
      }
      return;
    }

    toast.success('התחברת בהצלחה');
    router.replace(result.data.redirectTo);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {serverError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive animate-fade-in"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{serverError}</span>
        </div>
      ) : null}

      <Field label="שם משתמש" htmlFor="username" error={form.formState.errors.username?.message} required>
        <Input
          id="username"
          autoComplete="username"
          dir="auto"
          placeholder="שם המשתמש שלכם"
          {...form.register('username')}
        />
      </Field>

      <Field label="סיסמה" htmlFor="password" error={form.formState.errors.password?.message} required>
        <PasswordInput id="password" autoComplete="current-password" {...form.register('password')} />
      </Field>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            id="remember"
            checked={form.watch('remember')}
            onCheckedChange={(checked) => form.setValue('remember', checked === true)}
          />
          <Label htmlFor="remember" className="cursor-pointer text-sm font-normal">
            השאר אותי מחובר
          </Label>
        </div>

        <Link href="/recover" className="text-sm font-medium text-primary hover:underline">
          שכחתי סיסמה
        </Link>
      </div>

      <Button type="submit" block size="lg" loading={form.formState.isSubmitting}>
        התחברות
      </Button>
    </form>
  );
}
