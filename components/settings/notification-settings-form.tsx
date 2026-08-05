'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { updateNotificationPrefsAction } from '@/lib/actions/profile';
import { PushToggle } from '@/components/settings/push-toggle';

const GROUPS = [
  {
    title: 'פעילות חברתית',
    items: [
      { key: 'new_follower', label: 'עוקב חדש' },
      { key: 'post_like', label: 'לייק על פוסט שלי' },
      { key: 'post_comment', label: 'תגובה על פוסט שלי' },
      { key: 'new_message', label: 'הודעה חדשה' },
    ],
  },
  {
    title: 'הזמנות ומפגשים',
    items: [
      { key: 'bookings', label: 'הזמנות, אישורים, שינויים וביטולים' },
      { key: 'reminders', label: 'תזכורות לפני מפגש (24 שעות ושעתיים)' },
    ],
  },
  {
    title: 'ביקורות',
    items: [{ key: 'reviews', label: 'ביקורת חדשה ותגובה לביקורת' }],
  },
] as const;

/** בחירה אילו התראות לקבל, ובאיזה ערוץ. */
export function NotificationSettingsForm({ prefs }: { prefs: Record<string, unknown> }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [form, setForm] = React.useState({
    in_app: prefs.in_app !== false,
    push: prefs.push === true,
    new_message: prefs.new_message !== false,
    new_follower: prefs.new_follower !== false,
    post_like: prefs.post_like !== false,
    post_comment: prefs.post_comment !== false,
    bookings: prefs.bookings !== false,
    reminders: prefs.reminders !== false,
    reviews: prefs.reviews !== false,
  });

  const save = async () => {
    setPending(true);
    const result = await updateNotificationPrefsAction(form);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'ההעדפות נשמרו');
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <section className="surface divide-y divide-border">
        <div className="flex items-center justify-between gap-3 p-4">
          <Label htmlFor="in_app" className="cursor-pointer font-normal">
            התראות בתוך האפליקציה
            <span className="block text-xs text-muted-foreground">הפעמון בסרגל העליון</span>
          </Label>
          <Switch
            id="in_app"
            checked={form.in_app}
            onCheckedChange={(checked) => setForm((f) => ({ ...f, in_app: checked }))}
          />
        </div>

        <div className="p-4">
          <PushToggle
            enabled={form.push}
            onChange={(value) => setForm((f) => ({ ...f, push: value }))}
          />
        </div>
      </section>

      {GROUPS.map((group) => (
        <section key={group.title} className="surface">
          <h2 className="border-b border-border px-4 py-3 font-medium">{group.title}</h2>
          <div className="divide-y divide-border">
            {group.items.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3 p-4">
                <Label htmlFor={item.key} className="cursor-pointer font-normal">
                  {item.label}
                </Label>
                <Switch
                  id={item.key}
                  checked={form[item.key as keyof typeof form] as boolean}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, [item.key]: checked }))}
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      <Button onClick={save} loading={pending}>
        שמירת ההעדפות
      </Button>
    </div>
  );
}
