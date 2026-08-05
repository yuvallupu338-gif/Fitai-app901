'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { CityCombobox } from '@/components/shared/city-combobox';
import { SingleImageUploader } from '@/components/shared/image-uploader';
import { updateProfileSchema } from '@/lib/validations';
import { updateProfileAction } from '@/lib/actions/profile';
import type { City } from '@/types/app';
import type { SessionUser } from '@/lib/auth/session';
import type { z } from 'zod';

type FormValues = z.infer<typeof updateProfileSchema>;

/** עריכת הפרופיל האישי, כולל שינוי עיר שמשפיע על ההמלצות. */
export function ProfileSettingsForm({ user, cities }: { user: SessionUser; cities: City[] }) {
  const router = useRouter();

  const form = useForm<FormValues>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      fullName: user.fullName,
      username: user.username,
      cityId: user.cityId ?? '',
      bio: user.bio ?? '',
      avatarUrl: user.avatarUrl,
      birthDate: user.birthDate ?? '',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await updateProfileAction(values);

    if (!result.ok) {
      toast.error(result.error);
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          form.setError(field as keyof FormValues, { message: messages[0] });
        }
      }
      return;
    }

    toast.success(result.message ?? 'הפרופיל עודכן');
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} className="surface space-y-4 p-4" noValidate>
      <Field label="תמונת פרופיל">
        <SingleImageUploader
          value={form.watch('avatarUrl') ?? null}
          onChange={(url) => form.setValue('avatarUrl', url)}
          bucket="avatars"
        />
      </Field>

      <Field label="שם מלא" htmlFor="fullName" required error={form.formState.errors.fullName?.message}>
        <Input id="fullName" {...form.register('fullName')} />
      </Field>

      <Field
        label="שם משתמש"
        htmlFor="username"
        required
        error={form.formState.errors.username?.message}
        hint="שינוי שם המשתמש משנה גם את כתובת הפרופיל שלכם."
      >
        <Input id="username" dir="auto" {...form.register('username')} />
      </Field>

      <Field
        label="עיר מגורים"
        htmlFor="cityId"
        required
        error={form.formState.errors.cityId?.message}
        hint="העיר משפיעה על בעלי המקצוע והפוסטים שיוצגו לכם."
      >
        <CityCombobox
          id="cityId"
          cities={cities}
          value={form.watch('cityId') || null}
          onChange={(id) => form.setValue('cityId', id ?? '', { shouldValidate: true })}
        />
      </Field>

      <Field label="קצת עליי" htmlFor="bio" error={form.formState.errors.bio?.message}>
        <Textarea id="bio" rows={3} maxLength={400} {...form.register('bio')} />
      </Field>

      <Field
        label="תאריך לידה"
        htmlFor="birthDate"
        hint="משמש רק להגנה על משתמשים מתחת לגיל 18 בהזמנות ביקורי בית."
      >
        <Input id="birthDate" type="date" max={new Date().toISOString().slice(0, 10)} {...form.register('birthDate')} />
      </Field>

      <Button type="submit" loading={form.formState.isSubmitting}>
        שמירת השינויים
      </Button>
    </form>
  );
}
