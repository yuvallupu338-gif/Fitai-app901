'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { REPORT_REASONS } from '@/lib/constants';
import { reportAction } from '@/lib/actions/social';
import type { Database } from '@/types/database';

type ReportTarget = Database['public']['Enums']['report_target'];

/** דיאלוג דיווח – משמש לפוסטים, תגובות, משתמשים, הודעות וביקורות. */
export function ReportDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
  title = 'דיווח',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: ReportTarget;
  targetId: string;
  title?: string;
}) {
  const [reason, setReason] = React.useState<string>(REPORT_REASONS[0].value);
  const [details, setDetails] = React.useState('');
  const [pending, setPending] = React.useState(false);

  const submit = async () => {
    setPending(true);
    const result = await reportAction({ targetType, targetId, reason, details: details || null });
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(result.message ?? 'הדיווח נשלח');
    setDetails('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            הדיווח נשלח לצוות בלבד. לא נחשוף את זהותך למי שדווח.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={reason} onValueChange={setReason} className="gap-1">
          {REPORT_REASONS.map((item) => (
            <div key={item.value} className="flex items-center gap-2 rounded-lg p-2 hover:bg-muted">
              <RadioGroupItem value={item.value} id={`reason-${item.value}`} />
              <Label htmlFor={`reason-${item.value}`} className="flex-1 cursor-pointer font-normal">
                {item.label}
              </Label>
            </div>
          ))}
        </RadioGroup>

        <div className="mt-3 space-y-1.5">
          <Label htmlFor="report-details">פרטים נוספים (רשות)</Label>
          <Textarea
            id="report-details"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            maxLength={1000}
            placeholder="ספרו לנו מה קרה…"
          />
        </div>

        <DialogFooter>
          <Button variant="destructive" onClick={submit} loading={pending}>
            שליחת הדיווח
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
