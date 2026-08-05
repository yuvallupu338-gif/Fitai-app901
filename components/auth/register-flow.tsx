'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { AlertCircle, Check, Copy, Loader2, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Field } from '@/components/ui/field';
import { Card } from '@/components/ui/card';
import { PasswordInput, PasswordStrength } from '@/components/shared/password-input';
import { CityCombobox } from '@/components/shared/city-combobox';
import { SingleImageUploader } from '@/components/shared/image-uploader';
import { registerSchema, type RegisterInput } from '@/lib/validations';
import { checkUsernameAvailability, registerAction } from '@/lib/actions/auth';
import type { City } from '@/types/app';
import { cn } from '@/lib/utils';

type Step = 'details' | 'recovery' | 'role';

export function RegisterFlow({ cities }: { cities: City[] }) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>('details');
  const [recoveryCode, setRecoveryCode] = React.useState('');
  const [serverError, setServerError] = React.useState<string | null>(null);

  if (step === 'recovery') {
    return (
      <RecoveryCodeStep
        code={recoveryCode}
        onContinue={() => setStep('role')}
      />
    );
  }

  if (step === 'role') {
    return <RoleChoiceStep onChoose={(path) => { router.push(path); router.refresh(); }} />;
  }

  return (
    <DetailsStep
      cities={cities}
      serverError={serverError}
      setServerError={setServerError}
      onSuccess={(code) => {
        setRecoveryCode(code);
        setStep('recovery');
      }}
    />
  );
}

// ---------------------------------------------------------------------
// שלב 1 – פרטי ההרשמה
// ---------------------------------------------------------------------

function DetailsStep({
  cities,
  serverError,
  setServerError,
  onSuccess,
}: {
  cities: City[];
  serverError: string | null;
  setServerError: (value: string | null) => void;
  onSuccess: (recoveryCode: string) => void;
}) {
  const [usernameState, setUsernameState] = React.useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: '',
      username: '',
      cityId: '',
      password: '',
      confirmPassword: '',
      avatarUrl: null,
      birthDate: null,
      acceptTerms: false as unknown as true,
    },
  });

  const username = form.watch('username');
  const password = form.watch('password');
  const cityId = form.watch('cityId');
  const avatarUrl = form.watch('avatarUrl');

  // בדיקת תפיסת שם המשתמש תוך כדי הקלדה (עם השהיה קצרה).
  React.useEffect(() => {
    if (!username || username.trim().length < 3) {
      setUsernameState('idle');
      return undefined;
    }

    setUsernameState('checking');
    const timer = setTimeout(async () => {
      const result = await checkUsernameAvailability(username.trim());
      if (!result.ok) {
        setUsernameState('idle');
        return;
      }
      setUsernameState(result.data.available ? 'available' : 'taken');
    }, 450);

    return () => clearTimeout(timer);
  }, [username]);

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);

    if (usernameState === 'taken') {
      form.setError('username', { message: 'שם המשתמש כבר תפוס' });
      return;
    }

    const result = await registerAction(values);

    if (!result.ok) {
      setServerError(result.error);
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          form.setError(field as keyof RegisterInput, { message: messages[0] });
        }
      }
      return;
    }

    onSuccess(result.data.recoveryCode);
  });

  return (
    <>
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">יצירת חשבון</h1>
        <p className="text-sm text-muted-foreground">
          בלי אימייל ובלי אימות טלפון. רק שם משתמש וסיסמה.
        </p>
      </div>

      <form onSubmit={onSubmit} className="surface space-y-4 p-6" noValidate>
        {serverError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{serverError}</span>
          </div>
        ) : null}

        <div className="flex justify-center">
          <SingleImageUploader
            value={avatarUrl ?? null}
            onChange={(url) => form.setValue('avatarUrl', url)}
            bucket="avatars"
            label="תמונה (רשות)"
          />
        </div>

        <Field label="שם מלא" htmlFor="fullName" error={form.formState.errors.fullName?.message} required>
          <Input id="fullName" autoComplete="name" placeholder="לדוגמה: דנה כהן" {...form.register('fullName')} />
        </Field>

        <Field
          label="שם משתמש"
          htmlFor="username"
          required
          error={form.formState.errors.username?.message}
          hint="באמצעותו תתחברו לאפליקציה. אפשר בעברית או באנגלית."
        >
          <div className="relative">
            <Input
              id="username"
              autoComplete="username"
              dir="auto"
              className="pe-10"
              placeholder="dana_beauty"
              {...form.register('username')}
            />
            <span className="absolute end-3 top-1/2 -translate-y-1/2">
              {usernameState === 'checking' ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
              ) : usernameState === 'available' ? (
                <Check className="size-4 text-success" aria-label="שם המשתמש פנוי" />
              ) : usernameState === 'taken' ? (
                <X className="size-4 text-destructive" aria-label="שם המשתמש תפוס" />
              ) : null}
            </span>
          </div>
        </Field>

        {usernameState === 'taken' ? (
          <p className="-mt-2 text-xs font-medium text-destructive">שם המשתמש כבר תפוס, אפשר לנסות שם אחר</p>
        ) : null}
        {usernameState === 'available' ? (
          <p className="-mt-2 text-xs font-medium text-success">שם המשתמש פנוי 🎉</p>
        ) : null}

        <Field
          label="עיר מגורים"
          htmlFor="cityId"
          required
          error={form.formState.errors.cityId?.message}
          hint="נשתמש בעיר כדי להציג בעלי מקצוע ופוסטים רלוונטיים. אפשר לשנות בהגדרות."
        >
          <CityCombobox
            id="cityId"
            cities={cities}
            value={cityId || null}
            onChange={(id) => form.setValue('cityId', id ?? '', { shouldValidate: true })}
            invalid={Boolean(form.formState.errors.cityId)}
          />
        </Field>

        <Field label="סיסמה" htmlFor="password" required error={form.formState.errors.password?.message}>
          <PasswordInput id="password" autoComplete="new-password" {...form.register('password')} />
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

        <Field
          label="תאריך לידה (רשות)"
          htmlFor="birthDate"
          hint="עוזר לנו להגן על משתמשים מתחת לגיל 18 בהזמנות ביקורי בית."
        >
          <Input id="birthDate" type="date" max={new Date().toISOString().slice(0, 10)} {...form.register('birthDate')} />
        </Field>

        <div className="flex items-start gap-2">
          <Checkbox
            id="acceptTerms"
            checked={form.watch('acceptTerms')}
            onCheckedChange={(checked) =>
              form.setValue('acceptTerms', (checked === true) as true, { shouldValidate: true })
            }
          />
          <Label htmlFor="acceptTerms" className="cursor-pointer text-sm font-normal leading-relaxed">
            אני מאשר/ת את תנאי השימוש ואת מדיניות הפרטיות, ומתחייב/ת לא לפרסם תמונות של לקוחות ללא הסכמתם.
          </Label>
        </div>
        {form.formState.errors.acceptTerms ? (
          <p className="text-xs font-medium text-destructive">{form.formState.errors.acceptTerms.message}</p>
        ) : null}

        <Button type="submit" block size="lg" loading={form.formState.isSubmitting}>
          יצירת חשבון
        </Button>
      </form>
    </>
  );
}

