'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck,
  Bookmark,
  CalendarPlus,
  Flag,
  MapPin,
  MessageSquare,
  Pencil,
  Share2,
  Star,
  Timer,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/ui/avatar';
import { ReportDialog } from '@/components/shared/report-dialog';
import { toggleFollowAction, toggleSaveProfessionalAction } from '@/lib/actions/social';
import { openConversationAction } from '@/lib/actions/messages';
import { formatCompactNumber, formatExperience, formatRating, formatResponseTime } from '@/lib/format';
import { cn } from '@/lib/utils';
type ProfessionTag = { id: string; name: string; slug: string };

type ProfileLike = {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  followers_count: number;
  following_count: number;
  cities?: { id: string; name: string; district: string | null } | null;
};

type ProfessionalLike = {
  id: string;
  business_name: string;
  headline: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  is_verified: boolean;
  status: string;
  rating_avg: number;
  rating_count: number;
  followers_count: number;
  clients_count: number;
  completed_bookings_count: number;
  years_experience: number | null;
  response_time_minutes: number | null;
  available_today: boolean;
  available_now: boolean;
  available_now_until: string | null;
  cities?: { id: string; name: string; district: string | null } | null;
} | null;

export function ProfileHeader({
  profile,
  professional,
  professions,
  isSelf,
  isFollowing,
  isLoggedIn,
}: {
  profile: ProfileLike;
  professional: ProfessionalLike;
  professions: ProfessionTag[];
  isSelf: boolean;
  isFollowing: boolean;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = React.useState(isFollowing);
  const [saved, setSaved] = React.useState(false);
  const [reportOpen, setReportOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const displayName = professional?.business_name ?? profile.full_name;
  const avatar = professional?.avatar_url ?? profile.avatar_url;
  const city = professional?.cities ?? profile.cities;

  const availableNow =
    professional?.available_now &&
    (!professional.available_now_until || new Date(professional.available_now_until) > new Date());

  const requireLogin = () => {
    if (isLoggedIn) return false;
    toast.error('צריך להתחבר', { action: { label: 'התחברות', onClick: () => router.push('/login') } });
    return true;
  };

  const onFollow = async () => {
    if (requireLogin()) return;
    const next = !following;
    setFollowing(next);
    const result = await toggleFollowAction(profile.id, next);
    if (!result.ok) {
      setFollowing(!next);
      toast.error(result.error);
    }
  };

  const onSave = async () => {
    if (requireLogin() || !professional) return;
    const next = !saved;
    setSaved(next);
    const result = await toggleSaveProfessionalAction(professional.id, next);
    if (!result.ok) {
      setSaved(!next);
      toast.error(result.error);
    } else {
      toast.success(next ? 'נשמר לרשימה שלך' : 'הוסר מהשמורים');
    }
  };

  const onMessage = async () => {
    if (requireLogin()) return;
    setPending(true);
    const result = await openConversationAction(profile.id);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.push(`/messages/${result.data.conversationId}`);
  };

  const onShare = async () => {
    const url = `${window.location.origin}/u/${profile.username}`;
    try {
      if (navigator.share) await navigator.share({ title: displayName, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success('הקישור הועתק');
      }
    } catch {
      /* בוטל על ידי המשתמש */
    }
  };

  return (
    <header>
      {/* תמונת כיסוי */}
      <div className="relative h-32 bg-gradient-to-br from-primary/20 via-accent to-secondary sm:h-44">
        {professional?.cover_url ? (
          <Image
            src={professional.cover_url}
            alt=""
            fill
            sizes="100vw"
            priority
            className="object-cover"
          />
        ) : null}
      </div>

      <div className="px-4 lg:px-0">
        <div className="-mt-12 flex items-end gap-3">
          <UserAvatar
            src={avatar}
            name={displayName}
            className="size-24 border-4 border-background shadow-soft"
          />

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2 pb-1">
            {isSelf ? (
              <>
                <Button variant="outline" size="sm" asChild>
                  <Link href={professional ? '/pro/onboarding' : '/settings/profile'}>
                    <Pencil className="size-4" aria-hidden />
                    עריכת פרופיל
                  </Link>
                </Button>
                {professional ? (
                  <Button size="sm" asChild>
                    <Link href="/create">פרסום עבודה</Link>
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                <Button
                  variant={following ? 'outline' : 'default'}
                  size="sm"
                  onClick={onFollow}
                  aria-pressed={following}
                >
                  {following ? 'עוקב' : 'עקוב'}
                </Button>
                <Button variant="outline" size="sm" onClick={onMessage} loading={pending}>
                  <MessageSquare className="size-4" aria-hidden />
                  הודעה
                </Button>
                {professional ? (
                  <Button size="sm" asChild>
                    <Link href={`/book/${professional.id}`}>
                      <CalendarPlus className="size-4" aria-hidden />
                      הזמנה
                    </Link>
                  </Button>
                ) : null}
              </>
            )}
          </div>
        </div>

        {/* שם ופרטים */}
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold">{displayName}</h1>
            {professional?.is_verified ? (
              <Badge variant="default">
                <BadgeCheck className="size-3.5" aria-hidden />
                מאומת
              </Badge>
            ) : null}
            {availableNow ? (
              <Badge variant="success">
                <span className="live-dot" aria-hidden />
                זמין עכשיו
              </Badge>
            ) : professional?.available_today ? (
              <Badge variant="info">זמין היום</Badge>
            ) : null}
            {professional?.status === 'paused' ? <Badge variant="warning">מושהה</Badge> : null}
            {professional?.status === 'draft' ? <Badge variant="neutral">טיוטה</Badge> : null}
          </div>

          <p className="text-sm text-muted-foreground" dir="ltr">
            @{profile.username}
          </p>

          {professions.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {professions.map((profession) => (
                <li key={profession.id}>
                  <Link href={`/search?profession=${profession.id}`}>
                    <Badge variant="secondary">{profession.name}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          {professional?.headline ? <p className="text-sm">{professional.headline}</p> : null}
          {!professional && profile.bio ? <p className="text-sm">{profile.bio}</p> : null}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {city ? (
              <span className="flex items-center gap-1">
                <MapPin className="size-4" aria-hidden />
                {city.name}
              </span>
            ) : null}
            {professional?.years_experience ? (
              <span>{formatExperience(professional.years_experience)}</span>
            ) : null}
            {professional?.response_time_minutes ? (
              <span className="flex items-center gap-1">
                <Timer className="size-4" aria-hidden />
                {formatResponseTime(professional.response_time_minutes)}
              </span>
            ) : null}
          </div>
        </div>

        {/* מדדים */}
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            label="דירוג"
            value={
              professional && professional.rating_count > 0 ? (
                <span className="flex items-center justify-center gap-1">
                  <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />
                  {formatRating(professional.rating_avg)}
                </span>
              ) : (
                '—'
              )
            }
            hint={professional ? `${professional.rating_count} ביקורות` : undefined}
          />
          <Stat
            label="עוקבים"
            value={formatCompactNumber(profile.followers_count)}
            href={`/u/${profile.username}/followers`}
          />
          {professional ? (
            <>
              <Stat label="טיפולים" value={formatCompactNumber(professional.completed_bookings_count)} />
              <Stat label="לקוחות" value={formatCompactNumber(professional.clients_count)} />
            </>
          ) : (
            <Stat
              label="עוקב אחרי"
              value={formatCompactNumber(profile.following_count)}
              href={`/u/${profile.username}/following`}
            />
          )}
        </dl>

        {/* פעולות משניות */}
        <div className="mt-3 flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onShare}>
            <Share2 className="size-4" aria-hidden />
            שיתוף
          </Button>
          {professional && !isSelf ? (
            <Button variant="ghost" size="sm" onClick={onSave} aria-pressed={saved}>
              <Bookmark className={cn('size-4', saved && 'fill-current')} aria-hidden />
              {saved ? 'נשמר' : 'שמירה'}
            </Button>
          ) : null}
          {!isSelf ? (
            <Button variant="ghost" size="sm" onClick={() => setReportOpen(true)}>
              <Flag className="size-4" aria-hidden />
              דיווח
            </Button>
          ) : null}
        </div>
      </div>

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        targetType={professional ? 'professional' : 'user'}
        targetId={professional ? professional.id : profile.id}
        title={professional ? 'דיווח על בעל מקצוע' : 'דיווח על משתמש'}
      />
    </header>
  );
}

function Stat({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  href?: string;
}) {
  const content = (
    <div className="rounded-xl bg-muted/60 p-3 text-center">
      <dd className="text-lg font-bold">{value}</dd>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );

  return href ? (
    <Link href={href} className="transition-opacity hover:opacity-80">
      {content}
    </Link>
  ) : (
    content
  );
}
