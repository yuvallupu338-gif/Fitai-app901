'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Ban, Search, ShieldCheck, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/format';
import { setAccountStatusAction } from '@/lib/actions/admin';

type AdminUser = {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
  status: string;
  is_professional: boolean;
  created_at: string;
  cities: { name: string } | null;
  professional_profiles: { id: string; business_name: string; status: string; is_verified: boolean } | null;
};

const STATUS_LABELS: Record<string, string> = {
  active: 'פעיל',
  suspended: 'מושעה',
  banned: 'חסום',
  deleted: 'נמחק',
};

/** רשימת המשתמשים בפאנל הניהול. */
export function UsersTable({ users, query }: { users: AdminUser[]; query: string }) {
  const router = useRouter();
  const [term, setTerm] = React.useState(query);

  const changeStatus = async (id: string, status: 'active' | 'suspended' | 'banned') => {
    const result = await setAccountStatusAction(id, status);
    if (result.ok) {
      toast.success(result.message ?? 'הסטטוס עודכן');
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="space-y-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          router.push(`/admin/users?q=${encodeURIComponent(term)}`);
        }}
        className="relative"
        role="search"
      >
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="חיפוש לפי שם או שם משתמש"
          className="ps-10"
          aria-label="חיפוש משתמשים"
        />
      </form>

      {users.length === 0 ? (
        <EmptyState icon={Search} title="לא נמצאו משתמשים" description="אפשר לנסות מונח חיפוש אחר." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border/70 bg-card">
          {users.map((user) => (
            <li key={user.id} className="flex flex-wrap items-center gap-3 p-3">
              <UserAvatar src={user.avatar_url} name={user.full_name} className="size-10" />

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <Link href={`/u/${user.username}`} className="truncate font-medium hover:underline">
                    {user.full_name}
                  </Link>
                  {user.role !== 'user' ? <Badge variant="default">{user.role === 'admin' ? 'מנהל' : 'מנחה'}</Badge> : null}
                  {user.professional_profiles?.is_verified ? (
                    <ShieldCheck className="size-4 text-primary" aria-label="מאומת" />
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  <span dir="ltr">@{user.username}</span>
                  {user.cities?.name ? ` · ${user.cities.name}` : ''} · הצטרף {formatDate(user.created_at)}
                </p>
              </div>

              <Badge variant={user.status === 'active' ? 'success' : 'danger'}>
                {STATUS_LABELS[user.status]}
              </Badge>

              <div className="flex gap-1">
                {user.status === 'active' ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => changeStatus(user.id, 'suspended')}>
                      השעיה
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => changeStatus(user.id, 'banned')}
                    >
                      <Ban className="size-4" aria-hidden />
                      חסימה
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => changeStatus(user.id, 'active')}>
                    <UserCheck className="size-4" aria-hidden />
                    שחזור
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
