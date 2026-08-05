'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { updatePrivacyAction } from '@/lib/actions/profile';

const TOGGLES: Array<{ key: 'show_city' | 'show_reviews' | 'show_following'; label: string; hint?: string }> = [
  { key: 'show_city', label: 'הצגת העיר שלי בפרופיל', hint: 'העיר עדיין תשמש להתאמת תוצאות עבורכם.' },
  { key: 'show_reviews', label: 'הצגת הביקורות שכתבתי', hint: 'הביקורות עצמן תמיד מוצגות בפרופיל בעל המקצוע.' },
  { key: 'show_following', label: 'הצגת מי שאני עוקב אחריו' },
];

/** הגדרות פרטיות. פרטים רגישים (כתובת, טלפון, סיסמה) לעולם אינם מוצגים לציבור. */
export function PrivacySettingsForm({ privacy }: { privacy: Record<string, unknown> }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [form, setForm] = React.useState({
    show_city: privacy.show_city !== false,
    show_reviews: privacy.show_reviews !== false,
    show_following: privacy.show_following !== false,
    allow_messages_from: (privacy.allow_messages_from as string) ?? 'everyone',
  });

  const save = async () => {
    setPending(true);
    const result = await updatePrivacyAction(form);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'ההגדרות נשמרו');
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <section className="surface divide-y divide-border">
        {TOGGLES.map((toggle) => (
          <div key={toggle.key} className="flex items-center justify-between gap-3 p-4">
            <Label htmlFor={toggle.key} className="cursor-pointer font-normal">
              {toggle.label}
              {toggle.hint ? <span className="block text-xs text-muted-foreground">{toggle.hint}</span> : null}
            </Label>
            <Switch
              id={toggle.key}
              checked={form[toggle.key]}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, [toggle.key]: checked }))}
            />
          </div>
        ))}
      </section>

      <section className="surface space-y-3 p-4">
        <h2 className="font-medium">מי יכול לשלוח לי הודעות</h2>
        <RadioGroup
          value={form.allow_messages_from}
          onValueChange={(value) => setForm((f) => ({ ...f, allow_messages_from: value }))}
          className="gap-2"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="everyone" id="msg-everyone" />
            <Label htmlFor="msg-everyone" className="cursor-pointer font-normal">
              כל אחד
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="following" id="msg-following" />
            <Label htmlFor="msg-following" className="cursor-pointer font-normal">
              רק מי שאני עוקב אחריו
            </Label>
          </div>
        </RadioGroup>
      </section>

      <div className="surface p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">מה לעולם לא מוצג לציבור</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          <li>הסיסמה שלכם (נשמרת כ־hash בלבד)</li>
          <li>קוד השחזור</li>
          <li>כתובת מלאה – נחשפת רק לבעל מקצוע עם הזמנה מאושרת</li>
          <li>מספר טלפון פרטי</li>
          <li>הפוסטים ובעלי המקצוע שסימנתם כשמורים</li>
        </ul>
      </div>

      <Button onClick={save} loading={pending}>
        שמירת ההגדרות
      </Button>
    </div>
  );
}