// ---------------------------------------------------------------------
// שלב 2 – קוד השחזור
// ---------------------------------------------------------------------

function RecoveryCodeStep({ code, onContinue }: { code: string; onContinue: () => void }) {
  const [confirmed, setConfirmed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('הקוד הועתק');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('לא הצלחנו להעתיק. אפשר לסמן ולהעתיק ידנית.');
    }
  };

  const download = () => {
    const blob = new Blob([`קוד השחזור שלך לאפליקציית יופי:\n\n${code}\n\nשמרו אותו במקום בטוח.`], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'yofi-recovery-code.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="space-y-2 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ShieldCheck className="size-7" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold">קוד השחזור האישי שלך</h1>
        <p className="text-sm text-muted-foreground">
          מכיוון שנרשמת בלי אימייל, זו הדרך היחידה לאפס סיסמה. הקוד מוצג פעם אחת בלבד.
        </p>
      </div>

      <Card className="space-y-4 p-6">
        <div
          className="select-all rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 text-center font-mono text-lg font-bold tracking-widest text-primary"
          dir="ltr"
        >
          {code}
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="outline" block onClick={copy}>
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? 'הועתק' : 'העתקה'}
          </Button>
          <Button type="button" variant="outline" block onClick={download}>
            שמירה כקובץ
          </Button>
        </div>

        <div className="rounded-xl bg-warning/10 p-3 text-xs leading-relaxed text-warning-foreground dark:text-warning">
          <strong className="font-semibold">חשוב:</strong> שמרו את הקוד במקום בטוח (מנהל סיסמאות, פתק שמור).
          אנחנו שומרים רק גיבוב שלו ולא נוכל לשחזר אותו עבורכם. אפשר להחליף אותו בכל עת מתוך ההגדרות.
        </div>

        <div className="flex items-start gap-2">
          <Checkbox id="savedCode" checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
          <Label htmlFor="savedCode" className="cursor-pointer text-sm font-normal">
            שמרתי את קוד השחזור במקום בטוח
          </Label>
        </div>

        <Button block size="lg" disabled={!confirmed} onClick={onContinue}>
          המשך
        </Button>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------
// שלב 3 – משתמש רגיל או בעל מקצוע
// ---------------------------------------------------------------------

function RoleChoiceStep({ onChoose }: { onChoose: (path: string) => void }) {
  const options = [
    {
      key: 'user',
      title: 'לא כרגע – המשך כמשתמש רגיל',
      description: 'לגלות בעלי מקצוע, לעקוב, לשמור עבודות ולהזמין טיפולים. תמיד אפשר להוסיף פרופיל מקצועי בהגדרות.',
      icon: UserRound,
      path: '/',
    },
    {
      key: 'pro',
      title: 'כן – צור לי פרופיל של בעל מקצוע',
      description: 'לפרסם את העבודות שלך, לקבל עוקבים, לנהל שירותים ומחירים ולקבל הזמנות ומפגשים קבועים.',
      icon: Sparkles,
      path: '/pro/onboarding',
    },
  ] as const;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">האם תרצה להוסיף את עצמך גם כבעל מקצוע?</h1>
        <p className="text-sm text-muted-foreground">
          אותו חשבון משמש לשני המצבים – אין צורך בשני חשבונות נפרדים.
        </p>
      </div>

      <div className="space-y-3">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onChoose(option.path)}
            className={cn(
              'surface surface-hover flex w-full items-start gap-4 p-5 text-start',
              option.key === 'pro' && 'border-primary/40 bg-primary/5',
            )}
          >
            <span
              className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-2xl',
                option.key === 'pro' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              <option.icon className="size-5" aria-hidden />
            </span>
            <span className="space-y-1">
              <span className="block font-semibold">{option.title}</span>
              <span className="block text-sm text-muted-foreground">{option.description}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
