import Link from 'next/link';
import { Users } from 'lucide-react';
import { UserAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';

type Person = {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  is_professional?: boolean;
};

/** רשימת אנשים – עוקבים, נעקבים או מי שעשה לייק. */
export function PeopleList({
  title,
  people,
  emptyTitle,
}: {
  title: string;
  people: Person[];
  emptyTitle: string;
}) {
  return (
    <div className="space-y-4 px-4 py-4 lg:px-0">
      <h1 className="text-xl font-bold">{title}</h1>

      {people.length === 0 ? (
        <EmptyState icon={Users} title={emptyTitle} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border/70 bg-card">
          {people.map((person) => (
            <li key={person.id}>
              <Link
                href={`/u/${person.username}`}
                className="flex items-center gap-3 p-3 transition-colors hover:bg-muted/60"
              >
                <UserAvatar src={person.avatar_url} name={person.full_name} className="size-11" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    <span className="truncate font-medium">{person.full_name}</span>
                    {person.is_professional ? <Badge variant="secondary">בעל מקצוע</Badge> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground" dir="ltr">
                    @{person.username}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
