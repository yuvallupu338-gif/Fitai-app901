-- =====================================================================
-- 0004 – הרשת החברתית: מעקב, פוסטים, מדיה, לייקים, תגובות ושמירות
-- =====================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------
-- מעקב
-- ---------------------------------------------------------------------
create table if not exists public.follows (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);

create index if not exists follows_following_idx on public.follows (following_id, created_at desc);
create index if not exists follows_follower_idx on public.follows (follower_id, created_at desc);

-- ---------------------------------------------------------------------
-- חסימות
-- ---------------------------------------------------------------------
create table if not exists public.blocked_users (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  reason     text,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocked_no_self check (blocker_id <> blocked_id)
);

create index if not exists blocked_users_blocked_idx on public.blocked_users (blocked_id);

-- בדיקה דו־כיוונית של חסימה. security definer כדי לא להיתקל ב־RLS.
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.blocked_users
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

-- ---------------------------------------------------------------------
-- פוסטים (עבודות בעלי המקצוע)
-- ---------------------------------------------------------------------
create table if not exists public.professional_posts (
  id                uuid primary key default gen_random_uuid(),
  professional_id   uuid not null references public.professional_profiles (id) on delete cascade,
  author_profile_id uuid not null references public.profiles (id) on delete cascade,
  service_id        uuid references public.professional_services (id) on delete set null,
  profession_id     uuid references public.professions (id) on delete set null,
  city_id           uuid references public.cities (id) on delete set null,

  title             text not null,
  description       text,
  tags              text[] not null default '{}',
  price_estimate    numeric(10,2),
  price_type        public.price_type not null default 'on_request',
  duration_minutes  integer,

  is_before_after   boolean not null default false,
  consent_confirmed boolean not null default false,

  status            public.post_status not null default 'draft',
  is_pinned         boolean not null default false,
  pinned_order      smallint,
  published_at      timestamptz,

  likes_count       integer not null default 0,
  comments_count    integer not null default 0,
  saves_count       integer not null default 0,
  shares_count      integer not null default 0,
  views_count       integer not null default 0,
  bookings_count    integer not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint posts_title_len check (char_length(title) between 2 and 120),
  constraint posts_pinned_order_range check (pinned_order is null or pinned_order between 1 and 3)
);

create index if not exists posts_professional_idx
  on public.professional_posts (professional_id, published_at desc nulls last) where deleted_at is null;
create index if not exists posts_feed_idx
  on public.professional_posts (published_at desc) where status = 'published' and deleted_at is null;
create index if not exists posts_city_idx on public.professional_posts (city_id, published_at desc);
create index if not exists posts_profession_idx on public.professional_posts (profession_id, published_at desc);
create index if not exists posts_service_idx on public.professional_posts (service_id);
create index if not exists posts_tags_idx on public.professional_posts using gin (tags);
create index if not exists posts_popular_idx
  on public.professional_posts (likes_count desc, published_at desc) where status = 'published';
create index if not exists posts_title_trgm_idx
  on public.professional_posts using gin (public.normalize_text(title) gin_trgm_ops);

-- מקסימום 3 פוסטים מוצמדים לכל בעל מקצוע
create unique index if not exists posts_pinned_unique
  on public.professional_posts (professional_id, pinned_order)
  where is_pinned and pinned_order is not null and deleted_at is null;

drop trigger if exists professional_posts_set_updated_at on public.professional_posts;
create trigger professional_posts_set_updated_at
  before update on public.professional_posts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- מדיה של פוסט (תמונות / סרטונים, כולל לפני–אחרי)
-- ---------------------------------------------------------------------
create table if not exists public.post_media (
  id               uuid primary key default gen_random_uuid(),
  post_id          uuid not null references public.professional_posts (id) on delete cascade,
  media_type       public.media_type not null default 'image',
  url              text not null,
  thumbnail_url    text,
  width            integer,
  height           integer,
  duration_seconds integer,
  position         smallint not null default 0,
  before_after_role text check (before_after_role in ('before', 'after')),
  alt_text         text,
  created_at       timestamptz not null default now()
);

create index if not exists post_media_post_idx on public.post_media (post_id, position);

-- ---------------------------------------------------------------------
-- לייקים
-- ---------------------------------------------------------------------
create table if not exists public.post_likes (
  post_id    uuid not null references public.professional_posts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

create index if not exists post_likes_profile_idx on public.post_likes (profile_id, created_at desc);

-- ---------------------------------------------------------------------
-- תגובות
-- ---------------------------------------------------------------------
create table if not exists public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.professional_posts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  parent_id  uuid references public.post_comments (id) on delete cascade,
  body       text not null,
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint comment_body_len check (char_length(body) between 1 and 1000)
);

create index if not exists post_comments_post_idx
  on public.post_comments (post_id, created_at) where deleted_at is null;
create index if not exists post_comments_profile_idx on public.post_comments (profile_id, created_at desc);

drop trigger if exists post_comments_set_updated_at on public.post_comments;
create trigger post_comments_set_updated_at
  before update on public.post_comments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- שמירות
-- ---------------------------------------------------------------------
create table if not exists public.saved_posts (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  post_id    uuid not null references public.professional_posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, post_id)
);

create index if not exists saved_posts_profile_idx on public.saved_posts (profile_id, created_at desc);

create table if not exists public.saved_professionals (
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (profile_id, professional_id)
);

create index if not exists saved_professionals_profile_idx
  on public.saved_professionals (profile_id, created_at desc);

-- ---------------------------------------------------------------------
-- צפיות (פרופיל ופוסט) – נמדדות פעם ביום לכל צופה
-- ---------------------------------------------------------------------
create table if not exists public.profile_views (
  id              uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  viewer_id       uuid references public.profiles (id) on delete set null,
  view_day        date not null default current_date,
  created_at      timestamptz not null default now()
);

create unique index if not exists profile_views_unique_day
  on public.profile_views (professional_id, viewer_id, view_day) where viewer_id is not null;
create index if not exists profile_views_professional_idx
  on public.profile_views (professional_id, view_day desc);

create table if not exists public.post_views (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.professional_posts (id) on delete cascade,
  viewer_id  uuid references public.profiles (id) on delete set null,
  view_day   date not null default current_date,
  created_at timestamptz not null default now()
);

create unique index if not exists post_views_unique_day
  on public.post_views (post_id, viewer_id, view_day) where viewer_id is not null;
create index if not exists post_views_post_idx on public.post_views (post_id, view_day desc);

-- ---------------------------------------------------------------------
-- חיפושים שמורים והיסטוריית חיפוש
-- ---------------------------------------------------------------------
create table if not exists public.saved_searches (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  name             text not null,
  query            jsonb not null default '{}'::jsonb,
  notify_on_match  boolean not null default false,
  last_notified_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists saved_searches_profile_idx on public.saved_searches (profile_id, created_at desc);
create index if not exists saved_searches_notify_idx on public.saved_searches (notify_on_match) where notify_on_match;

drop trigger if exists saved_searches_set_updated_at on public.saved_searches;
create trigger saved_searches_set_updated_at
  before update on public.saved_searches
  for each row execute function public.set_updated_at();

create table if not exists public.search_history (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  term       text not null,
  results_count integer,
  created_at timestamptz not null default now()
);

create index if not exists search_history_profile_idx on public.search_history (profile_id, created_at desc);
create index if not exists search_history_term_idx on public.search_history (public.normalize_text(term));

-- מונח חיפוש פופולרי (מצטבר, ללא זיהוי משתמש)
create table if not exists public.popular_searches (
  term       text primary key,
  hits       integer not null default 0,
  updated_at timestamptz not null default now()
);
