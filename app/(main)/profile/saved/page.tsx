import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { Bookmark, BadgeCheck, Star } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { getSavedContent } from '@/lib/data/profiles';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { UserAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { formatRating } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'שמורים' };

export default async function SavedPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const { posts, professionals } = await getSavedContent();

  return (
    <div className="space-y-4 px-4 py-4 lg:px-0">
      <header>
        <h1 className="text-xl font-bold">שמורים</h1>
        <p className="text-sm text-muted-foreground">הרשימה הזו פרטית – רק אתם רואים אותה.</p>
      </header>

      <Tabs defaultValue="posts">
        <TabsList>
          <TabsTrigger value="posts">עבודות ({posts.length})</TabsTrigger>
          <TabsTrigger value="professionals">בעלי מקצוע ({professionals.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="posts">
          {posts.length === 0 ? (
            <EmptyState
              icon={Bookmark}
              title="אין עבודות שמורות"
              description="לחצו על סימן הסימנייה בכל פוסט כדי לשמור אותו לכאן."
              action={
                <Button asChild>
                  <Link href="/">לפיד</Link>
                </Button>
              }
            />
          ) : (
            <ul className="grid grid-cols-3 gap-1 sm:gap-2">
              {posts.map((post) => {
                const cover = [...post.post_media].sort((a, b) => a.position - b.position)[0];
                return (
                  <li key={post.id}>
                    <Link
                      href={`/p/${post.id}`}
                      className="relative block aspect-square overflow-hidden rounded-lg bg-muted sm:rounded-xl"
                    >
                      {cover ? (
                        <Image
                          src={cover.url}
                          alt={post.title}
                          fill
                          sizes="(max-width: 640px) 33vw, 220px"
                          className="object-cover"
                          loading="lazy"
                        />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="professionals">
          {professionals.length === 0 ? (
            <EmptyState
              icon={Bookmark}
              title="אין בעלי מקצוע שמורים"
              description="שמרו בעלי מקצוע שאהבתם כדי למצוא אותם מהר בפעם הבאה."
              action={
                <Button asChild>
                  <Link href="/search">חיפוש</Link>
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2">
              {professionals.map((professional) => (
                <li key={professional.id}>
                  <Link
                    href={`/u/${professional.profiles?.username ?? ''}`}
                    className="surface surface-hover flex items-center gap-3 p-3"
                  >
                    <UserAvatar
                      src={professional.avatar_url}
                      name={professional.business_name}
                      className="size-12"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 font-medium">
                        <span className="truncate">{professional.business_name}</span>
                        {professional.is_verified ? (
                          <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="מאומת" />
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {professional.headline ?? professional.cities?.name}
                      </p>
                    </div>
                    {professional.rating_count > 0 ? (
                      <span className="flex shrink-0 items-center gap-1 text-sm">
                        <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />
                        {formatRating(professional.rating_avg)}
                      </span>
                    ) : null}
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
