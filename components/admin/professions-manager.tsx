'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, GitMerge, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatRelativeTime } from '@/lib/format';
import {
  approveProfessionRequestAction,
  mergeProfessionRequestAction,
  rejectProfessionRequestAction,
  toggleProfessionActiveAction,
} from '@/lib/actions/admin';

type Profession = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  is_active: boolean;
  is_core: boolean;
  professionals_count: number;
};

type Request = {
  id: string;
  raw_name: string;
  note: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  profiles: { id: string; username: string; full_name: string; avatar_url: string | null } | null;
};

/** ניהול קטלוג המקצועות ובקשות להוספת מקצוע חדש. */
export function ProfessionsManager({
  professions,
  requests,
}: {
  professions: Profession[];
  requests: Request[];
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = React.useState<Record<string, string>>({});
  const [rejectNote, setRejectNote] = React.useState<Record<string, string>>({});

  const openRequests = requests.filter((request) => request.status === 'pending');

  const run = async (id: string, action: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setPending(id);
    const result = await action();
    setPending(null);

    if (!result.ok) {
      toast.error(result.error ?? 'הפעולה נכשלה');
      return;
    }
    toast.success(result.message ?? 'בוצע');
    router.refresh();
  };

  return (
    <Tabs defaultValue="requests">
      <TabsList>
        <TabsTrigger value="requests">בקשות ({openRequests.length})</TabsTrigger>
        <TabsTrigger value="catalog">קטלוג ({professions.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="requests">
        {openRequests.length === 0 ? (
          <EmptyState
            icon={Check}
            title="אין בקשות ממתינות"
            description='כשבעל מקצוע בוחר "מקצוע אחר" ומקליד שם חדש, הבקשה תופיע כאן לאישור.'
          />
        ) : (
          <ul className="space-y-3">
            {openRequests.map((request) => (
              <li key={request.id} className="surface space-y-3 p-4">
                <div>
                  <p className="font-semibold">{request.raw_name}</p>
                  <p className="text-xs text-muted-foreground">
                    ביקש/ה {request.profiles?.full_name} · {formatRelativeTime(request.created_at)}
                  </p>
                  {request.note ? <p className="mt-1 text-sm">{request.note}</p> : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    loading={pending === request.id}
                    onClick={() => run(request.id, () => approveProfessionRequestAction(request.id))}
                  >
                    <Check className="size-4" aria-hidden />
                    אישור והוספה לרשימה
                  </Button>

                  <div className="flex items-center gap-1">
                    <Select
                      value={mergeTarget[request.id] ?? ''}
                      onValueChange={(value) => setMergeTarget((m) => ({ ...m, [request.id]: value }))}
                    >
                      <SelectTrigger className="h-9 w-48" aria-label="מיזוג למקצוע קיים">
                        <SelectValue placeholder="מיזוג למקצוע קיים" />
                      </SelectTrigger>
                      <SelectContent>
                        {professions.map((profession) => (
                          <SelectItem key={profession.id} value={profession.id}>
                            {profession.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!mergeTarget[request.id]}
                      onClick={() =>
                        run(request.id, () =>
                          mergeProfessionRequestAction(request.id, mergeTarget[request.id]),
                        )
                      }
                    >
                      <GitMerge className="size-4" aria-hidden />
                      מיזוג
                    </Button>
                  </div>
                </div>

                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor={`reject-${request.id}`} className="text-xs">
                      סיבת דחייה
                    </Label>
                    <Input
                      id={`reject-${request.id}`}
                      value={rejectNote[request.id] ?? ''}
                      onChange={(event) =>
                        setRejectNote((n) => ({ ...n, [request.id]: event.target.value }))
                      }
                      className="h-9"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() =>
                      run(request.id, () =>
                        rejectProfessionRequestAction(request.id, rejectNote[request.id] ?? ''),
                      )
                    }
                  >
                    <X className="size-4" aria-hidden />
                    דחייה
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="catalog">
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border/70 bg-card">
          {professions.map((profession) => (
            <li key={profession.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  {profession.name}
                  {profession.is_core ? <Badge variant="secondary">ליבה</Badge> : null}
                  {!profession.is_active ? <Badge variant="neutral">מוסתר</Badge> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {profession.professionals_count} בעלי מקצוע · <span dir="ltr">{profession.slug}</span>
                </p>
              </div>

              <Switch
                checked={profession.is_active}
                aria-label={`הפעלת המקצוע ${profession.name}`}
                onCheckedChange={(checked) =>
                  run(profession.id, () => toggleProfessionActiveAction(profession.id, checked))
                }
              />
            </li>
          ))}
        </ul>
      </TabsContent>
    </Tabs>
  );
}
