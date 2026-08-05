'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { formatDate } from '@/lib/format';
import { deleteAccountAction, exportAccountDataAction } from '@/lib/actions/profile';
import { logoutAction } from '@/lib/actions/auth';

/** ניהול החשבון: הורדת נתונים ומחיקה. */
export function AccountSettings({ username, createdAt }: { username: string; createdAt: string }) {
  const router = useRouter();
  const [exporting, setExporting] = React.useState(false);
  const [confirmName, setConfirmName] = React.useState('');
  const [deleting, setDeleting] = React.useState(false);

  const exportData = async () => {
    setExporting(true);
    const result = await exportAccountDataAction();
    setExporting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `yofi-${username}-data.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('הנתונים הורדו');
  };

  const deleteAccount = async () => {
    setDeleting(true);
    const result = await deleteAccountAction(confirmName);
    setDeleting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success('החשבון נמחק');
    await logoutAction();
    router.push('/');
  };

  return (
    <div className="space-y-4">
      <section className="surface space-y-2 p-4">
        <h2 className="font-semibold">פרטי החשבון</h2>
        <p className="text-sm text-muted-foreground">
          שם משתמש: <span dir="ltr">@{username}</span>
        </p>
        <p className="text-sm text-muted-foreground">נפתח בתאריך {formatDate(createdAt)}</p>
      </section>

      <section className="surface space-y-3 p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Download className="size-4 text-primary" aria-hidden />
          הורדת הנתונים שלי
        </h2>
        <p className="text-sm text-muted-foreground">
          קובץ JSON עם הפרופיל, הפוסטים, ההזמנות, הביקורות, ההודעות והכתובות שלכם.
        </p>
        <Button variant="outline" onClick={exportData} loading={exporting}>
          הורדת הנתונים
        </Button>
      </section>

      <section className="surface space-y-3 border-destructive/30 p-4">
        <h2 className="flex items-center gap-2 font-semibold text-destructive">
          <TriangleAlert className="size-4" aria-hidden />
          מחיקת החשבון
        </h2>
        <p className="text-sm text-muted-foreground">
          מחיקת החשבון מסירה אתכם מהחיפוש ומהפיד ומנתקת את כל המכשירים. הזמנות והיסטוריה נשמרות
          לצורכי תיעוד מול הצד השני, אך הפרופיל לא יהיה נגיש יותר. הפעולה אינה הפיכה.
        </p>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">
              <Trash2 className="size-4" aria-hidden />
              מחיקת החשבון
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>מחיקת החשבון לצמיתות</AlertDialogTitle>
            <AlertDialogDescription>
              כדי לאשר, הקלידו את שם המשתמש שלכם: <strong dir="ltr">{username}</strong>
            </AlertDialogDescription>

            <div className="mt-3 space-y-1.5">
              <Label htmlFor="confirmName">שם משתמש</Label>
              <Input
                id="confirmName"
                dir="auto"
                value={confirmName}
                onChange={(event) => setConfirmName(event.target.value)}
              />
            </div>

            <AlertDialogFooter>
              <AlertDialogAction
                disabled={confirmName.trim().toLowerCase() !== username.toLowerCase() || deleting}
                onClick={(event) => {
                  event.preventDefault();
                  void deleteAccount();
                }}
              >
                {deleting ? 'מוחק…' : 'מחיקה סופית'}
              </AlertDialogAction>
              <AlertDialogCancel>ביטול</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </div>
  );
}
