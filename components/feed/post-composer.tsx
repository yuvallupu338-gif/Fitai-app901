'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CityCombobox } from '@/components/shared/city-combobox';
import { MediaUploader, type MediaItem } from '@/components/shared/image-uploader';
import { postSchema, type PostInput } from '@/lib/validations';
import { savePostAction } from '@/lib/actions/posts';
import type { City, Profession } from '@/types/app';
import type { Tables } from '@/types/database';

type ExistingPost = {
  id: string;
  title: string;
  description: string | null;
  serviceId: string | null;
  professionId: string | null;
  cityId: string | null;
  priceEstimate: number | null;
  priceType: 'fixed' | 'range' | 'on_request';
  durationMinutes: number | null;
  tags: string[];
  isBeforeAfter: boolean;
  media: MediaItem[];
};

/** טופס פרסום עבודה – תמונות, סרטון, מחיר, תגיות ואישור פרסום. */
export function PostComposer({
  cities,
  professions,
  services,
  defaultCityId,
  existingPost,
}: {
  cities: City[];
  professions: Profession[];
  services: Tables<'professional_services'>[];
  defaultCityId: string | null;
  existingPost: ExistingPost | null;
}) {
  const router = useRouter();
  const [media, setMedia] = React.useState<MediaItem[]>(existingPost?.media ?? []);
  const [tagInput, setTagInput] = React.useState('');

  const form = useForm<PostInput>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      id: existingPost?.id,
      title: existingPost?.title ?? '',
      description: existingPost?.description ?? '',
      serviceId: existingPost?.serviceId ?? null,
      professionId: existingPost?.professionId ?? null,
      cityId: existingPost?.cityId ?? defaultCityId,
      priceEstimate: existingPost?.priceEstimate ?? null,
      priceType: existingPost?.priceType ?? 'on_request',
      durationMinutes: existingPost?.durationMinutes ?? null,
      tags: existingPost?.tags ?? [],
      isBeforeAfter: existingPost?.isBeforeAfter ?? false,
      consentConfirmed: existingPost?.isBeforeAfter ?? false,
      status: 'published',
      media: [],
    },
  });

  const tags = form.watch('tags');
  const isBeforeAfter = form.watch('isBeforeAfter');
  const serviceId = form.watch('serviceId');

  // בחירת שירות ממלאת אוטומטית מחיר ומשך.
  React.useEffect(() => {
    const service = services.find((s) => s.id === serviceId);
    if (!service) return;
    form.setValue('durationMinutes', service.duration_minutes);
    form.setValue('priceType', service.price_type);
    if (service.price_min !== null) form.setValue('priceEstimate', Number(service.price_min));
    if (service.profession_id) form.setValue('professionId', service.profession_id);
  }, [serviceId, services, form]);

  const addTag = () => {
    const value = tagInput.trim().replace(/^#/, '');
    if (!value || tags.includes(value) || tags.length >= 10) return;
    form.setValue('tags', [...tags, value]);
    setTagInput('');
  };

  const submit = async (status: 'draft' | 'published') => {
    const values = form.getValues();
    const payload: PostInput = {
      ...values,
      status,
      media: media.map((item) => ({
        url: item.url,
        mediaType: item.mediaType,
        thumbnailUrl: null,
        width: item.width ?? null,
        height: item.height ?? null,
        beforeAfterRole: item.beforeAfterRole ?? null,
        altText: item.altText ?? null,
      })),
    };

    const validation = postSchema.safeParse(payload);
    if (!validation.success) {
      const issue = validation.error.errors[0];
      toast.error(issue.message);
      return;
    }

    const result = await savePostAction(payload);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(result.message ?? 'הפוסט נשמר');
    router.push(`/p/${result.data.id}`);
    router.refresh();
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit('published');
      }}
      noValidate
    >
      <div className="surface space-y-4 p-4">
        <Field label="תמונות וסרטונים" required hint="התמונה הראשונה היא תמונת השער של הפוסט">
          <MediaUploader value={media} onChange={setMedia} bucket="posts" beforeAfterMode={isBeforeAfter} />
        </Field>

        <div className="flex items-start gap-2 rounded-xl bg-muted/60 p-3">
          <Checkbox
            id="isBeforeAfter"
            checked={isBeforeAfter}
            onCheckedChange={(checked) => form.setValue('isBeforeAfter', checked === true)}
          />
          <Label htmlFor="isBeforeAfter" className="cursor-pointer text-sm font-normal">
            זהו פוסט &quot;לפני ואחרי&quot; – יש לסמן איזו תמונה היא לפני ואיזו אחרי
          </Label>
        </div>

        {isBeforeAfter ? (
          <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3">
            <Checkbox
              id="consentConfirmed"
              checked={form.watch('consentConfirmed')}
              onCheckedChange={(checked) => form.setValue('consentConfirmed', checked === true)}
            />
            <Label htmlFor="consentConfirmed" className="cursor-pointer text-sm font-normal">
              אני מאשר/ת שקיבלתי הסכמה מפורשת מהלקוח לפרסום התמונות שבהן הוא מזוהה.
            </Label>
          </div>
        ) : null}
      </div>

      <div className="surface space-y-4 p-4">
        <Field label="כותרת" htmlFor="title" required error={form.formState.errors.title?.message}>
          <Input id="title" placeholder="לדוגמה: בוב קלאסי עם פסים רכים" {...form.register('title')} />
        </Field>

        <Field label="תיאור" htmlFor="description" error={form.formState.errors.description?.message}>
          <Textarea
            id="description"
            rows={4}
            placeholder="ספרו על העבודה: מה עשיתם, איזה מוצרים, כמה זמן לקח…"
            {...form.register('description')}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="השירות שבוצע" htmlFor="serviceId">
            <Select
              value={serviceId ?? 'none'}
              onValueChange={(value) => form.setValue('serviceId', value === 'none' ? null : value)}
            >
              <SelectTrigger id="serviceId">
                <SelectValue placeholder="בחרו שירות" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">ללא שיוך לשירות</SelectItem>
                {services.map((service) => (
                  <SelectItem key={service.id} value={service.id}>
                    {service.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="קטגוריה" htmlFor="professionId">
            <Select
              value={form.watch('professionId') ?? 'none'}
              onValueChange={(value) => form.setValue('professionId', value === 'none' ? null : value)}
            >
              <SelectTrigger id="professionId">
                <SelectValue placeholder="בחרו קטגוריה" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">ללא קטגוריה</SelectItem>
                {professions
                  .filter((p) => p.slug !== 'other')
                  .map((profession) => (
                    <SelectItem key={profession.id} value={profession.id}>
                      {profession.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="מחיר משוער" htmlFor="priceEstimate" hint="אפשר להשאיר ריק אם המחיר נקבע בשיחה">
            <Input
              id="priceEstimate"
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="₪"
              {...form.register('priceEstimate')}
            />
          </Field>

          <Field label="משך הטיפול (דקות)" htmlFor="durationMinutes">
            <Input
              id="durationMinutes"
              type="number"
              inputMode="numeric"
              min={5}
              max={1440}
              {...form.register('durationMinutes')}
            />
          </Field>
        </div>

        <Field label="עיר" htmlFor="cityId">
          <CityCombobox
            id="cityId"
            cities={cities}
            value={form.watch('cityId') ?? null}
            onChange={(id) => form.setValue('cityId', id)}
          />
        </Field>

        <Field label="תגיות" htmlFor="tags" hint="עד 10 תגיות. עוזרות למשתמשים למצוא את העבודה בחיפוש.">
          <div className="flex gap-2">
            <Input
              id="tags"
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ',') {
                  event.preventDefault();
                  addTag();
                }
              }}
              placeholder="לדוגמה: בלונד, החלקה, כלה"
            />
            <Button type="button" variant="outline" onClick={addTag}>
              הוספה
            </Button>
          </div>
        </Field>

        {tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  onClick={() => form.setValue('tags', tags.filter((t) => t !== tag))}
                  className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary"
                >
                  #{tag}
                  <X className="size-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex gap-2">
        <Button type="submit" block size="lg" loading={form.formState.isSubmitting}>
          פרסום
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={() => void submit('draft')}>
          שמירה כטיוטה
        </Button>
      </div>
    </form>
  );
}
