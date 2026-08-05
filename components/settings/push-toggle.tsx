'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { savePushSubscriptionAction, removePushSubscriptionAction } from '@/lib/actions/notifications';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

/** הפעלת התראות Push בדפדפן (דורש מפתחות VAPID בהגדרות הסביבה). */
export function PushToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const [supported, setSupported] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    setSupported(
      typeof window !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    );
  }, []);

  const toggle = async (next: boolean) => {
    if (!supported) return;
    setPending(true);

    try {
      if (!next) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await removePushSubscriptionAction(subscription.endpoint);
          await subscription.unsubscribe();
        }
        onChange(false);
        toast.success('התראות Push בוטלו');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error('הדפדפן חסם את ההתראות');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string),
      });

      const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const result = await savePushSubscriptionAction({
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent: navigator.userAgent,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      onChange(true);
      toast.success('התראות Push הופעלו');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'הפעלת ההתראות נכשלה');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor="push" className="cursor-pointer font-normal">
        התראות Push לטלפון
        <span className="block text-xs text-muted-foreground">
          {supported
            ? 'מקבלים התראה גם כשהאפליקציה סגורה'
            : 'לא זמין בדפדפן הזה או שלא הוגדרו מפתחות VAPID'}
        </span>
      </Label>
      <Switch id="push" checked={enabled} disabled={!supported || pending} onCheckedChange={toggle} />
    </div>
  );
}
