-- =====================================================================
-- 0007 – ביקורות, התראות, דיווחים ו־Push
-- =====================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------
-- ביקורות – רק אחרי הזמנה שהושלמה
-- ---------------------------------------------------------------------
create table if not exists public.reviews (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null unique references public.bookings (id) on delete cascade,
  professional_id  uuid not null references public.professional_profiles (id) on delete cascade,
  client_id        uuid not null references public.profiles (id) on delete cascade,
  service_id       uuid references public.professional_services (id) on delete set null,
  rating           smallint not null check (rating between 1 and 5),
  body             text,
  image_urls       text[] not null default '{}',
  is_verified_booking boolean not null default true,
  is_hidden        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint review_body_len check (body is null or char_length(body) <= 2000)
);

create index if not exists reviews_professional_idx
  on public.reviews (professional_id, created_at desc) where deleted_at is null and not is_hidden;
create index if not exists reviews_client_idx on public.reviews (client_id, created_at desc);
create index if not exists reviews_service_idx on public.reviews (service_id);
create index if not exists reviews_rating_idx on public.reviews (professional_id, rating);

drop trigger if exists reviews_set_updated_at on public.reviews;
create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

-- תגובת בעל המקצוע – אחת לכל ביקורת
create table if not exists public.review_replies (
  id              uuid primary key default gen_random_uuid(),
  review_id       uuid not null unique references public.reviews (id) on delete cascade,
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  body            text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint reply_body_len check (char_length(body) between 1 and 1500)
);

drop trigger if exists review_replies_set_updated_at on public.review_replies;
create trigger review_replies_set_updated_at
  before update on public.review_replies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- התראות
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  type        public.notification_type not null,
  title       text not null,
  body        text,
  actor_id    uuid references public.profiles (id) on delete set null,
  entity_type text,
  entity_id   uuid,
  link        text,
  data        jsonb not null default '{}'::jsonb,
  is_read     boolean not null default false,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_profile_idx
  on public.notifications (profile_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (profile_id) where not is_read;

-- ---------------------------------------------------------------------
-- דיווחים
-- ---------------------------------------------------------------------
create table if not exists public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null references public.profiles (id) on delete cascade,
  target_type     public.report_target not null,
  target_id       uuid not null,
  reason          text not null,
  details         text,
  status          public.report_status not null default 'open',
  handled_by      uuid references public.profiles (id) on delete set null,
  handled_at      timestamptz,
  resolution_note text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists reports_status_idx on public.reports (status, created_at desc);
create index if not exists reports_target_idx on public.reports (target_type, target_id);
create unique index if not exists reports_unique_open
  on public.reports (reporter_id, target_type, target_id)
  where status in ('open', 'reviewing');

drop trigger if exists reports_set_updated_at on public.reports;
create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- מנויי Push
-- ---------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create index if not exists push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

-- ---------------------------------------------------------------------
-- אירועי מוצר (סטטיסטיקות למנהל)
-- ---------------------------------------------------------------------
create table if not exists public.activity_log (
  id         bigserial primary key,
  profile_id uuid references public.profiles (id) on delete set null,
  action     text not null,
  entity_type text,
  entity_id  uuid,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_created_idx on public.activity_log (created_at desc);
create index if not exists activity_log_action_idx on public.activity_log (action, created_at desc);
