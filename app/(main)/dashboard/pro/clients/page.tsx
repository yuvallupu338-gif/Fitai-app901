import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Users } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { getAllClients, getRegularClients } from '@/lib/data/bookings';
import { RegularClientCard } from '@/components/dashboard/regular-client-card';
import { UserAvatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDate, formatPrice, pluralize } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'לקוחות' };

export default async function ClientsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.user.professionalId) redirect('/pro/onboarding');

  const [regulars, allClients] = await Promise.all([
    getRegularClients(session.user.professionalId),
    getAllClients(session.user.professionalId),
  ]);

  return (
    <div className="space-y-4 px-4 py-4 lg:px-0">
      <h1 className="text-xl font-bold">לקוחות</h1>

      <Tabs defaultValue="regulars">
        <TabsList>
          <TabsTrigger value="regulars">לקוחות קבועים ({regulars.length})</TabsTrigger>
          <TabsTrigger value="all">כל הלקוחות ({allClients.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="regulars">
          {regulars.length === 0 ? (
            <EmptyState
              icon={Users}
              title="אין עדיין לקוחות קבועים"
              description="אחרי טיפול שהושלם אפשר להציע ללקוח להפוך אותו לטיפול קבוע – והוא יופיע כאן."
            />
          ) : (
            <ul className="space-y-3">
              {regulars.map((item) => (
                <li key={item.series.id}>
                  <RegularClientCard
                    seriesId={item.series.id}
                    clientId={item.series.profiles?.id ?? ''}
                    clientName={item.series.profiles?.full_name ?? ''}
                    clientUsername={item.series.profiles?.username ?? ''}
                    clientAvatar={item.series.profiles?.avatar_url ?? null}
                    serviceName={item.series.professional_services?.name ?? ''}
                    frequency={item.series.frequency}
                    weekday={item.series.weekday}
                    startTime={item.series.start_time}
                    priceAmount={item.series.price_amount ? Number(item.series.price_amount) : null}
                    status={item.series.status}
                    address={
                      item.series.service_addresses
                        ? `${item.series.service_addresses.street} ${item.series.service_addresses.house_number ?? ''}${
                            item.series.service_addresses.cities?.name
                              ? `, ${item.series.service_addresses.cities.name}`
                              : ''
                          }`
                        : null
                    }
                    nextBookingAt={item.nextBooking?.scheduled_start ?? null}
                    completedCount={item.completedCount}
                    notes={item.notes}
                  />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="all">
          {allClients.length === 0 ? (
            <EmptyState
              icon={Users}
              title="עדיין אין לקוחות"
              description="כאן יופיעו כל מי שהזמינו אצלכם טיפול."
            />
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border/70 bg-card">
              {allClients.map((client) => (
                <li key={client.profile.id}>
                  <Link
                    href={`/u/${client.profile.username}`}
                    className="flex items-center gap-3 p-3 transition-colors hover:bg-muted/60"
                  >
                    <UserAvatar
                      src={client.profile.avatar_url}
                      name={client.profile.full_name}
                      className="size-11"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{client.profile.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {pluralize(client.visits, 'טיפול אחד', 'טיפולים')} · ביקור אחרון{' '}
                        {formatDate(client.lastVisit)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-medium text-primary">
                      {formatPrice(client.revenue, { compact: true })}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
