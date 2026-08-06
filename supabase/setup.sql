-- ==========================================================
--  יופי — התקנה מלאה בקובץ אחד
-- ==========================================================
--
--  מה עושים:
--    1. פותחים ב־Supabase את SQL Editor  →  New query
--    2. מדביקים את כל הקובץ הזה
--    3. לוחצים Run
--
--  זהו. נוצרים כל הטבלאות, ההרשאות, הפונקציות ונתוני ההדגמה.
--
--  ⚠ נשאר צעד אחד אחרון בסוף הקובץ: להדביק את ה־JWT Secret שלכם
--    (Project Settings → API → JWT Settings → JWT Secret).
--    בלעדיו ההתחברות לא תעבוד. חפשו למטה: PASTE_YOUR_JWT_SECRET_HERE
--
--  אפשר להריץ את הקובץ שוב בבטחה — הוא אינו מוחק נתונים קיימים.
--
--  נוצר אוטומטית מתוך supabase/migrations ו־supabase/seed.sql.
--  אין לערוך אותו ידנית — יש לערוך את המקור ולהריץ:
--    node scripts/build-setup-sql.mjs
-- ==========================================================



-- ==========================================================
-- 0001_extensions_and_types.sql
-- ==========================================================

-- =====================================================================
-- 0001 – הרחבות, סכימות וטיפוסים
-- =====================================================================
-- קובץ זה מגדיר את התשתית: הרחבות Postgres, טיפוסי enum ופונקציות עזר
-- שמשמשות את כל שאר המיגרציות (כולל מדיניות ה־RLS).
-- =====================================================================

create schema if not exists extensions;
set search_path = public, extensions;

create extension if not exists "pgcrypto"   with schema extensions;
create extension if not exists "citext"     with schema extensions;
create extension if not exists "pg_trgm"    with schema extensions;
create extension if not exists "btree_gist" with schema extensions;
create extension if not exists "unaccent"   with schema extensions;

-- ודא שההרחבות נגישות בנתיב החיפוש של הפונקציות שלנו.
do $$
begin
  execute format('alter database %I set search_path to public, extensions', current_database());
exception when insufficient_privilege then
  raise notice 'לא ניתן לעדכן search_path ברמת מסד הנתונים – ממשיכים.';
end $$;

-- ---------------------------------------------------------------------
-- טיפוסי enum
-- ---------------------------------------------------------------------

do $$ begin
  create type public.account_role as enum ('user', 'moderator', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.account_status as enum ('active', 'suspended', 'banned', 'deleted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.app_mode as enum ('user', 'professional');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.professional_status as enum ('draft', 'pending_review', 'active', 'paused', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.price_type as enum ('fixed', 'range', 'on_request');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.travel_fee_type as enum ('none', 'fixed', 'per_km', 'per_city');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.booking_location_type as enum ('client_home', 'studio', 'event', 'online');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.booking_status as enum (
    'draft',            -- טיוטה
    'pending',          -- ממתין לאישור
    'confirmed',        -- אושר
    'change_proposed',  -- הוצע שינוי
    'cancelled',        -- בוטל
    'on_the_way',       -- בעל המקצוע בדרך
    'arrived',          -- בעל המקצוע הגיע
    'in_progress',      -- בטיפול
    'completed',        -- הושלם
    'no_show'           -- לא התקיים
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.recurrence_frequency as enum (
    'weekly', 'biweekly', 'every_3_weeks', 'every_4_weeks', 'monthly', 'custom'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.series_status as enum ('pending', 'active', 'paused', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.series_approval_mode as enum ('whole_series', 'each_occurrence');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.occurrence_status as enum ('planned', 'booked', 'skipped', 'moved', 'cancelled', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.post_status as enum ('draft', 'published', 'hidden', 'removed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.media_type as enum ('image', 'video');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.message_kind as enum ('text', 'image', 'system');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.request_status as enum ('pending', 'approved', 'rejected', 'merged');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.verification_kind as enum ('phone', 'certificate', 'identity');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_target as enum ('user', 'professional', 'post', 'comment', 'message', 'review');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_type as enum (
    'new_message', 'new_follower', 'post_like', 'post_comment', 'new_post',
    'booking_created', 'booking_confirmed', 'booking_rejected', 'booking_change_proposed',
    'booking_price_changed', 'booking_reminder', 'booking_on_the_way', 'booking_cancelled',
    'booking_completed', 'series_created', 'series_confirmed', 'series_changed', 'series_cancelled',
    'new_review', 'review_reply', 'professional_approved', 'profession_approved',
    'verification_approved', 'system'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- פונקציות עזר גלובליות
-- ---------------------------------------------------------------------

-- מזהה המשתמש המחובר, נלקח מתוך ה־JWT שהאפליקציה חותמת.
-- מאפשר ל־RLS לעבוד גם כשמערכת האימות היא שם משתמש + סיסמה משלנו.
create or replace function public.current_profile_id()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid;
$$;

comment on function public.current_profile_id() is
  'מחזיר את מזהה הפרופיל של המשתמש המחובר לפי ה־JWT. בסיס לכל מדיניות ה־RLS.';

-- עדכון אוטומטי של updated_at.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- נרמול טקסט לצורך חיפוש והשוואה (הסרת ניקוד, רווחים כפולים, אותיות קטנות).
create or replace function public.normalize_text(input text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           trim(lower(coalesce(input, ''))),
           '\s+', ' ', 'g'
         );
$$;

-- נרמול שם מקצוע: מסיר צורות זכר/נקבה נפוצות כדי למנוע כפילויות.
create or replace function public.normalize_profession_name(input text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           regexp_replace(public.normalize_text(input), '[^א-תa-z0-9 ]', '', 'g'),
           '\s*(או|/)\s*', ' ', 'g'
         );
$$;


-- ==========================================================
-- 0002_identity.sql
-- ==========================================================

-- =====================================================================
-- 0002 – זהות, אימות וערים
-- =====================================================================
-- מערכת האימות מבוססת שם משתמש + סיסמה (ללא אימייל).
-- הסיסמאות נשמרות אך ורק כ־hash (scrypt) שנוצר בצד השרת.
-- =====================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------
-- ערים – רשימה ניתנת להרחבה, משמשת להשלמה אוטומטית בהרשמה ובחיפוש
-- ---------------------------------------------------------------------
create table if not exists public.cities (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  name_norm    text generated always as (public.normalize_text(name)) stored,
  district     text,
  latitude     double precision,
  longitude    double precision,
  population   integer,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create unique index if not exists cities_name_key on public.cities (name);
create index if not exists cities_name_norm_trgm_idx on public.cities using gin (name_norm gin_trgm_ops);
create index if not exists cities_active_idx on public.cities (is_active) where is_active;

comment on table public.cities is 'ערים בישראל – מקור לרשימת הבחירה בהרשמה, בפרופיל ובחיפוש.';

-- ---------------------------------------------------------------------
-- פרופילים – רשומת המשתמש המרכזית
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                    uuid primary key default gen_random_uuid(),
  username              extensions.citext not null,
  full_name             text not null,
  password_hash         text not null,
  password_updated_at   timestamptz not null default now(),
  city_id               uuid references public.cities (id) on delete set null,
  avatar_url            text,
  bio                   text,
  birth_date            date,
  role                  public.account_role not null default 'user',
  status                public.account_status not null default 'active',
  active_mode           public.app_mode not null default 'user',
  is_professional       boolean not null default false,

  -- נתוני בטיחות והורות (חשבונות מתחת לגיל 18)
  guardian_name         text,
  guardian_phone        text,
  guardian_approved_at  timestamptz,

  -- מונים חברתיים (מתוחזקים בטריגרים)
  followers_count       integer not null default 0,
  following_count       integer not null default 0,

  -- הגדרות פרטיות והתראות
  privacy               jsonb not null default jsonb_build_object(
                          'show_city', true,
                          'show_reviews', true,
                          'show_following', true,
                          'allow_messages_from', 'everyone'
                        ),
  notification_prefs    jsonb not null default jsonb_build_object(
                          'in_app', true,
                          'push', false,
                          'new_message', true,
                          'new_follower', true,
                          'post_like', true,
                          'post_comment', true,
                          'bookings', true,
                          'reminders', true,
                          'reviews', true
                        ),

  -- הגנה מפני ניסיונות התחברות מרובים
  failed_login_count    integer not null default 0,
  locked_until          timestamptz,

  last_seen_at          timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,

  constraint profiles_username_format check (username ~ '^[a-zA-Z0-9._א-ת]{3,30}$'),
  constraint profiles_full_name_len check (char_length(full_name) between 2 and 80)
);

create unique index if not exists profiles_username_key on public.profiles (username);
create index if not exists profiles_city_idx on public.profiles (city_id);
create index if not exists profiles_status_idx on public.profiles (status);
create index if not exists profiles_created_at_idx on public.profiles (created_at desc);
create index if not exists profiles_full_name_trgm_idx
  on public.profiles using gin (public.normalize_text(full_name) gin_trgm_ops);
create index if not exists profiles_username_trgm_idx
  on public.profiles using gin ((username::text) gin_trgm_ops);

comment on table public.profiles is 'משתמשי האפליקציה. כל משתמש יכול להיות גם בעל מקצוע (ראו professional_profiles).';
comment on column public.profiles.password_hash is 'scrypt hash בלבד – לעולם לא סיסמה גלויה.';

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- שמות משתמש – טבלת שריון ייעודית המבטיחה ייחודיות גלובלית
-- ---------------------------------------------------------------------
create table if not exists public.usernames (
  username    extensions.citext primary key,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create unique index if not exists usernames_profile_id_key on public.usernames (profile_id);

comment on table public.usernames is 'שריון שם משתמש. מונע כפילויות גם בעת שינוי שם משתמש.';

-- שמירה על סנכרון בין profiles.username לטבלת השריון.
create or replace function public.sync_username_reservation()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.usernames (username, profile_id) values (new.username, new.id);
  elsif tg_op = 'UPDATE' and new.username is distinct from old.username then
    delete from public.usernames where profile_id = new.id;
    insert into public.usernames (username, profile_id) values (new.username, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_sync_username on public.profiles;
create trigger profiles_sync_username
  after insert or update of username on public.profiles
  for each row execute function public.sync_username_reservation();

-- ---------------------------------------------------------------------
-- קודי שחזור – מחליפים את שחזור הסיסמה במייל
-- ---------------------------------------------------------------------
create table if not exists public.recovery_codes (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  code_hash   text not null,
  hint        text,
  created_at  timestamptz not null default now(),
  used_at     timestamptz,
  revoked_at  timestamptz
);

create index if not exists recovery_codes_profile_idx on public.recovery_codes (profile_id);
create unique index if not exists recovery_codes_active_per_profile
  on public.recovery_codes (profile_id)
  where used_at is null and revoked_at is null;

comment on table public.recovery_codes is 'קוד שחזור אישי. נשמר כ־hash בלבד ומוצג למשתמש פעם אחת.';

-- ---------------------------------------------------------------------
-- סשנים – עוגיית התחברות מגובה במסד הנתונים (מאפשר ניתוק והיסטוריה)
-- ---------------------------------------------------------------------
create table if not exists public.auth_sessions (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  token_hash   text not null unique,
  user_agent   text,
  ip_address   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz
);

create index if not exists auth_sessions_profile_idx on public.auth_sessions (profile_id, created_at desc);
create index if not exists auth_sessions_expiry_idx on public.auth_sessions (expires_at);

comment on table public.auth_sessions is 'היסטוריית התחברויות + אפשרות ניתוק מרחוק. העוגייה מכילה טוקן אקראי, המסד שומר רק hash.';

-- ---------------------------------------------------------------------
-- ניסיונות התחברות – בסיס ל־rate limiting ולנעילה זמנית
-- ---------------------------------------------------------------------
create table if not exists public.login_attempts (
  id          bigserial primary key,
  username    extensions.citext,
  ip_address  text,
  success     boolean not null default false,
  reason      text,
  created_at  timestamptz not null default now()
);

create index if not exists login_attempts_username_idx on public.login_attempts (username, created_at desc);
create index if not exists login_attempts_ip_idx on public.login_attempts (ip_address, created_at desc);

-- ---------------------------------------------------------------------
-- אירועי אבטחה – תיעוד שינויים רגישים
-- ---------------------------------------------------------------------
create table if not exists public.security_events (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid references public.profiles (id) on delete set null,
  event       text not null,
  details     jsonb not null default '{}'::jsonb,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists security_events_profile_idx on public.security_events (profile_id, created_at desc);

-- ---------------------------------------------------------------------
-- הגבלת קצב כללית (פעולות רגישות: הרשמה, שליחת הודעות, יצירת פוסטים)
-- ---------------------------------------------------------------------
create table if not exists public.rate_limits (
  bucket      text not null,
  identifier  text not null,
  window_start timestamptz not null,
  count       integer not null default 0,
  primary key (bucket, identifier, window_start)
);

create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

-- פונקציה אטומית להגבלת קצב: מחזירה true אם מותר לבצע את הפעולה.
create or replace function public.consume_rate_limit(
  p_bucket text,
  p_identifier text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits (bucket, identifier, window_start, count)
  values (p_bucket, p_identifier, v_window, 1)
  on conflict (bucket, identifier, window_start)
  do update set count = public.rate_limits.count + 1
  returning count into v_count;

  delete from public.rate_limits where window_start < now() - interval '1 day';

  return v_count <= p_limit;
end;
$$;

comment on function public.consume_rate_limit is 'מונה פעולות בחלון זמן. מחזיר false כאשר חרגו מהמכסה.';


-- ==========================================================
-- 0003_professionals.sql
-- ==========================================================

-- =====================================================================
-- 0003 – מקצועות, פרופילים מקצועיים, שירותים וזמינות
-- =====================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------
-- מקצועות – רשימה דינמית מהמסד, לא רשימה קבועה בקוד
-- ---------------------------------------------------------------------
create table if not exists public.professions (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null,
  name         text not null,
  name_norm    text generated always as (public.normalize_profession_name(name)) stored,
  description  text,
  icon         text,
  category     text not null default 'beauty',
  is_active    boolean not null default true,
  is_core      boolean not null default false,
  sort_order   integer not null default 100,
  created_by   uuid references public.profiles (id) on delete set null,
  approved_by  uuid references public.profiles (id) on delete set null,
  professionals_count integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists professions_slug_key on public.professions (slug);
create unique index if not exists professions_name_norm_key on public.professions (name_norm);
create index if not exists professions_active_idx on public.professions (is_active, sort_order);
create index if not exists professions_name_trgm_idx on public.professions using gin (name_norm gin_trgm_ops);

comment on table public.professions is 'קטלוג המקצועות. ניתן להרחבה על ידי בקשות מבעלי מקצוע ואישור מנהל.';

drop trigger if exists professions_set_updated_at on public.professions;
create trigger professions_set_updated_at
  before update on public.professions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- בקשות להוספת מקצוע חדש ("מקצוע אחר")
-- ---------------------------------------------------------------------
create table if not exists public.profession_requests (
  id                   uuid primary key default gen_random_uuid(),
  requested_by         uuid not null references public.profiles (id) on delete cascade,
  raw_name             text not null,
  name_norm            text generated always as (public.normalize_profession_name(raw_name)) stored,
  note                 text,
  status               public.request_status not null default 'pending',
  admin_note           text,
  merged_into          uuid references public.professions (id) on delete set null,
  created_profession_id uuid references public.professions (id) on delete set null,
  reviewed_by          uuid references public.profiles (id) on delete set null,
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- מונע כפילויות של אותה הצעה בזמן שהיא ממתינה לאישור.
create unique index if not exists profession_requests_pending_unique
  on public.profession_requests (name_norm)
  where status = 'pending';
create index if not exists profession_requests_status_idx on public.profession_requests (status, created_at desc);
create index if not exists profession_requests_norm_trgm_idx
  on public.profession_requests using gin (name_norm gin_trgm_ops);

drop trigger if exists profession_requests_set_updated_at on public.profession_requests;
create trigger profession_requests_set_updated_at
  before update on public.profession_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- פרופיל מקצועי
-- ---------------------------------------------------------------------
create table if not exists public.professional_profiles (
  id                    uuid primary key default gen_random_uuid(),
  profile_id            uuid not null unique references public.profiles (id) on delete cascade,
  business_name         text not null,
  headline              text,
  bio                   text,
  years_experience      integer check (years_experience is null or years_experience between 0 and 70),
  city_id               uuid references public.cities (id) on delete set null,
  avatar_url            text,
  cover_url             text,
  website_url           text,
  social_links          jsonb not null default '{}'::jsonb,

  status                public.professional_status not null default 'draft',
  is_verified           boolean not null default false,
  verified_at           timestamptz,
  phone_verified        boolean not null default false,

  -- מקום מתן השירות
  accepts_home_visits   boolean not null default false,
  accepts_studio        boolean not null default false,
  accepts_events        boolean not null default false,
  accepts_online        boolean not null default false,

  -- נסיעות
  max_travel_km         integer,
  travel_fee_type       public.travel_fee_type not null default 'none',
  travel_fee            numeric(10,2) not null default 0,

  -- מדיניות הזמנות
  min_lead_time_minutes integer not null default 120,
  max_lead_time_days    integer not null default 90,
  cancellation_policy   text,
  default_buffer_minutes integer not null default 15,

  -- זמינות מהירה
  available_today       boolean not null default false,
  available_now         boolean not null default false,
  available_now_until   timestamptz,

  -- מדדים מחושבים (טריגרים)
  rating_avg            numeric(3,2) not null default 0,
  rating_count          integer not null default 0,
  completed_bookings_count integer not null default 0,
  clients_count         integer not null default 0,
  followers_count       integer not null default 0,
  posts_count           integer not null default 0,
  profile_views_count   integer not null default 0,
  response_time_minutes integer,

  published_at          timestamptz,
  paused_at             timestamptz,
  rejection_reason      text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,

  constraint professional_business_name_len check (char_length(business_name) between 2 and 80),
  constraint professional_travel_valid check (
    travel_fee_type = 'none' or accepts_home_visits or accepts_events
  )
);

create index if not exists professional_profiles_status_idx on public.professional_profiles (status) where deleted_at is null;
create index if not exists professional_profiles_city_idx on public.professional_profiles (city_id, status);
create index if not exists professional_profiles_rating_idx on public.professional_profiles (rating_avg desc, rating_count desc);
create index if not exists professional_profiles_published_idx on public.professional_profiles (published_at desc nulls last);
create index if not exists professional_profiles_available_idx
  on public.professional_profiles (available_today, available_now) where status = 'active';
create index if not exists professional_profiles_name_trgm_idx
  on public.professional_profiles using gin (public.normalize_text(business_name) gin_trgm_ops);

comment on table public.professional_profiles is 'פרופיל מקצועי. פרטי קשר פרטיים נשמרים בטבלה נפרדת (professional_contact_details).';

drop trigger if exists professional_profiles_set_updated_at on public.professional_profiles;
create trigger professional_profiles_set_updated_at
  before update on public.professional_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- פרטי קשר פרטיים של בעל המקצוע (טלפון, כתובת סטודיו)
-- מופרד לטבלה נפרדת כדי שאפשר יהיה להגן עליו ברמת RLS.
-- ---------------------------------------------------------------------
create table if not exists public.professional_contact_details (
  professional_id  uuid primary key references public.professional_profiles (id) on delete cascade,
  phone            text,
  phone_verified_at timestamptz,
  studio_address   text,
  studio_city_id   uuid references public.cities (id) on delete set null,
  studio_notes     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.professional_contact_details is
  'מספר טלפון וכתובת סטודיו. נחשף רק לבעל המקצוע, למנהל וללקוח עם הזמנה מאושרת.';

drop trigger if exists professional_contact_details_set_updated_at on public.professional_contact_details;
create trigger professional_contact_details_set_updated_at
  before update on public.professional_contact_details
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- שיוך מקצועות לבעל מקצוע (רב־לרב)
-- ---------------------------------------------------------------------
create table if not exists public.professional_professions (
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  profession_id   uuid not null references public.professions (id) on delete cascade,
  is_primary      boolean not null default false,
  created_at      timestamptz not null default now(),
  primary key (professional_id, profession_id)
);

create index if not exists professional_professions_profession_idx
  on public.professional_professions (profession_id);

-- ---------------------------------------------------------------------
-- שירותים ומחירים
-- ---------------------------------------------------------------------
create table if not exists public.professional_services (
  id                uuid primary key default gen_random_uuid(),
  professional_id   uuid not null references public.professional_profiles (id) on delete cascade,
  profession_id     uuid references public.professions (id) on delete set null,
  name              text not null,
  description       text,
  price_type        public.price_type not null default 'fixed',
  price_min         numeric(10,2),
  price_max         numeric(10,2),
  currency          text not null default 'ILS',
  duration_minutes  integer not null default 60 check (duration_minutes between 5 and 1440),
  buffer_minutes    integer not null default 15 check (buffer_minutes between 0 and 240),
  at_client_home    boolean not null default false,
  at_studio         boolean not null default false,
  at_event          boolean not null default false,
  supports_recurring boolean not null default true,
  image_url         text,
  is_active         boolean not null default true,
  sort_order        integer not null default 100,
  bookings_count    integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint services_price_valid check (
    (price_type = 'on_request' and price_min is null and price_max is null)
    or (price_type = 'fixed' and price_min is not null and price_min >= 0)
    or (price_type = 'range' and price_min is not null and price_max is not null and price_max >= price_min)
  ),
  constraint services_location_valid check (at_client_home or at_studio or at_event)
);

create index if not exists services_professional_idx
  on public.professional_services (professional_id, sort_order) where deleted_at is null;
create index if not exists services_profession_idx on public.professional_services (profession_id);
create index if not exists services_price_idx on public.professional_services (price_min) where is_active;
create index if not exists services_name_trgm_idx
  on public.professional_services using gin (public.normalize_text(name) gin_trgm_ops);

drop trigger if exists professional_services_set_updated_at on public.professional_services;
create trigger professional_services_set_updated_at
  before update on public.professional_services
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- אזורי שירות
-- ---------------------------------------------------------------------
create table if not exists public.service_areas (
  id              uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  city_id         uuid references public.cities (id) on delete cascade,
  area_name       text,
  radius_km       integer,
  travel_fee      numeric(10,2) not null default 0,
  created_at      timestamptz not null default now(),
  constraint service_area_target check (city_id is not null or area_name is not null)
);

create unique index if not exists service_areas_unique_city
  on public.service_areas (professional_id, city_id) where city_id is not null;
create index if not exists service_areas_city_idx on public.service_areas (city_id);

-- ---------------------------------------------------------------------
-- שעות פעילות שבועיות (כולל הפסקות)
-- ---------------------------------------------------------------------
create table if not exists public.professional_availability (
  id              uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  weekday         smallint not null check (weekday between 0 and 6), -- 0 = ראשון
  start_time      time not null,
  end_time        time not null,
  is_break        boolean not null default false,
  created_at      timestamptz not null default now(),
  constraint availability_time_order check (end_time > start_time)
);

create index if not exists availability_professional_idx
  on public.professional_availability (professional_id, weekday, start_time);

comment on table public.professional_availability is
  'ימי ושעות פעילות. שורות עם is_break=true מייצגות הפסקה בתוך יום העבודה.';

-- ---------------------------------------------------------------------
-- תאריכים חסומים / חופשות / זמינות מיוחדת
-- ---------------------------------------------------------------------
create table if not exists public.unavailable_dates (
  id              uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  start_at        timestamptz not null,
  end_at          timestamptz not null,
  reason          text,
  is_vacation     boolean not null default false,
  created_at      timestamptz not null default now(),
  constraint unavailable_range check (end_at > start_at)
);

create index if not exists unavailable_dates_professional_idx
  on public.unavailable_dates (professional_id, start_at, end_at);

-- ---------------------------------------------------------------------
-- אימות בעל מקצוע (טלפון / תעודה)
-- ---------------------------------------------------------------------
create table if not exists public.professional_verifications (
  id              uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  kind            public.verification_kind not null,
  document_url    text,
  title           text,
  status          public.request_status not null default 'pending',
  note            text,
  reviewed_by     uuid references public.profiles (id) on delete set null,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists verifications_professional_idx
  on public.professional_verifications (professional_id, status);
create index if not exists verifications_status_idx
  on public.professional_verifications (status, created_at desc);

drop trigger if exists professional_verifications_set_updated_at on public.professional_verifications;
create trigger professional_verifications_set_updated_at
  before update on public.professional_verifications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- אימות טלפון בתהליך (קוד חד־פעמי)
-- ---------------------------------------------------------------------
create table if not exists public.phone_verification_codes (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  phone           text not null,
  code_hash       text not null,
  attempts        integer not null default 0,
  expires_at      timestamptz not null,
  verified_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists phone_codes_profile_idx on public.phone_verification_codes (profile_id, created_at desc);


-- ==========================================================
-- 0004_social.sql
-- ==========================================================

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


-- ==========================================================
-- 0005_messaging.sql
-- ==========================================================

-- =====================================================================
-- 0005 – צ׳אט פרטי בזמן אמת
-- =====================================================================

set search_path = public, extensions;

create table if not exists public.conversations (
  id                   uuid primary key default gen_random_uuid(),
  created_by           uuid references public.profiles (id) on delete set null,
  booking_id           uuid, -- FK מתווסף ב־0006 אחרי יצירת bookings
  last_message_at      timestamptz not null default now(),
  last_message_preview text,
  last_sender_id       uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists conversations_last_message_idx on public.conversations (last_message_at desc);

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz not null default to_timestamp(0),
  is_muted        boolean not null default false,
  is_archived     boolean not null default false,
  left_at         timestamptz,
  primary key (conversation_id, profile_id)
);

create index if not exists conversation_members_profile_idx
  on public.conversation_members (profile_id, conversation_id);

-- מונע יצירת שתי שיחות בין אותם שני משתתפים.
create table if not exists public.direct_conversation_keys (
  pair_key        text primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade
);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid references public.profiles (id) on delete set null, -- null = הודעת מערכת
  kind            public.message_kind not null default 'text',
  body            text,
  attachment_url  text,
  attachment_type public.media_type,
  attachment_width integer,
  attachment_height integer,
  system_event    jsonb,
  booking_id      uuid,
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  deleted_at      timestamptz,
  read_at         timestamptz,
  constraint message_has_content check (
    body is not null or attachment_url is not null or system_event is not null
  ),
  constraint message_body_len check (body is null or char_length(body) <= 4000)
);

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at desc);
create index if not exists messages_sender_idx on public.messages (sender_id, created_at desc);
create index if not exists messages_body_trgm_idx
  on public.messages using gin (public.normalize_text(body) gin_trgm_ops);

comment on table public.messages is 'הודעות. רק משתתפי השיחה יכולים לקרוא (נאכף ב־RLS).';

-- בדיקת חברות בשיחה. security definer מונע רקורסיה במדיניות ה־RLS.
create or replace function public.is_conversation_member(p_conversation_id uuid, p_profile_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.profile_id = coalesce(p_profile_id, public.current_profile_id())
      and cm.left_at is null
  );
$$;

-- מפתח יציב לשיחה בין שני משתמשים (ללא תלות בסדר).
create or replace function public.direct_pair_key(a uuid, b uuid)
returns text
language sql
immutable
as $$
  select case when a < b then a::text || ':' || b::text else b::text || ':' || a::text end;
$$;

-- יצירה/איתור של שיחה פרטית בין שני משתמשים – אטומי.
create or replace function public.get_or_create_direct_conversation(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_me uuid := public.current_profile_id();
  v_key text;
  v_conversation_id uuid;
begin
  if v_me is null then
    raise exception 'לא מחובר';
  end if;
  if p_other = v_me then
    raise exception 'לא ניתן לפתוח שיחה עם עצמך';
  end if;
  if public.is_blocked_between(v_me, p_other) then
    raise exception 'לא ניתן לפתוח שיחה עם משתמש חסום';
  end if;

  v_key := public.direct_pair_key(v_me, p_other);

  select conversation_id into v_conversation_id
  from public.direct_conversation_keys where pair_key = v_key;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  insert into public.conversations (created_by) values (v_me) returning id into v_conversation_id;
  insert into public.conversation_members (conversation_id, profile_id)
  values (v_conversation_id, v_me), (v_conversation_id, p_other);

  insert into public.direct_conversation_keys (pair_key, conversation_id)
  values (v_key, v_conversation_id)
  on conflict (pair_key) do nothing;

  -- אם התרחשה תחרות – החזר את השיחה שנוצרה ראשונה.
  select conversation_id into v_conversation_id
  from public.direct_conversation_keys where pair_key = v_key;

  return v_conversation_id;
end;
$$;

-- עדכון תצוגת ההודעה האחרונה בשיחה.
create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      last_message_preview = case
        when new.kind = 'image' then '📷 תמונה'
        when new.kind = 'system' then coalesce(new.body, 'עדכון מערכת')
        else left(coalesce(new.body, ''), 120)
      end,
      last_sender_id = new.sender_id
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_on_message();


-- ==========================================================
-- 0006_bookings.sql
-- ==========================================================

-- =====================================================================
-- 0006 – כתובות, הזמנות, מפגשים קבועים ולוח זמנים
-- =====================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------
-- כתובות שירות – נחשפות רק לבעליהן ולבעל מקצוע עם הזמנה מאושרת
-- ---------------------------------------------------------------------
create table if not exists public.service_addresses (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  label         text not null default 'הבית שלי',
  city_id       uuid references public.cities (id) on delete set null,
  street        text not null,
  house_number  text,
  apartment     text,
  floor         text,
  entrance_code text,
  arrival_notes text,
  has_parking   boolean,
  latitude      double precision,
  longitude     double precision,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index if not exists service_addresses_profile_idx
  on public.service_addresses (profile_id) where deleted_at is null;
create unique index if not exists service_addresses_one_default
  on public.service_addresses (profile_id) where is_default and deleted_at is null;

comment on table public.service_addresses is
  'כתובות מלאות של לקוחות. לעולם לא מוצגות בפרופיל ציבורי – ראו מדיניות RLS.';

drop trigger if exists service_addresses_set_updated_at on public.service_addresses;
create trigger service_addresses_set_updated_at
  before update on public.service_addresses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- סדרות של מפגשים קבועים
-- ---------------------------------------------------------------------
create table if not exists public.recurring_booking_series (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references public.profiles (id) on delete cascade,
  professional_id       uuid not null references public.professional_profiles (id) on delete cascade,
  service_id            uuid not null references public.professional_services (id) on delete restrict,
  address_id            uuid references public.service_addresses (id) on delete set null,
  conversation_id       uuid references public.conversations (id) on delete set null,

  location_type         public.booking_location_type not null default 'client_home',
  frequency             public.recurrence_frequency not null default 'biweekly',
  interval_weeks        integer not null default 2 check (interval_weeks between 1 and 12),
  weekday               smallint not null check (weekday between 0 and 6),
  start_time            time not null,
  duration_minutes      integer not null check (duration_minutes between 5 and 1440),

  start_date            date not null,
  end_date              date,
  planned_occurrences   integer check (planned_occurrences is null or planned_occurrences between 1 and 104),

  price_amount          numeric(10,2),
  travel_fee            numeric(10,2) not null default 0,
  notes                 text,

  approval_mode         public.series_approval_mode not null default 'whole_series',
  status                public.series_status not null default 'pending',
  client_approved_at    timestamptz,
  professional_approved_at timestamptz,
  paused_at             timestamptz,
  cancelled_at          timestamptz,
  cancelled_by          uuid references public.profiles (id) on delete set null,
  completed_at          timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint series_dates check (end_date is null or end_date >= start_date)
);

create index if not exists series_client_idx on public.recurring_booking_series (client_id, status);
create index if not exists series_professional_idx on public.recurring_booking_series (professional_id, status);

comment on table public.recurring_booking_series is
  'סדרת מפגשים קבועה. הסדרה הופכת לפעילה רק לאחר אישור שני הצדדים.';

drop trigger if exists series_set_updated_at on public.recurring_booking_series;
create trigger series_set_updated_at
  before update on public.recurring_booking_series
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- הזמנות
-- ---------------------------------------------------------------------
create table if not exists public.bookings (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.profiles (id) on delete cascade,
  professional_id   uuid not null references public.professional_profiles (id) on delete cascade,
  service_id        uuid not null references public.professional_services (id) on delete restrict,
  address_id        uuid references public.service_addresses (id) on delete set null,
  conversation_id   uuid references public.conversations (id) on delete set null,
  series_id         uuid references public.recurring_booking_series (id) on delete set null,
  source_post_id    uuid references public.professional_posts (id) on delete set null,

  location_type     public.booking_location_type not null default 'client_home',
  status            public.booking_status not null default 'pending',

  scheduled_start   timestamptz not null,
  scheduled_end     timestamptz not null,
  duration_minutes  integer not null check (duration_minutes between 5 and 1440),
  buffer_minutes    integer not null default 0,
  -- סוף החלון התפוס ביומן = סיום הטיפול + זמן התארגנות/נסיעה.
  -- נשמר כעמודה אמיתית (ולא מחושבת) כי חשבון timestamptz + interval אינו IMMUTABLE
  -- ולכן אינו יכול להופיע בביטוי של אילוץ ההדרה.
  blocked_until     timestamptz not null default now(),

  price_type        public.price_type not null default 'fixed',
  price_amount      numeric(10,2),
  travel_fee        numeric(10,2) not null default 0,
  total_price       numeric(10,2) generated always as (coalesce(price_amount, 0) + coalesce(travel_fee, 0)) stored,
  currency          text not null default 'ILS',

  people_count      smallint not null default 1 check (people_count between 1 and 50),
  notes             text,
  inspiration_url   text,
  event_address     text,

  -- הצעת שינוי מצד בעל המקצוע
  proposed_start    timestamptz,
  proposed_price    numeric(10,2),
  proposed_by       uuid references public.profiles (id) on delete set null,
  proposed_note     text,

  -- בטיחות קטינים
  guardian_approved boolean not null default false,
  guardian_contact  text,
  shared_with_contact text,

  address_revealed  boolean not null default false,

  confirmed_at      timestamptz,
  on_the_way_at     timestamptz,
  arrived_at        timestamptz,
  started_at        timestamptz,
  completed_at      timestamptz,
  cancelled_at      timestamptz,
  cancelled_by      uuid references public.profiles (id) on delete set null,
  cancel_reason     text,

  reminder_24h_sent_at timestamptz,
  reminder_2h_sent_at  timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint bookings_time_order check (scheduled_end > scheduled_start),
  constraint bookings_home_needs_address check (
    location_type <> 'client_home' or address_id is not null or status = 'draft'
  )
);

create index if not exists bookings_client_idx on public.bookings (client_id, scheduled_start desc);
create index if not exists bookings_professional_idx on public.bookings (professional_id, scheduled_start desc);
create index if not exists bookings_status_idx on public.bookings (status, scheduled_start);
create index if not exists bookings_series_idx on public.bookings (series_id);
create index if not exists bookings_upcoming_idx
  on public.bookings (professional_id, scheduled_start)
  where status in ('pending', 'confirmed', 'change_proposed', 'on_the_way', 'arrived', 'in_progress');
create index if not exists bookings_source_post_idx on public.bookings (source_post_id) where source_post_id is not null;

-- תחזוקת blocked_until לפני כל כתיבה.
create or replace function public.set_booking_blocked_until()
returns trigger
language plpgsql
as $$
begin
  new.blocked_until := new.scheduled_end + make_interval(mins => coalesce(new.buffer_minutes, 0));
  return new;
end;
$$;

drop trigger if exists bookings_set_blocked_until on public.bookings;
create trigger bookings_set_blocked_until
  before insert or update of scheduled_end, buffer_minutes on public.bookings
  for each row execute function public.set_booking_blocked_until();

-- מניעת הזמנות חופפות אצל אותו בעל מקצוע (כולל זמן התארגנות/נסיעה).
alter table public.bookings drop constraint if exists bookings_no_overlap;
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    professional_id with =,
    tstzrange(scheduled_start, blocked_until) with &&
  )
  where (status in ('confirmed', 'on_the_way', 'arrived', 'in_progress'));

comment on constraint bookings_no_overlap on public.bookings is
  'מונע שתי הזמנות מאושרות חופפות לאותו בעל מקצוע, כולל זמן התארגנות.';

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- קישור השיחה להזמנה (הושאר פתוח ב־0005)
do $$ begin
  alter table public.conversations
    add constraint conversations_booking_fk
    foreign key (booking_id) references public.bookings (id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.messages
    add constraint messages_booking_fk
    foreign key (booking_id) references public.bookings (id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- היסטוריית סטטוסים
-- ---------------------------------------------------------------------
create table if not exists public.booking_status_history (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  from_status public.booking_status,
  to_status   public.booking_status not null,
  changed_by  uuid references public.profiles (id) on delete set null,
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists booking_history_booking_idx
  on public.booking_status_history (booking_id, created_at);

-- ---------------------------------------------------------------------
-- מופעי הסדרה הקבועה
-- ---------------------------------------------------------------------
create table if not exists public.recurring_booking_occurrences (
  id              uuid primary key default gen_random_uuid(),
  series_id       uuid not null references public.recurring_booking_series (id) on delete cascade,
  booking_id      uuid references public.bookings (id) on delete set null,
  sequence        integer not null,
  scheduled_date  date not null,
  scheduled_start timestamptz not null,
  status          public.occurrence_status not null default 'planned',
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (series_id, sequence)
);

create index if not exists occurrences_series_idx
  on public.recurring_booking_occurrences (series_id, scheduled_start);
create unique index if not exists occurrences_booking_key
  on public.recurring_booking_occurrences (booking_id) where booking_id is not null;

comment on table public.recurring_booking_occurrences is
  'כל מפגש בסדרה. שינוי מפגש בודד אינו משנה את הסדרה אלא אם נבחר במפורש.';

drop trigger if exists occurrences_set_updated_at on public.recurring_booking_occurrences;
create trigger occurrences_set_updated_at
  before update on public.recurring_booking_occurrences
  for each row execute function public.set_updated_at();

-- כל הזמנה שמשויכת לסדרה חייבת מופע מקביל (נאכף בטריגר ב־0008).

-- ---------------------------------------------------------------------
-- לקוחות קבועים – הערות פרטיות של בעל המקצוע
-- ---------------------------------------------------------------------
create table if not exists public.customer_notes (
  id              uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  client_id       uuid not null references public.profiles (id) on delete cascade,
  note            text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists customer_notes_pair_idx
  on public.customer_notes (professional_id, client_id, created_at desc);

comment on table public.customer_notes is 'הערות פרטיות של בעל המקצוע על לקוח. הלקוח אינו רואה אותן.';

drop trigger if exists customer_notes_set_updated_at on public.customer_notes;
create trigger customer_notes_set_updated_at
  before update on public.customer_notes
  for each row execute function public.set_updated_at();


-- ==========================================================
-- 0007_reviews_notifications_safety.sql
-- ==========================================================

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


-- ==========================================================
-- 0008_triggers_and_logic.sql
-- ==========================================================

-- =====================================================================
-- 0008 – טריגרים, מונים, התראות ולוגיקה עסקית
-- =====================================================================
-- כל הפונקציות כאן הן security definer עם search_path קבוע, כדי שיוכלו
-- לתחזק מונים והתראות מבלי להיחסם על ידי מדיניות ה־RLS של המשתמש.
-- =====================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------
-- עזר: יצירת התראה (מכבדת את העדפות ההתראות של המשתמש)
-- ---------------------------------------------------------------------
create or replace function public.create_notification(
  p_profile_id uuid,
  p_type public.notification_type,
  p_title text,
  p_body text default null,
  p_actor_id uuid default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_link text default null,
  p_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_prefs jsonb;
  v_key text;
begin
  if p_profile_id is null or p_profile_id = coalesce(p_actor_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    return null; -- לא שולחים התראה על פעולה עצמית
  end if;

  select notification_prefs into v_prefs from public.profiles where id = p_profile_id;
  if v_prefs is null then
    return null;
  end if;

  v_key := case
    when p_type in ('new_message') then 'new_message'
    when p_type in ('new_follower') then 'new_follower'
    when p_type in ('post_like') then 'post_like'
    when p_type in ('post_comment') then 'post_comment'
    when p_type in ('new_review', 'review_reply') then 'reviews'
    when p_type in ('booking_reminder') then 'reminders'
    when p_type::text like 'booking%' or p_type::text like 'series%' then 'bookings'
    else 'in_app'
  end;

  if coalesce((v_prefs ->> v_key)::boolean, true) = false then
    return null;
  end if;

  insert into public.notifications
    (profile_id, type, title, body, actor_id, entity_type, entity_id, link, data)
  values
    (p_profile_id, p_type, p_title, p_body, p_actor_id, p_entity_type, p_entity_id, p_link, p_data)
  returning id into v_id;

  return v_id;
end;
$$;

-- שם תצוגה קצר למשתמש (לשימוש בטקסטים של התראות)
create or replace function public.display_name(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(pp.business_name, p.full_name, '')
  from public.profiles p
  left join public.professional_profiles pp on pp.profile_id = p.id and pp.status = 'active'
  where p.id = p_profile_id;
$$;

-- ---------------------------------------------------------------------
-- מונים: מעקב
-- ---------------------------------------------------------------------
create or replace function public.handle_follow_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set followers_count = followers_count + 1 where id = new.following_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    update public.professional_profiles set followers_count = followers_count + 1
      where profile_id = new.following_id;

    perform public.create_notification(
      new.following_id, 'new_follower',
      public.display_name(new.follower_id) || ' התחיל לעקוב אחריך',
      null, new.follower_id, 'profile', new.follower_id,
      '/u/' || (select username from public.profiles where id = new.follower_id)
    );
    return new;
  else
    update public.profiles set followers_count = greatest(followers_count - 1, 0) where id = old.following_id;
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
    update public.professional_profiles set followers_count = greatest(followers_count - 1, 0)
      where profile_id = old.following_id;
    return old;
  end if;
end;
$$;

drop trigger if exists follows_counters on public.follows;
create trigger follows_counters
  after insert or delete on public.follows
  for each row execute function public.handle_follow_change();

-- ---------------------------------------------------------------------
-- מונים: לייקים
-- ---------------------------------------------------------------------
create or replace function public.handle_like_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner uuid;
  v_title text;
begin
  if tg_op = 'INSERT' then
    update public.professional_posts set likes_count = likes_count + 1 where id = new.post_id
      returning author_profile_id, title into v_owner, v_title;

    perform public.create_notification(
      v_owner, 'post_like',
      public.display_name(new.profile_id) || ' אהב את הפוסט שלך',
      v_title, new.profile_id, 'post', new.post_id, '/p/' || new.post_id
    );
    return new;
  else
    update public.professional_posts set likes_count = greatest(likes_count - 1, 0) where id = old.post_id;
    return old;
  end if;
end;
$$;

drop trigger if exists post_likes_counters on public.post_likes;
create trigger post_likes_counters
  after insert or delete on public.post_likes
  for each row execute function public.handle_like_change();

-- ---------------------------------------------------------------------
-- מונים: תגובות
-- ---------------------------------------------------------------------
create or replace function public.handle_comment_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner uuid;
begin
  if tg_op = 'INSERT' then
    update public.professional_posts set comments_count = comments_count + 1 where id = new.post_id
      returning author_profile_id into v_owner;

    perform public.create_notification(
      v_owner, 'post_comment',
      public.display_name(new.profile_id) || ' הגיב על הפוסט שלך',
      left(new.body, 120), new.profile_id, 'post', new.post_id, '/p/' || new.post_id
    );
    return new;
  elsif tg_op = 'DELETE' then
    update public.professional_posts set comments_count = greatest(comments_count - 1, 0) where id = old.post_id;
    return old;
  elsif tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      update public.professional_posts set comments_count = greatest(comments_count - 1, 0) where id = new.post_id;
    elsif old.deleted_at is not null and new.deleted_at is null then
      update public.professional_posts set comments_count = comments_count + 1 where id = new.post_id;
    end if;
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists post_comments_counters on public.post_comments;
create trigger post_comments_counters
  after insert or delete or update of deleted_at on public.post_comments
  for each row execute function public.handle_comment_change();

-- ---------------------------------------------------------------------
-- מונים: שמירות
-- ---------------------------------------------------------------------
create or replace function public.handle_saved_post_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if tg_op = 'INSERT' then
    update public.professional_posts set saves_count = saves_count + 1 where id = new.post_id;
    return new;
  else
    update public.professional_posts set saves_count = greatest(saves_count - 1, 0) where id = old.post_id;
    return old;
  end if;
end;
$$;

drop trigger if exists saved_posts_counters on public.saved_posts;
create trigger saved_posts_counters
  after insert or delete on public.saved_posts
  for each row execute function public.handle_saved_post_change();

-- ---------------------------------------------------------------------
-- פוסטים: מונה פוסטים + התראה לעוקבים על פוסט חדש
-- ---------------------------------------------------------------------
create or replace function public.handle_post_publish()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_is_public boolean := (new.status = 'published' and new.deleted_at is null);
  v_was_public boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_was_public := (old.status = 'published' and old.deleted_at is null);
  end if;

  if v_is_public and not v_was_public then
    update public.professional_profiles set posts_count = posts_count + 1 where id = new.professional_id;

    insert into public.notifications (profile_id, type, title, body, actor_id, entity_type, entity_id, link)
    select f.follower_id,
           'new_post',
           public.display_name(new.author_profile_id) || ' פרסם עבודה חדשה',
           new.title,
           new.author_profile_id,
           'post',
           new.id,
           '/p/' || new.id
    from public.follows f
    join public.profiles p on p.id = f.follower_id
    where f.following_id = new.author_profile_id
      and coalesce((p.notification_prefs ->> 'in_app')::boolean, true);

  elsif v_was_public and not v_is_public then
    update public.professional_profiles set posts_count = greatest(posts_count - 1, 0) where id = new.professional_id;
  end if;

  return new;
end;
$$;

drop trigger if exists posts_publish_effects on public.professional_posts;
create trigger posts_publish_effects
  after insert or update of status, deleted_at on public.professional_posts
  for each row execute function public.handle_post_publish();

-- קובע published_at ברגע הפרסום (לפני הכתיבה, ללא עדכון נוסף).
create or replace function public.stamp_post_published_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' and new.deleted_at is null and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists posts_stamp_published on public.professional_posts;
create trigger posts_stamp_published
  before insert or update of status, deleted_at on public.professional_posts
  for each row execute function public.stamp_post_published_at();

-- ---------------------------------------------------------------------
-- ביקורות: דירוג ממוצע + התראה
-- ---------------------------------------------------------------------
create or replace function public.refresh_professional_rating(p_professional_id uuid)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update public.professional_profiles pp
  set rating_avg = coalesce(agg.avg_rating, 0),
      rating_count = coalesce(agg.cnt, 0)
  from (
    select round(avg(rating)::numeric, 2) as avg_rating, count(*) as cnt
    from public.reviews
    where professional_id = p_professional_id and deleted_at is null and not is_hidden
  ) agg
  where pp.id = p_professional_id;
$$;

create or replace function public.handle_review_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner uuid;
begin
  if tg_op = 'DELETE' then
    perform public.refresh_professional_rating(old.professional_id);
    return old;
  end if;

  perform public.refresh_professional_rating(new.professional_id);

  if tg_op = 'INSERT' then
    select profile_id into v_owner from public.professional_profiles where id = new.professional_id;
    perform public.create_notification(
      v_owner, 'new_review',
      'קיבלת ביקורת חדשה (' || new.rating || ' כוכבים)',
      left(coalesce(new.body, ''), 120), new.client_id, 'review', new.id,
      '/dashboard/pro/reviews'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists reviews_rating_sync on public.reviews;
create trigger reviews_rating_sync
  after insert or update or delete on public.reviews
  for each row execute function public.handle_review_change();

create or replace function public.handle_review_reply()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_client uuid;
  v_pro_profile uuid;
begin
  select client_id into v_client from public.reviews where id = new.review_id;
  select profile_id into v_pro_profile from public.professional_profiles where id = new.professional_id;

  perform public.create_notification(
    v_client, 'review_reply',
    public.display_name(v_pro_profile) || ' הגיב לביקורת שלך',
    left(new.body, 120), v_pro_profile, 'review', new.review_id, '/dashboard/reviews'
  );
  return new;
end;
$$;

drop trigger if exists review_replies_notify on public.review_replies;
create trigger review_replies_notify
  after insert on public.review_replies
  for each row execute function public.handle_review_reply();

-- ---------------------------------------------------------------------
-- מקצועות: מונה בעלי מקצוע
-- ---------------------------------------------------------------------
create or replace function public.handle_professional_profession_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if tg_op = 'INSERT' then
    update public.professions set professionals_count = professionals_count + 1 where id = new.profession_id;
    return new;
  else
    update public.professions set professionals_count = greatest(professionals_count - 1, 0)
      where id = old.profession_id;
    return old;
  end if;
end;
$$;

drop trigger if exists professional_professions_counter on public.professional_professions;
create trigger professional_professions_counter
  after insert or delete on public.professional_professions
  for each row execute function public.handle_professional_profession_change();

-- ---------------------------------------------------------------------
-- סנכרון דגל is_professional בפרופיל
-- ---------------------------------------------------------------------
create or replace function public.sync_is_professional()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if tg_op = 'DELETE' then
    update public.profiles
    set is_professional = false,
        active_mode = 'user'
    where id = old.profile_id;
    return old;
  end if;

  update public.profiles
  set is_professional = (new.deleted_at is null),
      active_mode = case when new.deleted_at is not null then 'user' else active_mode end
  where id = new.profile_id;
  return new;
end;
$$;

drop trigger if exists professional_profiles_sync_flag on public.professional_profiles;
create trigger professional_profiles_sync_flag
  after insert or update of deleted_at or delete on public.professional_profiles
  for each row execute function public.sync_is_professional();

-- ---------------------------------------------------------------------
-- כשירות הפרופיל המקצועי לפרסום
-- ---------------------------------------------------------------------
create or replace function public.professional_readiness(p_professional_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_pp public.professional_profiles%rowtype;
  v_professions int;
  v_services int;
  v_areas int;
  v_media int;
  v_missing text[] := '{}';
  v_total int := 6;
  v_done int := 0;
begin
  select * into v_pp from public.professional_profiles where id = p_professional_id;
  if not found then
    return jsonb_build_object('ready', false, 'missing', to_jsonb(array['profile']), 'completion', 0);
  end if;

  select count(*) into v_professions from public.professional_professions where professional_id = p_professional_id;
  select count(*) into v_services from public.professional_services
    where professional_id = p_professional_id and is_active and deleted_at is null;
  select count(*) into v_areas from public.service_areas where professional_id = p_professional_id;
  select count(*) into v_media
    from public.post_media pm
    join public.professional_posts pt on pt.id = pm.post_id
    where pt.professional_id = p_professional_id and pt.deleted_at is null and pm.media_type = 'image';

  if coalesce(v_pp.avatar_url, '') = '' then
    v_missing := v_missing || 'avatar'::text;
  else v_done := v_done + 1; end if;

  if v_professions = 0 then v_missing := v_missing || 'profession'::text;
  else v_done := v_done + 1; end if;

  if v_services = 0 then v_missing := v_missing || 'service'::text;
  else v_done := v_done + 1; end if;

  if v_pp.city_id is null then v_missing := v_missing || 'city'::text;
  else v_done := v_done + 1; end if;

  if v_areas = 0 and v_pp.accepts_home_visits then v_missing := v_missing || 'service_area'::text;
  else v_done := v_done + 1; end if;

  if v_media < 3 then v_missing := v_missing || 'portfolio'::text;
  else v_done := v_done + 1; end if;

  return jsonb_build_object(
    'ready', array_length(v_missing, 1) is null,
    'missing', to_jsonb(v_missing),
    'completion', round((v_done::numeric / v_total) * 100),
    'counts', jsonb_build_object(
      'professions', v_professions,
      'services', v_services,
      'areas', v_areas,
      'portfolio_images', v_media
    )
  );
end;
$$;

comment on function public.professional_readiness is
  'בודק אילו שדות חובה חסרים לפני פרסום פרופיל מקצועי ומחזיר אחוז השלמה.';

-- חוסם מעבר לסטטוס active לפני השלמת שדות החובה.
create or replace function public.guard_professional_publish()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ready jsonb;
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    v_ready := public.professional_readiness(new.id);
    if not (v_ready ->> 'ready')::boolean then
      raise exception 'לא ניתן לפרסם פרופיל מקצועי לפני השלמת כל שדות החובה: %', v_ready ->> 'missing'
        using errcode = 'check_violation';
    end if;
    if new.published_at is null then
      new.published_at := now();
    end if;
    new.paused_at := null;
  end if;

  if tg_op = 'UPDATE' and new.status = 'paused' and old.status is distinct from 'paused' then
    new.paused_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists professional_publish_guard on public.professional_profiles;
create trigger professional_publish_guard
  before insert or update of status on public.professional_profiles
  for each row execute function public.guard_professional_publish();

-- ---------------------------------------------------------------------
-- הזמנות: היסטוריית סטטוס + התראות + הודעות מערכת + מונים
-- ---------------------------------------------------------------------
create or replace function public.post_system_message(
  p_conversation_id uuid,
  p_booking_id uuid,
  p_body text,
  p_event jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_conversation_id is null then
    return;
  end if;
  insert into public.messages (conversation_id, sender_id, kind, body, system_event, booking_id)
  values (p_conversation_id, null, 'system', p_body, p_event, p_booking_id);
end;
$$;

create or replace function public.handle_booking_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pro_profile uuid;
  v_client_name text;
  v_pro_name text;
  v_link_client text;
  v_link_pro text;
begin
  select profile_id into v_pro_profile from public.professional_profiles where id = new.professional_id;
  v_client_name := public.display_name(new.client_id);
  v_pro_name := public.display_name(v_pro_profile);
  v_link_client := '/dashboard/bookings/' || new.id;
  v_link_pro := '/dashboard/pro/bookings/' || new.id;

  if tg_op = 'INSERT' then
    insert into public.booking_status_history (booking_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, new.client_id);

    if new.status = 'pending' then
      perform public.create_notification(
        v_pro_profile, 'booking_created',
        'הזמנה חדשה מ' || v_client_name,
        to_char(new.scheduled_start at time zone 'Asia/Jerusalem', 'DD/MM/YYYY HH24:MI'),
        new.client_id, 'booking', new.id, v_link_pro
      );
      perform public.post_system_message(
        new.conversation_id, new.id,
        'נשלחה בקשת הזמנה חדשה',
        jsonb_build_object('event', 'booking_created', 'booking_id', new.id)
      );
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.booking_status_history (booking_id, from_status, to_status, changed_by, note)
    values (new.id, old.status, new.status, public.current_profile_id(), new.cancel_reason);

    case new.status
      when 'confirmed' then
        perform public.create_notification(
          new.client_id, 'booking_confirmed', v_pro_name || ' אישר את ההזמנה שלך',
          to_char(new.scheduled_start at time zone 'Asia/Jerusalem', 'DD/MM/YYYY HH24:MI'),
          v_pro_profile, 'booking', new.id, v_link_client
        );
        perform public.post_system_message(new.conversation_id, new.id, 'ההזמנה אושרה ✅',
          jsonb_build_object('event', 'booking_confirmed'));

      when 'change_proposed' then
        perform public.create_notification(
          new.client_id, 'booking_change_proposed', v_pro_name || ' הציע שינוי להזמנה',
          coalesce(new.proposed_note, ''), v_pro_profile, 'booking', new.id, v_link_client
        );
        perform public.post_system_message(new.conversation_id, new.id, 'הוצע מועד או מחיר אחר',
          jsonb_build_object('event', 'change_proposed',
                             'proposed_start', new.proposed_start,
                             'proposed_price', new.proposed_price));

      when 'cancelled' then
        perform public.create_notification(
          case when new.cancelled_by = new.client_id then v_pro_profile else new.client_id end,
          'booking_cancelled', 'ההזמנה בוטלה',
          coalesce(new.cancel_reason, ''), new.cancelled_by, 'booking', new.id,
          case when new.cancelled_by = new.client_id then v_link_pro else v_link_client end
        );
        perform public.post_system_message(new.conversation_id, new.id, 'ההזמנה בוטלה ❌',
          jsonb_build_object('event', 'booking_cancelled'));

      when 'on_the_way' then
        perform public.create_notification(
          new.client_id, 'booking_on_the_way', v_pro_name || ' בדרך אליך 🚗',
          null, v_pro_profile, 'booking', new.id, v_link_client
        );
        perform public.post_system_message(new.conversation_id, new.id, 'בעל המקצוע בדרך 🚗',
          jsonb_build_object('event', 'on_the_way'));

      when 'arrived' then
        perform public.create_notification(
          new.client_id, 'booking_on_the_way', v_pro_name || ' הגיע',
          null, v_pro_profile, 'booking', new.id, v_link_client
        );

      when 'completed' then
        update public.professional_profiles
        set completed_bookings_count = completed_bookings_count + 1
        where id = new.professional_id;

        update public.professional_services
        set bookings_count = bookings_count + 1
        where id = new.service_id;

        update public.professional_profiles pp
        set clients_count = (
          select count(distinct b.client_id) from public.bookings b
          where b.professional_id = new.professional_id and b.status = 'completed'
        )
        where pp.id = new.professional_id;

        if new.source_post_id is not null then
          update public.professional_posts set bookings_count = bookings_count + 1
          where id = new.source_post_id;
        end if;

        perform public.create_notification(
          new.client_id, 'booking_completed', 'הטיפול הושלם – נשמח לביקורת',
          null, v_pro_profile, 'booking', new.id, v_link_client || '?review=1'
        );
        perform public.post_system_message(new.conversation_id, new.id, 'הטיפול הושלם ✨',
          jsonb_build_object('event', 'booking_completed'));

      else
        null;
    end case;
  end if;

  if new.price_amount is distinct from old.price_amount and new.status <> 'draft' then
    perform public.create_notification(
      new.client_id, 'booking_price_changed', 'המחיר בהזמנה עודכן',
      'מחיר חדש: ' || coalesce(new.price_amount::text, '—') || ' ₪',
      v_pro_profile, 'booking', new.id, v_link_client
    );
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_effects on public.bookings;
create trigger bookings_effects
  after insert or update on public.bookings
  for each row execute function public.handle_booking_change();

-- מסנכרן את סטטוס המופע בסדרה כאשר ההזמנה משתנה.
create or replace function public.sync_occurrence_from_booking()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.series_id is null then
    return new;
  end if;

  update public.recurring_booking_occurrences
  set status = case
        when new.status = 'completed' then 'completed'::public.occurrence_status
        when new.status = 'cancelled' then 'cancelled'::public.occurrence_status
        else 'booked'::public.occurrence_status
      end,
      scheduled_start = new.scheduled_start,
      scheduled_date = (new.scheduled_start at time zone 'Asia/Jerusalem')::date
  where booking_id = new.id;

  return new;
end;
$$;

drop trigger if exists bookings_sync_occurrence on public.bookings;
create trigger bookings_sync_occurrence
  after update of status, scheduled_start on public.bookings
  for each row execute function public.sync_occurrence_from_booking();

-- כל הזמנה המשויכת לסדרה חייבת להיות מקושרת למופע.
create or replace function public.guard_series_booking_link()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.series_id is not null and tg_op = 'UPDATE' and old.series_id is null then
    if not exists (
      select 1 from public.recurring_booking_occurrences
      where series_id = new.series_id and booking_id = new.id
    ) then
      raise exception 'הזמנה המשויכת לסדרה חייבת להיות מקושרת למופע בסדרה'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_series_link_guard on public.bookings;
create constraint trigger bookings_series_link_guard
  after update on public.bookings
  deferrable initially deferred
  for each row execute function public.guard_series_booking_link();

-- ---------------------------------------------------------------------
-- הודעות: התראה על הודעה חדשה
-- ---------------------------------------------------------------------
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.sender_id is null then
    return new; -- הודעת מערכת
  end if;

  insert into public.notifications (profile_id, type, title, body, actor_id, entity_type, entity_id, link)
  select cm.profile_id,
         'new_message',
         'הודעה חדשה מ' || public.display_name(new.sender_id),
         case when new.kind = 'image' then '📷 תמונה' else left(coalesce(new.body, ''), 120) end,
         new.sender_id,
         'conversation',
         new.conversation_id,
         '/messages/' || new.conversation_id
  from public.conversation_members cm
  join public.profiles p on p.id = cm.profile_id
  where cm.conversation_id = new.conversation_id
    and cm.profile_id <> new.sender_id
    and cm.left_at is null
    and not cm.is_muted
    and coalesce((p.notification_prefs ->> 'new_message')::boolean, true);

  return new;
end;
$$;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify
  after insert on public.messages
  for each row execute function public.notify_new_message();

-- ---------------------------------------------------------------------
-- סדרות קבועות: יצירת מופעים + אישור
-- ---------------------------------------------------------------------
create or replace function public.series_interval_weeks(p_freq public.recurrence_frequency, p_custom integer)
returns integer
language sql
immutable
as $$
  select case p_freq
    when 'weekly' then 1
    when 'biweekly' then 2
    when 'every_3_weeks' then 3
    when 'every_4_weeks' then 4
    when 'monthly' then 4
    else greatest(coalesce(p_custom, 2), 1)
  end;
$$;

-- מייצר את רשימת המועדים הצפויים לסדרה (ללא שמירה) – לתצוגה מקדימה.
create or replace function public.preview_series_dates(
  p_start_date date,
  p_weekday smallint,
  p_start_time time,
  p_frequency public.recurrence_frequency,
  p_interval_weeks integer,
  p_end_date date default null,
  p_count integer default null
)
returns table (sequence integer, scheduled_date date, scheduled_start timestamptz)
language plpgsql
immutable
as $$
declare
  v_interval int := public.series_interval_weeks(p_frequency, p_interval_weeks);
  v_first date;
  v_max int := least(coalesce(p_count, 26), 104);
  v_i int := 0;
  v_date date;
begin
  -- המועד הראשון: היום בשבוע המבוקש, בתאריך ההתחלה או אחריו.
  v_first := p_start_date + ((p_weekday - extract(dow from p_start_date)::int + 7) % 7);

  loop
    exit when v_i >= v_max;
    if p_frequency = 'monthly' then
      v_date := (v_first + (v_i || ' month')::interval)::date;
    else
      v_date := v_first + (v_i * v_interval * 7);
    end if;

    exit when p_end_date is not null and v_date > p_end_date;
    exit when p_end_date is null and p_count is null and v_i >= 12;

    sequence := v_i + 1;
    scheduled_date := v_date;
    scheduled_start := (v_date + p_start_time) at time zone 'Asia/Jerusalem';
    return next;

    v_i := v_i + 1;
  end loop;
end;
$$;

-- יוצר את מופעי הסדרה במסד הנתונים.
create or replace function public.generate_series_occurrences(p_series_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_series public.recurring_booking_series%rowtype;
  v_count integer := 0;
begin
  select * into v_series from public.recurring_booking_series where id = p_series_id;
  if not found then
    raise exception 'סדרה לא נמצאה';
  end if;

  insert into public.recurring_booking_occurrences (series_id, sequence, scheduled_date, scheduled_start)
  select p_series_id, d.sequence, d.scheduled_date, d.scheduled_start
  from public.preview_series_dates(
         v_series.start_date, v_series.weekday, v_series.start_time,
         v_series.frequency, v_series.interval_weeks, v_series.end_date, v_series.planned_occurrences
       ) d
  on conflict (series_id, sequence) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- הופך מופעים מתוכננים להזמנות אמיתיות (לאחר אישור שני הצדדים).
create or replace function public.materialize_series_bookings(p_series_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_series public.recurring_booking_series%rowtype;
  v_occ record;
  v_booking_id uuid;
  v_created integer := 0;
  v_buffer integer;
begin
  select * into v_series from public.recurring_booking_series where id = p_series_id;
  if not found then
    raise exception 'סדרה לא נמצאה';
  end if;

  if v_series.client_approved_at is null or v_series.professional_approved_at is null then
    raise exception 'לא ניתן ליצור מפגשים לפני אישור שני הצדדים' using errcode = 'check_violation';
  end if;

  select coalesce(buffer_minutes, 0) into v_buffer
  from public.professional_services where id = v_series.service_id;

  for v_occ in
    select * from public.recurring_booking_occurrences
    where series_id = p_series_id and status = 'planned' and booking_id is null
      and scheduled_start > now()
    order by sequence
  loop
    begin
      insert into public.bookings (
        client_id, professional_id, service_id, address_id, conversation_id, series_id,
        location_type, status, scheduled_start, scheduled_end, duration_minutes, buffer_minutes,
        price_type, price_amount, travel_fee, notes
      ) values (
        v_series.client_id, v_series.professional_id, v_series.service_id, v_series.address_id,
        v_series.conversation_id, p_series_id, v_series.location_type, 'confirmed',
        v_occ.scheduled_start,
        v_occ.scheduled_start + make_interval(mins => v_series.duration_minutes),
        v_series.duration_minutes, coalesce(v_buffer, 0),
        'fixed', v_series.price_amount, v_series.travel_fee, v_series.notes
      ) returning id into v_booking_id;

      update public.recurring_booking_occurrences
      set booking_id = v_booking_id, status = 'booked'
      where id = v_occ.id;

      v_created := v_created + 1;
    exception when exclusion_violation then
      -- מועד תפוס: מסמנים את המופע כמדולג במקום להפיל את כל הסדרה.
      update public.recurring_booking_occurrences
      set status = 'skipped', note = 'המועד היה תפוס ביומן בעל המקצוע'
      where id = v_occ.id;
    end;
  end loop;

  update public.recurring_booking_series set status = 'active' where id = p_series_id and status = 'pending';

  return v_created;
end;
$$;

comment on function public.materialize_series_bookings is
  'יוצר הזמנות עצמאיות לכל מפגש בסדרה. כל הזמנה נשארת מקושרת לסדרה המקורית.';

-- ---------------------------------------------------------------------
-- זמינות ובדיקת חפיפות
-- ---------------------------------------------------------------------
create or replace function public.check_booking_slot(
  p_professional_id uuid,
  p_start timestamptz,
  p_duration_minutes integer,
  p_buffer_minutes integer default 0,
  p_exclude_booking_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_end timestamptz := p_start + make_interval(mins => p_duration_minutes);
  v_local timestamp := p_start at time zone 'Asia/Jerusalem';
  v_end_local timestamp := v_end at time zone 'Asia/Jerusalem';
  v_dow smallint := extract(dow from v_local)::smallint;
  v_pp public.professional_profiles%rowtype;
begin
  select * into v_pp from public.professional_profiles where id = p_professional_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'professional_not_found');
  end if;
  if v_pp.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'professional_inactive');
  end if;

  if p_start < now() + make_interval(mins => v_pp.min_lead_time_minutes) then
    return jsonb_build_object('ok', false, 'reason', 'too_soon');
  end if;

  if p_start > now() + make_interval(days => v_pp.max_lead_time_days) then
    return jsonb_build_object('ok', false, 'reason', 'too_far');
  end if;

  -- חייב להיכנס כולו בתוך חלון פעילות אחד
  if not exists (
    select 1 from public.professional_availability a
    where a.professional_id = p_professional_id
      and a.weekday = v_dow
      and not a.is_break
      and v_local::time >= a.start_time
      and v_end_local::time <= a.end_time
  ) then
    return jsonb_build_object('ok', false, 'reason', 'outside_working_hours');
  end if;

  -- אסור לחפוף הפסקה
  if exists (
    select 1 from public.professional_availability a
    where a.professional_id = p_professional_id
      and a.weekday = v_dow
      and a.is_break
      and v_local::time < a.end_time
      and v_end_local::time > a.start_time
  ) then
    return jsonb_build_object('ok', false, 'reason', 'break_time');
  end if;

  -- תאריכים חסומים / חופשות
  if exists (
    select 1 from public.unavailable_dates u
    where u.professional_id = p_professional_id
      and tstzrange(u.start_at, u.end_at) && tstzrange(p_start, v_end)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'blocked_date');
  end if;

  -- הזמנות חופפות (כולל זמן התארגנות)
  if exists (
    select 1 from public.bookings b
    where b.professional_id = p_professional_id
      and b.status in ('confirmed', 'on_the_way', 'arrived', 'in_progress')
      and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
      and tstzrange(b.scheduled_start, b.scheduled_end + make_interval(mins => b.buffer_minutes))
          && tstzrange(p_start, v_end + make_interval(mins => p_buffer_minutes))
  ) then
    return jsonb_build_object('ok', false, 'reason', 'slot_taken');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.check_booking_slot is
  'בודק שהמועד פנוי: שעות פעילות, הפסקות, חופשות, חפיפות וזמני התארגנות.';

-- מחזיר את כל המשבצות הפנויות ליום נתון.
create or replace function public.available_slots(
  p_professional_id uuid,
  p_date date,
  p_duration_minutes integer,
  p_buffer_minutes integer default 0,
  p_step_minutes integer default 30
)
returns table (slot timestamptz)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_dow smallint := extract(dow from p_date)::smallint;
  v_win record;
  v_cursor timestamptz;
  v_win_end timestamptz;
begin
  for v_win in
    select a.start_time, a.end_time
    from public.professional_availability a
    where a.professional_id = p_professional_id and a.weekday = v_dow and not a.is_break
    order by a.start_time
  loop
    v_cursor := (p_date + v_win.start_time) at time zone 'Asia/Jerusalem';
    v_win_end := (p_date + v_win.end_time) at time zone 'Asia/Jerusalem';

    while v_cursor + make_interval(mins => p_duration_minutes) <= v_win_end loop
      if (public.check_booking_slot(
            p_professional_id, v_cursor, p_duration_minutes, p_buffer_minutes
          ) ->> 'ok')::boolean then
        slot := v_cursor;
        return next;
      end if;
      v_cursor := v_cursor + make_interval(mins => p_step_minutes);
    end loop;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- מרחק בין ערים (חישוב Haversine)
-- ---------------------------------------------------------------------
create or replace function public.haversine_km(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
)
returns double precision
language sql
immutable
as $$
  select case
    when lat1 is null or lon1 is null or lat2 is null or lon2 is null then null
    else 6371 * 2 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
    ))
  end;
$$;

-- ---------------------------------------------------------------------
-- צפיות – רישום ועדכון מונה
-- ---------------------------------------------------------------------
create or replace function public.record_profile_view(p_professional_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_viewer uuid := public.current_profile_id();
  v_inserted integer;
begin
  if v_viewer is null then
    return;
  end if;

  insert into public.profile_views (professional_id, viewer_id)
  values (p_professional_id, v_viewer)
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then
    update public.professional_profiles
    set profile_views_count = profile_views_count + 1
    where id = p_professional_id;
  end if;
end;
$$;

create or replace function public.record_post_view(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_viewer uuid := public.current_profile_id();
  v_inserted integer;
begin
  if v_viewer is null then
    return;
  end if;

  insert into public.post_views (post_id, viewer_id)
  values (p_post_id, v_viewer)
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then
    update public.professional_posts set views_count = views_count + 1 where id = p_post_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- זמן תגובה ממוצע של בעל מקצוע (בדקות)
-- ---------------------------------------------------------------------
create or replace function public.refresh_response_time(p_professional_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_profile uuid;
  v_avg numeric;
begin
  select profile_id into v_profile from public.professional_profiles where id = p_professional_id;
  if v_profile is null then return; end if;

  select avg(extract(epoch from (reply.created_at - incoming.created_at)) / 60)
  into v_avg
  from public.messages incoming
  join lateral (
    select m2.created_at
    from public.messages m2
    where m2.conversation_id = incoming.conversation_id
      and m2.sender_id = v_profile
      and m2.created_at > incoming.created_at
    order by m2.created_at
    limit 1
  ) reply on true
  where incoming.sender_id is not null
    and incoming.sender_id <> v_profile
    and incoming.created_at > now() - interval '90 days'
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = incoming.conversation_id and cm.profile_id = v_profile
    );

  update public.professional_profiles
  set response_time_minutes = case when v_avg is null then null else round(v_avg)::integer end
  where id = p_professional_id;
end;
$$;


-- ==========================================================
-- 0009_search_and_feed.sql
-- ==========================================================

-- =====================================================================
-- 0009 – חיפוש, גילוי ופיד
-- =====================================================================
-- כל הפונקציות כאן קוראות אך ורק מידע ציבורי (בעלי מקצוע פעילים,
-- פוסטים שפורסמו), ולכן הן security definer עם סינון מפורש.
-- =====================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------
-- חיפוש בעלי מקצוע
-- ---------------------------------------------------------------------
create or replace function public.search_professionals(
  p_term            text default null,
  p_profession_ids  uuid[] default null,
  p_city_id         uuid default null,
  p_max_distance_km integer default null,
  p_price_min       numeric default null,
  p_price_max       numeric default null,
  p_min_rating      numeric default null,
  p_min_experience  integer default null,
  p_home_visit      boolean default null,
  p_studio          boolean default null,
  p_event           boolean default null,
  p_online          boolean default null,
  p_available_today boolean default null,
  p_available_now   boolean default null,
  p_recurring       boolean default null,
  p_verified        boolean default null,
  p_sort            text default 'recommended',
  p_limit           integer default 20,
  p_offset          integer default 0
)
returns table (
  id uuid,
  profile_id uuid,
  username text,
  full_name text,
  business_name text,
  headline text,
  avatar_url text,
  cover_url text,
  city_id uuid,
  city_name text,
  rating_avg numeric,
  rating_count integer,
  followers_count integer,
  completed_bookings_count integer,
  years_experience integer,
  is_verified boolean,
  available_today boolean,
  available_now boolean,
  accepts_home_visits boolean,
  accepts_studio boolean,
  accepts_events boolean,
  response_time_minutes integer,
  min_price numeric,
  professions jsonb,
  distance_km double precision,
  published_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with ref as (
    select c.latitude as lat, c.longitude as lng from public.cities c where c.id = p_city_id
  ),
  base as (
    select
      pp.id,
      pp.profile_id,
      pr.username::text as username,
      pr.full_name,
      pp.business_name,
      pp.headline,
      coalesce(pp.avatar_url, pr.avatar_url) as avatar_url,
      pp.cover_url,
      pp.city_id,
      ct.name as city_name,
      pp.rating_avg,
      pp.rating_count,
      pp.followers_count,
      pp.completed_bookings_count,
      pp.years_experience,
      pp.is_verified,
      pp.available_today,
      case when pp.available_now
             and (pp.available_now_until is null or pp.available_now_until > now())
           then true else false end as available_now,
      pp.accepts_home_visits,
      pp.accepts_studio,
      pp.accepts_events,
      pp.response_time_minutes,
      pp.published_at,
      (select min(s.price_min) from public.professional_services s
        where s.professional_id = pp.id and s.is_active and s.deleted_at is null) as min_price,
      (select coalesce(jsonb_agg(jsonb_build_object('id', pf.id, 'name', pf.name, 'slug', pf.slug)), '[]'::jsonb)
         from public.professional_professions ppf
         join public.professions pf on pf.id = ppf.profession_id
        where ppf.professional_id = pp.id) as professions,
      case
        when p_city_id is null then null
        when pp.city_id = p_city_id then 0::double precision
        else public.haversine_km((select lat from ref), (select lng from ref), ct.latitude, ct.longitude)
      end as distance_km,
      greatest(
        coalesce(similarity(public.normalize_text(pp.business_name), public.normalize_text(p_term)), 0),
        coalesce(similarity(public.normalize_text(pr.full_name), public.normalize_text(p_term)), 0),
        coalesce(similarity(pr.username::text, public.normalize_text(p_term)), 0)
      ) as name_score
    from public.professional_profiles pp
    join public.profiles pr on pr.id = pp.profile_id
    left join public.cities ct on ct.id = pp.city_id
    where pp.status = 'active'
      and pp.deleted_at is null
      and pr.status = 'active'
      and pr.deleted_at is null
  ),
  filtered as (
    select b.* from base b
    where
      (p_term is null or trim(p_term) = '' or
        b.name_score > 0.12
        or public.normalize_text(b.business_name) like '%' || public.normalize_text(p_term) || '%'
        or public.normalize_text(b.full_name) like '%' || public.normalize_text(p_term) || '%'
        or b.username like '%' || public.normalize_text(p_term) || '%'
        or exists (
          select 1 from public.professional_professions ppf
          join public.professions pf on pf.id = ppf.profession_id
          where ppf.professional_id = b.id
            and (pf.name_norm like '%' || public.normalize_profession_name(p_term) || '%'
                 or similarity(pf.name_norm, public.normalize_profession_name(p_term)) > 0.3)
        )
        or exists (
          select 1 from public.professional_services s
          where s.professional_id = b.id and s.is_active and s.deleted_at is null
            and public.normalize_text(s.name) like '%' || public.normalize_text(p_term) || '%'
        )
      )
      and (p_profession_ids is null or array_length(p_profession_ids, 1) is null or exists (
            select 1 from public.professional_professions ppf
            where ppf.professional_id = b.id and ppf.profession_id = any (p_profession_ids)))
      and (
        p_city_id is null
        or b.city_id = p_city_id
        or exists (select 1 from public.service_areas sa
                    where sa.professional_id = b.id and sa.city_id = p_city_id)
        or (p_max_distance_km is not null and b.distance_km is not null and b.distance_km <= p_max_distance_km)
      )
      and (p_max_distance_km is null or b.distance_km is null or b.distance_km <= p_max_distance_km)
      and (p_price_min is null or b.min_price is null or b.min_price >= p_price_min)
      and (p_price_max is null or b.min_price is null or b.min_price <= p_price_max)
      and (p_min_rating is null or b.rating_avg >= p_min_rating)
      and (p_min_experience is null or coalesce(b.years_experience, 0) >= p_min_experience)
      and (p_home_visit is not true or b.accepts_home_visits)
      and (p_studio is not true or b.accepts_studio)
      and (p_event is not true or b.accepts_events)
      and (p_online is not true or exists (
            select 1 from public.professional_profiles x where x.id = b.id and x.accepts_online))
      and (p_available_today is not true or b.available_today)
      and (p_available_now is not true or b.available_now)
      and (p_verified is not true or b.is_verified)
      and (p_recurring is not true or exists (
            select 1 from public.professional_services s
            where s.professional_id = b.id and s.supports_recurring and s.is_active and s.deleted_at is null))
  ),
  counted as (
    select f.*, count(*) over () as total_count from filtered f
  )
  select
    c.id, c.profile_id, c.username, c.full_name, c.business_name, c.headline,
    c.avatar_url, c.cover_url, c.city_id, c.city_name, c.rating_avg, c.rating_count,
    c.followers_count, c.completed_bookings_count, c.years_experience, c.is_verified,
    c.available_today, c.available_now, c.accepts_home_visits, c.accepts_studio,
    c.accepts_events, c.response_time_minutes, c.min_price, c.professions,
    c.distance_km, c.published_at, c.total_count
  from counted c
  order by
    case when p_sort = 'nearest'    then coalesce(c.distance_km, 99999) end asc nulls last,
    case when p_sort = 'newest'     then c.published_at end desc nulls last,
    case when p_sort = 'rating'     then c.rating_avg end desc nulls last,
    case when p_sort = 'price_low'  then coalesce(c.min_price, 999999) end asc,
    case when p_sort = 'response'   then coalesce(c.response_time_minutes, 99999) end asc,
    case when p_sort = 'followers'  then c.followers_count end desc nulls last,
    case when p_sort = 'availability' then (case when c.available_now then 0 when c.available_today then 1 else 2 end) end asc,
    case when p_sort not in ('nearest','newest','rating','price_low','response','followers','availability')
      then (
        c.name_score * 40
        + c.rating_avg * 8
        + least(c.rating_count, 40) * 0.5
        + least(c.completed_bookings_count, 100) * 0.2
        + least(c.followers_count, 500) * 0.05
        + case when c.is_verified then 6 else 0 end
        + case when c.available_now then 5 when c.available_today then 3 else 0 end
        + case when c.distance_km is null then 0 else greatest(0, 10 - c.distance_km / 5) end
      )
    end desc nulls last,
    c.rating_avg desc,
    c.published_at desc nulls last
  limit greatest(least(coalesce(p_limit, 20), 60), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function public.search_professionals is
  'חיפוש בעלי מקצוע לפי טקסט, מקצוע, עיר, מרחק, מחיר, דירוג, זמינות וסוג שירות.';

-- ---------------------------------------------------------------------
-- השלמה אוטומטית לחיפוש
-- ---------------------------------------------------------------------
create or replace function public.search_suggestions(p_term text, p_limit integer default 8)
returns table (kind text, id uuid, label text, sublabel text, score real)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with t as (select public.normalize_text(p_term) as term)
  (
    select 'profession'::text, pf.id, pf.name, 'מקצוע'::text,
           greatest(similarity(pf.name_norm, (select term from t)),
                    case when pf.name_norm like '%' || (select term from t) || '%' then 0.7 else 0 end)::real
    from public.professions pf, t
    where pf.is_active and (pf.name_norm like '%' || t.term || '%' or similarity(pf.name_norm, t.term) > 0.25)
    order by 5 desc limit p_limit
  )
  union all
  (
    select 'city'::text, c.id, c.name, 'עיר'::text,
           greatest(similarity(c.name_norm, (select term from t)),
                    case when c.name_norm like (select term from t) || '%' then 0.9 else 0 end)::real
    from public.cities c, t
    where c.is_active and (c.name_norm like '%' || t.term || '%' or similarity(c.name_norm, t.term) > 0.3)
    order by 5 desc limit p_limit
  )
  union all
  (
    select 'professional'::text, pp.id, pp.business_name, ct.name,
           greatest(similarity(public.normalize_text(pp.business_name), (select term from t)),
                    similarity(pr.username::text, (select term from t)))::real
    from public.professional_profiles pp
    join public.profiles pr on pr.id = pp.profile_id
    left join public.cities ct on ct.id = pp.city_id, t
    where pp.status = 'active' and pp.deleted_at is null
      and (public.normalize_text(pp.business_name) like '%' || t.term || '%'
           or pr.username::text like '%' || t.term || '%'
           or similarity(public.normalize_text(pp.business_name), t.term) > 0.25)
    order by 5 desc limit p_limit
  )
  union all
  (
    select 'service'::text, s.id, s.name, pp.business_name
         , similarity(public.normalize_text(s.name), (select term from t))::real
    from public.professional_services s
    join public.professional_profiles pp on pp.id = s.professional_id and pp.status = 'active'
    , t
    where s.is_active and s.deleted_at is null
      and (public.normalize_text(s.name) like '%' || t.term || '%'
           or similarity(public.normalize_text(s.name), t.term) > 0.3)
    order by 5 desc limit p_limit
  );
$$;

-- רישום מונח חיפוש פופולרי
create or replace function public.log_search(p_term text, p_results integer default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_me uuid := public.current_profile_id();
  v_norm text := public.normalize_text(p_term);
begin
  if v_norm is null or char_length(v_norm) < 2 then
    return;
  end if;

  if v_me is not null then
    insert into public.search_history (profile_id, term, results_count) values (v_me, p_term, p_results);
    delete from public.search_history
    where profile_id = v_me
      and id not in (
        select id from public.search_history where profile_id = v_me order by created_at desc limit 20
      );
  end if;

  insert into public.popular_searches (term, hits) values (v_norm, 1)
  on conflict (term) do update set hits = public.popular_searches.hits + 1, updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------
-- הפיד
-- ---------------------------------------------------------------------
create or replace function public.feed_posts(
  p_tab     text default 'for_you',
  p_city_id uuid default null,
  p_limit   integer default 12,
  p_offset  integer default 0
)
returns table (
  id uuid,
  professional_id uuid,
  author_profile_id uuid,
  username text,
  business_name text,
  author_avatar text,
  is_verified boolean,
  city_name text,
  title text,
  description text,
  tags text[],
  price_estimate numeric,
  price_type public.price_type,
  duration_minutes integer,
  is_before_after boolean,
  service_id uuid,
  service_name text,
  profession_name text,
  likes_count integer,
  comments_count integer,
  saves_count integer,
  views_count integer,
  published_at timestamptz,
  media jsonb,
  liked_by_me boolean,
  saved_by_me boolean,
  followed_by_me boolean,
  total_count bigint
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with me as (select public.current_profile_id() as id),
  my_city as (
    select coalesce(p_city_id, (select pr.city_id from public.profiles pr where pr.id = (select id from me))) as city_id
  ),
  base as (
    select
      pt.id, pt.professional_id, pt.author_profile_id,
      pr.username::text as username,
      pp.business_name,
      coalesce(pp.avatar_url, pr.avatar_url) as author_avatar,
      pp.is_verified,
      ct.name as city_name,
      pt.title, pt.description, pt.tags, pt.price_estimate, pt.price_type, pt.duration_minutes,
      pt.is_before_after, pt.service_id,
      s.name as service_name,
      pf.name as profession_name,
      pt.likes_count, pt.comments_count, pt.saves_count, pt.views_count, pt.published_at,
      pt.city_id,
      (select coalesce(jsonb_agg(jsonb_build_object(
                 'id', m.id, 'url', m.url, 'type', m.media_type, 'thumb', m.thumbnail_url,
                 'role', m.before_after_role, 'alt', m.alt_text,
                 'width', m.width, 'height', m.height) order by m.position), '[]'::jsonb)
         from public.post_media m where m.post_id = pt.id) as media,
      exists (select 1 from public.post_likes l where l.post_id = pt.id and l.profile_id = (select id from me)) as liked_by_me,
      exists (select 1 from public.saved_posts sp where sp.post_id = pt.id and sp.profile_id = (select id from me)) as saved_by_me,
      exists (select 1 from public.follows f where f.following_id = pt.author_profile_id and f.follower_id = (select id from me)) as followed_by_me
    from public.professional_posts pt
    join public.professional_profiles pp on pp.id = pt.professional_id
    join public.profiles pr on pr.id = pt.author_profile_id
    left join public.cities ct on ct.id = pt.city_id
    left join public.professional_services s on s.id = pt.service_id
    left join public.professions pf on pf.id = pt.profession_id
    where pt.status = 'published'
      and pt.deleted_at is null
      and pp.status = 'active'
      and pr.status = 'active'
      and not public.is_blocked_between(coalesce((select id from me), pt.author_profile_id), pt.author_profile_id)
  ),
  scoped as (
    select b.* from base b
    where case p_tab
      when 'following' then b.followed_by_me
      when 'saved' then b.saved_by_me
      when 'city' then b.city_id is not distinct from (select city_id from my_city)
      when 'new' then b.published_at > now() - interval '14 days'
      when 'popular' then true
      when 'before_after' then b.is_before_after
      else true
    end
  ),
  counted as (select s.*, count(*) over () as total_count from scoped s)
  select
    c.id, c.professional_id, c.author_profile_id, c.username, c.business_name, c.author_avatar,
    c.is_verified, c.city_name, c.title, c.description, c.tags, c.price_estimate, c.price_type,
    c.duration_minutes, c.is_before_after, c.service_id, c.service_name, c.profession_name,
    c.likes_count, c.comments_count, c.saves_count, c.views_count, c.published_at, c.media,
    c.liked_by_me, c.saved_by_me, c.followed_by_me, c.total_count
  from counted c
  order by
    case when p_tab = 'popular'
      then (c.likes_count * 3 + c.comments_count * 4 + c.saves_count * 5 + c.views_count * 0.1)
      end desc nulls last,
    case when p_tab = 'for_you'
      then (
        (case when c.followed_by_me then 60 else 0 end)
        + (case when c.city_id is not distinct from (select city_id from my_city) then 25 else 0 end)
        + (case when c.is_verified then 5 else 0 end)
        + least(c.likes_count, 100) * 0.4
        + least(c.saves_count, 50) * 0.6
        + greatest(0, 30 - extract(epoch from (now() - c.published_at)) / 86400)
      )
      end desc nulls last,
    c.published_at desc
  limit greatest(least(coalesce(p_limit, 12), 40), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function public.feed_posts is
  'הפיד הראשי. תומך בלשוניות: עוקבים, בשבילך, חדשים, פופולריים, לפי עיר, שמורים ולפני–אחרי.';

-- ---------------------------------------------------------------------
-- בעלי מקצוע דומים
-- ---------------------------------------------------------------------
create or replace function public.similar_professionals(p_professional_id uuid, p_limit integer default 6)
returns table (
  id uuid, business_name text, username text, avatar_url text, city_name text,
  rating_avg numeric, rating_count integer, is_verified boolean, headline text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with src as (
    select pp.city_id,
           array(select profession_id from public.professional_professions where professional_id = p_professional_id) as profs
    from public.professional_profiles pp where pp.id = p_professional_id
  )
  select pp.id, pp.business_name, pr.username::text, coalesce(pp.avatar_url, pr.avatar_url),
         ct.name, pp.rating_avg, pp.rating_count, pp.is_verified, pp.headline
  from public.professional_profiles pp
  join public.profiles pr on pr.id = pp.profile_id
  left join public.cities ct on ct.id = pp.city_id, src
  where pp.id <> p_professional_id
    and pp.status = 'active' and pp.deleted_at is null
    and exists (
      select 1 from public.professional_professions ppf
      where ppf.professional_id = pp.id and ppf.profession_id = any (src.profs)
    )
  order by (case when pp.city_id is not distinct from src.city_id then 1 else 0 end) desc,
           pp.rating_avg desc, pp.rating_count desc
  limit greatest(least(coalesce(p_limit, 6), 20), 1);
$$;

-- ---------------------------------------------------------------------
-- התפלגות דירוגים לפרופיל מקצועי
-- ---------------------------------------------------------------------
create or replace function public.rating_breakdown(p_professional_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'average', coalesce(round(avg(rating)::numeric, 2), 0),
    'count', count(*),
    'stars', coalesce(jsonb_object_agg(star, cnt), '{}'::jsonb),
    'repeat_client_rate', (
      select case when count(distinct client_id) = 0 then 0
             else round(100.0 * count(*) filter (where c > 1) / count(distinct client_id))
             end
      from (
        select client_id, count(*) as c
        from public.bookings
        where professional_id = p_professional_id and status = 'completed'
        group by client_id
      ) t
    )
  )
  from (
    select rating as star, count(*) as cnt
    from public.reviews
    where professional_id = p_professional_id and deleted_at is null and not is_hidden
    group by rating
  ) s
  right join (
    select avg(rating) as rating, count(*) as _c
    from public.reviews
    where professional_id = p_professional_id and deleted_at is null and not is_hidden
  ) agg on true;
$$;

-- ---------------------------------------------------------------------
-- סטטיסטיקות מנהל
-- ---------------------------------------------------------------------
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v jsonb;
begin
  if not exists (
    select 1 from public.profiles
    where id = public.current_profile_id() and role in ('admin', 'moderator')
  ) then
    raise exception 'אין הרשאה' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'users_total', (select count(*) from public.profiles where deleted_at is null),
    'users_today', (select count(*) from public.profiles where created_at >= current_date),
    'users_7d', (select count(*) from public.profiles where created_at >= current_date - 7),
    'professionals_total', (select count(*) from public.professional_profiles where deleted_at is null),
    'professionals_active', (select count(*) from public.professional_profiles where status = 'active'),
    'professionals_pending', (select count(*) from public.professional_profiles where status = 'pending_review'),
    'professionals_today', (select count(*) from public.professional_profiles where created_at >= current_date),
    'posts_total', (select count(*) from public.professional_posts where status = 'published' and deleted_at is null),
    'posts_today', (select count(*) from public.professional_posts where published_at >= current_date),
    'bookings_total', (select count(*) from public.bookings),
    'bookings_today', (select count(*) from public.bookings where created_at >= current_date),
    'bookings_pending', (select count(*) from public.bookings where status = 'pending'),
    'series_active', (select count(*) from public.recurring_booking_series where status = 'active'),
    'reviews_total', (select count(*) from public.reviews where deleted_at is null),
    'reports_open', (select count(*) from public.reports where status in ('open', 'reviewing')),
    'profession_requests_open', (select count(*) from public.profession_requests where status = 'pending'),
    'verifications_pending', (select count(*) from public.professional_verifications where status = 'pending'),
    'signups_by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'count', c) order by d), '[]'::jsonb)
      from (
        select date_trunc('day', created_at) as d, count(*) as c
        from public.profiles
        where created_at >= current_date - 29
        group by 1
      ) x
    )
  ) into v;

  return v;
end;
$$;


-- ==========================================================
-- 0010_guards.sql
-- ==========================================================

-- =====================================================================
-- 0010 – שומרי סף ברמת מסד הנתונים
-- =====================================================================
-- אכיפה של חוקי המוצר גם כאשר הפעולה מגיעה ישירות מה־API ולא מהממשק.
-- =====================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------
-- בעלות על פרופיל מקצועי / נראות ציבורית
-- ---------------------------------------------------------------------
create or replace function public.owns_professional(p_professional_id uuid, p_profile_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.professional_profiles pp
    where pp.id = p_professional_id
      and pp.profile_id = coalesce(p_profile_id, public.current_profile_id())
  );
$$;

create or replace function public.professional_is_public(p_professional_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.professional_profiles pp
    join public.profiles pr on pr.id = pp.profile_id
    where pp.id = p_professional_id
      and pp.status = 'active'
      and pp.deleted_at is null
      and pr.status = 'active'
      and pr.deleted_at is null
  );
$$;

create or replace function public.is_admin(p_profile_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.profiles
    where id = coalesce(p_profile_id, public.current_profile_id())
      and role in ('admin', 'moderator')
      and status = 'active'
  );
$$;

create or replace function public.is_super_admin(p_profile_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.profiles
    where id = coalesce(p_profile_id, public.current_profile_id())
      and role = 'admin' and status = 'active'
  );
$$;

-- האם המשתמש רשאי לראות פוסט מסוים
create or replace function public.can_view_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.professional_posts pt
    where pt.id = p_post_id
      and (
        (pt.status = 'published' and pt.deleted_at is null and public.professional_is_public(pt.professional_id))
        or pt.author_profile_id = public.current_profile_id()
        or public.is_admin()
      )
  );
$$;

-- האם המשתמש צד בהזמנה
create or replace function public.is_booking_party(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.bookings b
    where b.id = p_booking_id
      and (b.client_id = public.current_profile_id()
           or public.owns_professional(b.professional_id))
  );
$$;

-- ---------------------------------------------------------------------
-- שומר סף להזמנות: מי רשאי לשנות מה
-- ---------------------------------------------------------------------
create or replace function public.guard_booking_update()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_actor uuid := public.current_profile_id();
  v_is_client boolean;
  v_is_pro boolean;
begin
  -- חותמות זמן אוטומטיות לפי הסטטוס
  if new.status is distinct from old.status then
    -- אישור ההזמנה הוא הרגע שבו הכתובת המלאה נחשפת לבעל המקצוע.
    if new.status in ('confirmed', 'on_the_way', 'arrived', 'in_progress', 'completed') then
      new.address_revealed := true;
    end if;

    case new.status
      when 'confirmed'   then new.confirmed_at   := coalesce(new.confirmed_at, now());
      when 'on_the_way'  then new.on_the_way_at  := coalesce(new.on_the_way_at, now());
      when 'arrived'     then new.arrived_at     := coalesce(new.arrived_at, now());
      when 'in_progress' then new.started_at     := coalesce(new.started_at, now());
      when 'completed'   then new.completed_at   := coalesce(new.completed_at, now());
      when 'cancelled'   then
        new.cancelled_at := coalesce(new.cancelled_at, now());
        new.cancelled_by := coalesce(new.cancelled_by, v_actor);
      else null;
    end case;
  end if;

  -- כאשר הפעולה מגיעה משרת מהימן (service_role ללא JWT) – הבדיקות נעשות בקוד השרת.
  if v_actor is null or public.is_admin(v_actor) then
    return new;
  end if;

  v_is_client := old.client_id = v_actor;
  v_is_pro := public.owns_professional(old.professional_id, v_actor);

  if not (v_is_client or v_is_pro) then
    raise exception 'אין הרשאה לעדכן הזמנה זו' using errcode = 'insufficient_privilege';
  end if;

  -- הלקוח אינו רשאי לשנות מחיר או להעביר את ההזמנה לבעל מקצוע אחר.
  if v_is_client and not v_is_pro then
    if new.price_amount is distinct from old.price_amount
       or new.travel_fee is distinct from old.travel_fee then
      raise exception 'רק בעל המקצוע יכול לעדכן מחיר' using errcode = 'insufficient_privilege';
    end if;
    if new.status is distinct from old.status
       and new.status not in ('cancelled', 'confirmed', 'pending', 'draft') then
      raise exception 'סטטוס זה נקבע על ידי בעל המקצוע בלבד' using errcode = 'insufficient_privilege';
    end if;
    -- הלקוח יכול לאשר רק הצעת שינוי שהוגשה לו.
    if new.status = 'confirmed' and old.status <> 'change_proposed' then
      raise exception 'רק בעל המקצוע מאשר הזמנה' using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- בעל המקצוע אינו רשאי לשנות את פרטי הלקוח, הכתובת או ההערות שלו.
  if v_is_pro and not v_is_client then
    if new.address_id is distinct from old.address_id
       or new.notes is distinct from old.notes
       or new.people_count is distinct from old.people_count then
      raise exception 'רק הלקוח יכול לעדכן את פרטי ההזמנה שלו' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.client_id is distinct from old.client_id
     or new.professional_id is distinct from old.professional_id then
    raise exception 'לא ניתן להעביר הזמנה בין משתמשים' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_guard_update on public.bookings;
create trigger bookings_guard_update
  before update on public.bookings
  for each row execute function public.guard_booking_update();

-- ---------------------------------------------------------------------
-- שומר סף לסדרות: אין סדרה פעילה ללא אישור שני הצדדים
-- ---------------------------------------------------------------------
create or replace function public.guard_series_activation()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    if new.client_approved_at is null or new.professional_approved_at is null then
      raise exception 'סדרה קבועה נכנסת לתוקף רק לאחר אישור הלקוח ובעל המקצוע'
        using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status = 'paused' and old.status is distinct from 'paused' then
    new.paused_at := coalesce(new.paused_at, now());
  end if;

  if tg_op = 'UPDATE' and new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
    new.cancelled_by := coalesce(new.cancelled_by, public.current_profile_id());
  end if;

  return new;
end;
$$;

drop trigger if exists series_guard_activation on public.recurring_booking_series;
create trigger series_guard_activation
  before insert or update on public.recurring_booking_series
  for each row execute function public.guard_series_activation();

-- התראות על שינויים בסדרה
create or replace function public.notify_series_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pro_profile uuid;
begin
  select profile_id into v_pro_profile from public.professional_profiles where id = new.professional_id;

  if tg_op = 'INSERT' then
    perform public.create_notification(
      v_pro_profile, 'series_created',
      public.display_name(new.client_id) || ' מבקש לקבוע מפגש קבוע',
      null, new.client_id, 'series', new.id, '/dashboard/pro/recurring/' || new.id
    );
  elsif new.status is distinct from old.status then
    if new.status = 'active' then
      perform public.create_notification(new.client_id, 'series_confirmed',
        'הסדרה הקבועה אושרה', null, v_pro_profile, 'series', new.id, '/dashboard/recurring/' || new.id);
      perform public.create_notification(v_pro_profile, 'series_confirmed',
        'הסדרה הקבועה אושרה', null, new.client_id, 'series', new.id, '/dashboard/pro/recurring/' || new.id);
    elsif new.status in ('cancelled', 'paused') then
      perform public.create_notification(
        case when new.cancelled_by = new.client_id then v_pro_profile else new.client_id end,
        'series_cancelled',
        case when new.status = 'cancelled' then 'הסדרה הקבועה בוטלה' else 'הסדרה הקבועה הושהתה' end,
        null, new.cancelled_by, 'series', new.id, '/dashboard/recurring/' || new.id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists series_notify on public.recurring_booking_series;
create trigger series_notify
  after insert or update of status on public.recurring_booking_series
  for each row execute function public.notify_series_change();

-- ---------------------------------------------------------------------
-- שומר סף להודעות: אין שליחה למשתמש חסום
-- ---------------------------------------------------------------------
create or replace function public.guard_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_other uuid;
begin
  if new.sender_id is null then
    return new;
  end if;

  select cm.profile_id into v_other
  from public.conversation_members cm
  where cm.conversation_id = new.conversation_id
    and cm.profile_id <> new.sender_id
  limit 1;

  if v_other is not null and public.is_blocked_between(new.sender_id, v_other) then
    raise exception 'לא ניתן לשלוח הודעה למשתמש חסום' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_guard_insert on public.messages;
create trigger messages_guard_insert
  before insert on public.messages
  for each row execute function public.guard_message_insert();

-- ---------------------------------------------------------------------
-- ביקורת רק לאחר הזמנה שהושלמה
-- ---------------------------------------------------------------------
create or replace function public.guard_review_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select * into v_booking from public.bookings where id = new.booking_id;

  if not found then
    raise exception 'הזמנה לא נמצאה' using errcode = 'foreign_key_violation';
  end if;

  if v_booking.status <> 'completed' then
    raise exception 'ניתן לכתוב ביקורת רק לאחר שהטיפול סומן כהושלם' using errcode = 'check_violation';
  end if;

  if new.client_id <> v_booking.client_id then
    raise exception 'רק הלקוח שקיבל את השירות יכול לכתוב ביקורת' using errcode = 'insufficient_privilege';
  end if;

  new.professional_id := v_booking.professional_id;
  new.service_id := coalesce(new.service_id, v_booking.service_id);
  new.is_verified_booking := true;

  return new;
end;
$$;

drop trigger if exists reviews_guard_insert on public.reviews;
create trigger reviews_guard_insert
  before insert on public.reviews
  for each row execute function public.guard_review_insert();

-- ---------------------------------------------------------------------
-- פוסט מוצמד חייב מיקום הצמדה
-- ---------------------------------------------------------------------
alter table public.professional_posts drop constraint if exists posts_pinned_requires_order;
alter table public.professional_posts
  add constraint posts_pinned_requires_order
  check ((not is_pinned) or pinned_order is not null);

-- ---------------------------------------------------------------------
-- חשיפת כתובת רק לאחר אישור הזמנה
-- ---------------------------------------------------------------------
create or replace function public.can_view_address(p_address_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    exists (
      select 1 from public.service_addresses sa
      where sa.id = p_address_id and sa.profile_id = public.current_profile_id()
    )
    or exists (
      select 1 from public.bookings b
      where b.address_id = p_address_id
        and b.address_revealed
        and b.status in ('confirmed', 'on_the_way', 'arrived', 'in_progress', 'completed')
        and public.owns_professional(b.professional_id)
    )
    or public.is_admin();
$$;

comment on function public.can_view_address is
  'כתובת מלאה נחשפת לבעל המקצוע רק לאחר שההזמנה אושרה.';

-- ---------------------------------------------------------------------
-- אישור הורה לקטינים לפני ביקור בית
-- ---------------------------------------------------------------------
create or replace function public.guard_minor_home_booking()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_birth date;
  v_guardian timestamptz;
begin
  if new.location_type <> 'client_home' or new.status = 'draft' then
    return new;
  end if;

  select birth_date, guardian_approved_at into v_birth, v_guardian
  from public.profiles where id = new.client_id;

  if v_birth is not null and v_birth > current_date - interval '18 years' then
    if v_guardian is null and not new.guardian_approved then
      raise exception 'הזמנת בעל מקצוע לבית עבור משתמש מתחת לגיל 18 מחייבת אישור הורה או אחראי'
        using errcode = 'check_violation';
    end if;
    new.guardian_approved := true;
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_guard_minor on public.bookings;
create trigger bookings_guard_minor
  before insert or update of status, location_type on public.bookings
  for each row execute function public.guard_minor_home_booking();


-- ==========================================================
-- 0011_rls_policies.sql
-- ==========================================================

-- =====================================================================
-- 0011 – Row Level Security
-- =====================================================================
-- כל טבלה מוגנת. ההרשאות נבדקות פעמיים: גם בקוד השרת וגם כאן.
-- הרשאות ברמת עמודה מונעות חשיפת שדות רגישים (סיסמה, קוד שחזור וכו').
-- =====================================================================

set search_path = public, extensions;

-- ודא שקיימים התפקידים של Supabase (בסביבת פיתוח מקומית הם עשויים לחסר).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;

-- ברירת מחדל: הרשאות מלאות ל־service_role, קריאה/כתיבה מבוקרת לשאר.
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- הפעלת RLS על כל הטבלאות
do $$
declare t record;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- =====================================================================
-- profiles
-- =====================================================================
-- שדות רגישים אינם ניתנים לקריאה כלל על ידי לקוח – רק דרך קוד שרת מהימן.
revoke select on public.profiles from anon, authenticated;
grant select (
  id, username, full_name, city_id, avatar_url, bio, role, status, active_mode,
  is_professional, followers_count, following_count, privacy, last_seen_at,
  created_at, updated_at, deleted_at
) on public.profiles to anon, authenticated;

revoke update on public.profiles from authenticated;
grant update (full_name, city_id, avatar_url, bio, privacy, active_mode, last_seen_at)
  on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to anon, authenticated
  using (
    (deleted_at is null and status <> 'banned')
    or id = public.current_profile_id()
    or public.is_admin()
  );

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = public.current_profile_id() and status = 'active')
  with check (id = public.current_profile_id());

-- =====================================================================
-- usernames – רק לבדיקת תפיסה
-- =====================================================================
revoke all on public.usernames from anon, authenticated;
grant select (username) on public.usernames to anon, authenticated;

drop policy if exists usernames_select on public.usernames;
create policy usernames_select on public.usernames
  for select to anon, authenticated using (true);

-- =====================================================================
-- טבלאות אימות – שרת בלבד (ללא מדיניות = ללא גישה)
-- =====================================================================
revoke all on public.recovery_codes from anon, authenticated;
revoke all on public.login_attempts from anon, authenticated;
revoke all on public.rate_limits from anon, authenticated;
revoke all on public.phone_verification_codes from anon, authenticated;
revoke all on public.direct_conversation_keys from anon, authenticated;
revoke all on public.activity_log from anon, authenticated;

-- היסטוריית התחברויות: המשתמש רשאי לראות את שלו בלבד.
revoke all on public.auth_sessions from anon, authenticated;
grant select (id, profile_id, user_agent, ip_address, created_at, last_used_at, expires_at, revoked_at)
  on public.auth_sessions to authenticated;
grant update (revoked_at) on public.auth_sessions to authenticated;

drop policy if exists auth_sessions_own on public.auth_sessions;
create policy auth_sessions_own on public.auth_sessions
  for select to authenticated using (profile_id = public.current_profile_id());

drop policy if exists auth_sessions_revoke_own on public.auth_sessions;
create policy auth_sessions_revoke_own on public.auth_sessions
  for update to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

drop policy if exists security_events_own on public.security_events;
create policy security_events_own on public.security_events
  for select to authenticated
  using (profile_id = public.current_profile_id() or public.is_admin());

-- =====================================================================
-- cities – ציבורי לקריאה
-- =====================================================================
drop policy if exists cities_select on public.cities;
create policy cities_select on public.cities
  for select to anon, authenticated using (true);

drop policy if exists cities_admin_write on public.cities;
create policy cities_admin_write on public.cities
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- professions
-- =====================================================================
drop policy if exists professions_select on public.professions;
create policy professions_select on public.professions
  for select to anon, authenticated
  using (is_active or public.is_admin());

drop policy if exists professions_admin_write on public.professions;
create policy professions_admin_write on public.professions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- profession_requests
-- =====================================================================
drop policy if exists profession_requests_select on public.profession_requests;
create policy profession_requests_select on public.profession_requests
  for select to authenticated
  using (requested_by = public.current_profile_id() or public.is_admin());

drop policy if exists profession_requests_insert on public.profession_requests;
create policy profession_requests_insert on public.profession_requests
  for insert to authenticated
  with check (requested_by = public.current_profile_id());

drop policy if exists profession_requests_admin_update on public.profession_requests;
create policy profession_requests_admin_update on public.profession_requests
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- professional_profiles
-- =====================================================================
drop policy if exists professional_profiles_select on public.professional_profiles;
create policy professional_profiles_select on public.professional_profiles
  for select to anon, authenticated
  using (
    (status = 'active' and deleted_at is null)
    or profile_id = public.current_profile_id()
    or public.is_admin()
  );

drop policy if exists professional_profiles_insert on public.professional_profiles;
create policy professional_profiles_insert on public.professional_profiles
  for insert to authenticated
  with check (profile_id = public.current_profile_id());

drop policy if exists professional_profiles_update on public.professional_profiles;
create policy professional_profiles_update on public.professional_profiles
  for update to authenticated
  using (profile_id = public.current_profile_id() or public.is_admin())
  with check (profile_id = public.current_profile_id() or public.is_admin());

-- שדות שרק מנהל רשאי לשנות
revoke update (is_verified, verified_at, phone_verified) on public.professional_profiles from authenticated;

drop policy if exists professional_profiles_delete on public.professional_profiles;
create policy professional_profiles_delete on public.professional_profiles
  for delete to authenticated
  using (profile_id = public.current_profile_id() or public.is_admin());

-- =====================================================================
-- professional_contact_details – טלפון וכתובת סטודיו
-- =====================================================================
drop policy if exists contact_details_select on public.professional_contact_details;
create policy contact_details_select on public.professional_contact_details
  for select to authenticated
  using (
    public.owns_professional(professional_id)
    or public.is_admin()
    or exists (
      select 1 from public.bookings b
      where b.professional_id = professional_contact_details.professional_id
        and b.client_id = public.current_profile_id()
        and b.status in ('confirmed', 'on_the_way', 'arrived', 'in_progress', 'completed')
    )
  );

drop policy if exists contact_details_write on public.professional_contact_details;
create policy contact_details_write on public.professional_contact_details
  for all to authenticated
  using (public.owns_professional(professional_id) or public.is_admin())
  with check (public.owns_professional(professional_id) or public.is_admin());

-- =====================================================================
-- טבלאות בנות של פרופיל מקצועי
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'professional_professions', 'professional_services', 'service_areas',
    'professional_availability', 'unavailable_dates'
  ] loop
    execute format($p$
      drop policy if exists %1$s_select on public.%1$s;
      create policy %1$s_select on public.%1$s
        for select to anon, authenticated
        using (public.professional_is_public(professional_id)
               or public.owns_professional(professional_id)
               or public.is_admin());

      drop policy if exists %1$s_write on public.%1$s;
      create policy %1$s_write on public.%1$s
        for all to authenticated
        using (public.owns_professional(professional_id) or public.is_admin())
        with check (public.owns_professional(professional_id) or public.is_admin());
    $p$, t);
  end loop;
end $$;

-- =====================================================================
-- professional_verifications – מסמכים אישיים
-- =====================================================================
drop policy if exists verifications_select on public.professional_verifications;
create policy verifications_select on public.professional_verifications
  for select to authenticated
  using (public.owns_professional(professional_id) or public.is_admin());

drop policy if exists verifications_insert on public.professional_verifications;
create policy verifications_insert on public.professional_verifications
  for insert to authenticated
  with check (public.owns_professional(professional_id));

drop policy if exists verifications_admin_update on public.professional_verifications;
create policy verifications_admin_update on public.professional_verifications
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- follows
-- =====================================================================
drop policy if exists follows_select on public.follows;
create policy follows_select on public.follows
  for select to anon, authenticated using (true);

drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows
  for insert to authenticated
  with check (
    follower_id = public.current_profile_id()
    and not public.is_blocked_between(follower_id, following_id)
  );

drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows
  for delete to authenticated
  using (follower_id = public.current_profile_id());

-- =====================================================================
-- blocked_users
-- =====================================================================
drop policy if exists blocked_users_select on public.blocked_users;
create policy blocked_users_select on public.blocked_users
  for select to authenticated
  using (blocker_id = public.current_profile_id() or public.is_admin());

drop policy if exists blocked_users_write on public.blocked_users;
create policy blocked_users_write on public.blocked_users
  for all to authenticated
  using (blocker_id = public.current_profile_id())
  with check (blocker_id = public.current_profile_id());

-- =====================================================================
-- professional_posts
-- =====================================================================
drop policy if exists posts_select on public.professional_posts;
create policy posts_select on public.professional_posts
  for select to anon, authenticated
  using (
    (status = 'published' and deleted_at is null and public.professional_is_public(professional_id))
    or author_profile_id = public.current_profile_id()
    or public.is_admin()
  );

drop policy if exists posts_insert on public.professional_posts;
create policy posts_insert on public.professional_posts
  for insert to authenticated
  with check (
    author_profile_id = public.current_profile_id()
    and public.owns_professional(professional_id)
  );

drop policy if exists posts_update on public.professional_posts;
create policy posts_update on public.professional_posts
  for update to authenticated
  using (author_profile_id = public.current_profile_id() or public.is_admin())
  with check (author_profile_id = public.current_profile_id() or public.is_admin());

drop policy if exists posts_delete on public.professional_posts;
create policy posts_delete on public.professional_posts
  for delete to authenticated
  using (author_profile_id = public.current_profile_id() or public.is_admin());

-- =====================================================================
-- post_media
-- =====================================================================
drop policy if exists post_media_select on public.post_media;
create policy post_media_select on public.post_media
  for select to anon, authenticated using (public.can_view_post(post_id));

drop policy if exists post_media_write on public.post_media;
create policy post_media_write on public.post_media
  for all to authenticated
  using (exists (select 1 from public.professional_posts p
                 where p.id = post_media.post_id
                   and (p.author_profile_id = public.current_profile_id() or public.is_admin())))
  with check (exists (select 1 from public.professional_posts p
                      where p.id = post_media.post_id
                        and (p.author_profile_id = public.current_profile_id() or public.is_admin())));

-- =====================================================================
-- post_likes
-- =====================================================================
drop policy if exists post_likes_select on public.post_likes;
create policy post_likes_select on public.post_likes
  for select to anon, authenticated using (public.can_view_post(post_id));

drop policy if exists post_likes_insert on public.post_likes;
create policy post_likes_insert on public.post_likes
  for insert to authenticated
  with check (profile_id = public.current_profile_id() and public.can_view_post(post_id));

drop policy if exists post_likes_delete on public.post_likes;
create policy post_likes_delete on public.post_likes
  for delete to authenticated using (profile_id = public.current_profile_id());

-- =====================================================================
-- post_comments
-- =====================================================================
drop policy if exists post_comments_select on public.post_comments;
create policy post_comments_select on public.post_comments
  for select to anon, authenticated
  using (
    public.can_view_post(post_id)
    and (
      (deleted_at is null and not is_hidden)
      or profile_id = public.current_profile_id()
      or public.is_admin()
    )
  );

drop policy if exists post_comments_insert on public.post_comments;
create policy post_comments_insert on public.post_comments
  for insert to authenticated
  with check (profile_id = public.current_profile_id() and public.can_view_post(post_id));

drop policy if exists post_comments_update on public.post_comments;
create policy post_comments_update on public.post_comments
  for update to authenticated
  using (
    profile_id = public.current_profile_id()
    or public.is_admin()
    or exists (select 1 from public.professional_posts p
               where p.id = post_comments.post_id and p.author_profile_id = public.current_profile_id())
  )
  with check (true);

drop policy if exists post_comments_delete on public.post_comments;
create policy post_comments_delete on public.post_comments
  for delete to authenticated
  using (
    profile_id = public.current_profile_id()
    or public.is_admin()
    or exists (select 1 from public.professional_posts p
               where p.id = post_comments.post_id and p.author_profile_id = public.current_profile_id())
  );

-- =====================================================================
-- שמירות – פרטי לחלוטין
-- =====================================================================
drop policy if exists saved_posts_own on public.saved_posts;
create policy saved_posts_own on public.saved_posts
  for all to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

drop policy if exists saved_professionals_own on public.saved_professionals;
create policy saved_professionals_own on public.saved_professionals
  for all to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

drop policy if exists saved_searches_own on public.saved_searches;
create policy saved_searches_own on public.saved_searches
  for all to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

drop policy if exists search_history_own on public.search_history;
create policy search_history_own on public.search_history
  for all to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

drop policy if exists popular_searches_select on public.popular_searches;
create policy popular_searches_select on public.popular_searches
  for select to anon, authenticated using (true);

-- =====================================================================
-- צפיות – רק בעל הפרופיל רואה את הנתונים
-- =====================================================================
drop policy if exists profile_views_select on public.profile_views;
create policy profile_views_select on public.profile_views
  for select to authenticated
  using (public.owns_professional(professional_id) or public.is_admin());

drop policy if exists post_views_select on public.post_views;
create policy post_views_select on public.post_views
  for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.professional_posts p
               where p.id = post_views.post_id and p.author_profile_id = public.current_profile_id())
  );

-- =====================================================================
-- שיחות והודעות – רק משתתפי השיחה
-- =====================================================================
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select to authenticated
  using (public.is_conversation_member(id) or public.is_admin());

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations
  for insert to authenticated
  with check (created_by = public.current_profile_id());

drop policy if exists conversation_members_select on public.conversation_members;
create policy conversation_members_select on public.conversation_members
  for select to authenticated
  using (public.is_conversation_member(conversation_id) or public.is_admin());

drop policy if exists conversation_members_update on public.conversation_members;
create policy conversation_members_update on public.conversation_members
  for update to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (public.is_conversation_member(conversation_id) or public.is_admin());

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = public.current_profile_id()
    and public.is_conversation_member(conversation_id)
  );

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
  for update to authenticated
  using (sender_id = public.current_profile_id() or public.is_admin())
  with check (sender_id = public.current_profile_id() or public.is_admin());

-- =====================================================================
-- כתובות שירות
-- =====================================================================
drop policy if exists service_addresses_select on public.service_addresses;
create policy service_addresses_select on public.service_addresses
  for select to authenticated using (public.can_view_address(id));

drop policy if exists service_addresses_write on public.service_addresses;
create policy service_addresses_write on public.service_addresses
  for all to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

-- =====================================================================
-- הזמנות
-- =====================================================================
drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings
  for select to authenticated
  using (
    client_id = public.current_profile_id()
    or public.owns_professional(professional_id)
    or public.is_admin()
  );

drop policy if exists bookings_insert on public.bookings;
create policy bookings_insert on public.bookings
  for insert to authenticated
  with check (
    client_id = public.current_profile_id()
    and public.professional_is_public(professional_id)
    and (address_id is null or exists (
      select 1 from public.service_addresses sa
      where sa.id = address_id and sa.profile_id = public.current_profile_id()))
  );

drop policy if exists bookings_update on public.bookings;
create policy bookings_update on public.bookings
  for update to authenticated
  using (
    client_id = public.current_profile_id()
    or public.owns_professional(professional_id)
    or public.is_admin()
  )
  with check (
    client_id = public.current_profile_id()
    or public.owns_professional(professional_id)
    or public.is_admin()
  );

drop policy if exists booking_history_select on public.booking_status_history;
create policy booking_history_select on public.booking_status_history
  for select to authenticated
  using (public.is_booking_party(booking_id) or public.is_admin());

-- =====================================================================
-- סדרות קבועות
-- =====================================================================
drop policy if exists series_select on public.recurring_booking_series;
create policy series_select on public.recurring_booking_series
  for select to authenticated
  using (
    client_id = public.current_profile_id()
    or public.owns_professional(professional_id)
    or public.is_admin()
  );

drop policy if exists series_insert on public.recurring_booking_series;
create policy series_insert on public.recurring_booking_series
  for insert to authenticated
  with check (client_id = public.current_profile_id() and public.professional_is_public(professional_id));

drop policy if exists series_update on public.recurring_booking_series;
create policy series_update on public.recurring_booking_series
  for update to authenticated
  using (client_id = public.current_profile_id() or public.owns_professional(professional_id) or public.is_admin())
  with check (client_id = public.current_profile_id() or public.owns_professional(professional_id) or public.is_admin());

drop policy if exists occurrences_select on public.recurring_booking_occurrences;
create policy occurrences_select on public.recurring_booking_occurrences
  for select to authenticated
  using (exists (
    select 1 from public.recurring_booking_series s
    where s.id = recurring_booking_occurrences.series_id
      and (s.client_id = public.current_profile_id()
           or public.owns_professional(s.professional_id)
           or public.is_admin())
  ));

drop policy if exists occurrences_update on public.recurring_booking_occurrences;
create policy occurrences_update on public.recurring_booking_occurrences
  for update to authenticated
  using (exists (
    select 1 from public.recurring_booking_series s
    where s.id = recurring_booking_occurrences.series_id
      and (s.client_id = public.current_profile_id() or public.owns_professional(s.professional_id))
  ))
  with check (true);

-- =====================================================================
-- לקוחות קבועים – הערות פרטיות של בעל המקצוע
-- =====================================================================
drop policy if exists customer_notes_own on public.customer_notes;
create policy customer_notes_own on public.customer_notes
  for all to authenticated
  using (public.owns_professional(professional_id))
  with check (public.owns_professional(professional_id));

-- =====================================================================
-- ביקורות
-- =====================================================================
drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews
  for select to anon, authenticated
  using (
    (deleted_at is null and not is_hidden and public.professional_is_public(professional_id))
    or client_id = public.current_profile_id()
    or public.owns_professional(professional_id)
    or public.is_admin()
  );

drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews
  for insert to authenticated
  with check (
    client_id = public.current_profile_id()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.client_id = public.current_profile_id()
        and b.status = 'completed'
    )
  );

drop policy if exists reviews_update on public.reviews;
create policy reviews_update on public.reviews
  for update to authenticated
  using (client_id = public.current_profile_id() or public.is_admin())
  with check (client_id = public.current_profile_id() or public.is_admin());

drop policy if exists review_replies_select on public.review_replies;
create policy review_replies_select on public.review_replies
  for select to anon, authenticated using (deleted_at is null or public.is_admin());

drop policy if exists review_replies_write on public.review_replies;
create policy review_replies_write on public.review_replies
  for all to authenticated
  using (public.owns_professional(professional_id) or public.is_admin())
  with check (public.owns_professional(professional_id) or public.is_admin());

-- =====================================================================
-- התראות
-- =====================================================================
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated using (profile_id = public.current_profile_id());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete to authenticated using (profile_id = public.current_profile_id());

-- =====================================================================
-- דיווחים
-- =====================================================================
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated
  using (reporter_id = public.current_profile_id() or public.is_admin());

drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert to authenticated
  with check (reporter_id = public.current_profile_id());

drop policy if exists reports_admin_update on public.reports;
create policy reports_admin_update on public.reports
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- מנויי Push
-- =====================================================================
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

-- =====================================================================
-- הרשאות הרצה לפונקציות
-- =====================================================================
revoke execute on all functions in schema public from public;

grant execute on function
  public.current_profile_id(),
  public.normalize_text(text),
  public.normalize_profession_name(text),
  public.haversine_km(double precision, double precision, double precision, double precision),
  public.search_professionals(text, uuid[], uuid, integer, numeric, numeric, numeric, integer,
    boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, integer, integer),
  public.search_suggestions(text, integer),
  public.feed_posts(text, uuid, integer, integer),
  public.similar_professionals(uuid, integer),
  public.rating_breakdown(uuid),
  public.professional_readiness(uuid),
  public.check_booking_slot(uuid, timestamptz, integer, integer, uuid),
  public.available_slots(uuid, date, integer, integer, integer),
  public.preview_series_dates(date, smallint, time, public.recurrence_frequency, integer, date, integer),
  public.is_conversation_member(uuid, uuid),
  public.professional_is_public(uuid),
  public.owns_professional(uuid, uuid),
  public.can_view_post(uuid),
  public.can_view_address(uuid),
  public.is_booking_party(uuid),
  public.is_blocked_between(uuid, uuid),
  public.is_admin(uuid),
  public.display_name(uuid)
to anon, authenticated;

grant execute on function
  public.get_or_create_direct_conversation(uuid),
  public.record_profile_view(uuid),
  public.record_post_view(uuid),
  public.log_search(text, integer),
  public.generate_series_occurrences(uuid),
  public.materialize_series_bookings(uuid),
  public.admin_stats(),
  public.refresh_response_time(uuid)
to authenticated;

grant execute on all functions in schema public to service_role;


-- ==========================================================
-- 0012_reference_data.sql
-- ==========================================================

-- =====================================================================
-- 0012 – נתוני יסוד: ערים ומקצועות
-- =====================================================================
-- אלו אינם נתוני דמו אלא נתוני מערכת. המקצועות נטענים מהמסד בלבד
-- וניתן להרחיב אותם דרך בקשות של בעלי מקצוע ואישור מנהל.
-- =====================================================================

set search_path = public, extensions;

insert into public.cities (name, district, latitude, longitude, population) values
  ('תל אביב-יפו', 'תל אביב', 32.0853, 34.7818, 474530),
  ('ירושלים', 'ירושלים', 31.7683, 35.2137, 966210),
  ('חיפה', 'חיפה', 32.7940, 34.9896, 285316),
  ('ראשון לציון', 'מרכז', 31.9730, 34.7925, 254384),
  ('פתח תקווה', 'מרכז', 32.0840, 34.8878, 253171),
  ('אשדוד', 'דרום', 31.8014, 34.6435, 225939),
  ('נתניה', 'מרכז', 32.3215, 34.8532, 224814),
  ('באר שבע', 'דרום', 31.2530, 34.7915, 214162),
  ('בני ברק', 'תל אביב', 32.0807, 34.8338, 210000),
  ('חולון', 'תל אביב', 32.0117, 34.7725, 196282),
  ('רמת גן', 'תל אביב', 32.0684, 34.8248, 171000),
  ('רחובות', 'מרכז', 31.8928, 34.8113, 148800),
  ('אשקלון', 'דרום', 31.6688, 34.5742, 148100),
  ('בת ים', 'תל אביב', 32.0171, 34.7519, 129000),
  ('בית שמש', 'ירושלים', 31.7457, 34.9885, 146000),
  ('כפר סבא', 'מרכז', 32.1750, 34.9070, 111000),
  ('הרצליה', 'תל אביב', 32.1624, 34.8443, 99000),
  ('חדרה', 'חיפה', 32.4340, 34.9196, 100000),
  ('מודיעין-מכבים-רעות', 'מרכז', 31.8928, 35.0104, 96000),
  ('נצרת', 'צפון', 32.6996, 35.3035, 77500),
  ('לוד', 'מרכז', 31.9514, 34.8953, 81000),
  ('רעננה', 'מרכז', 32.1848, 34.8713, 79000),
  ('רמלה', 'מרכז', 31.9288, 34.8667, 78000),
  ('גבעתיים', 'תל אביב', 32.0723, 34.8100, 61000),
  ('הוד השרון', 'מרכז', 32.1500, 34.8886, 65000),
  ('קריית אתא', 'חיפה', 32.8064, 35.1128, 59000),
  ('קריית גת', 'דרום', 31.6100, 34.7642, 60000),
  ('נהריה', 'צפון', 33.0058, 35.0947, 58000),
  ('אילת', 'דרום', 29.5581, 34.9482, 52000),
  ('עפולה', 'צפון', 32.6078, 35.2897, 55000),
  ('נס ציונה', 'מרכז', 31.9293, 34.7986, 52000),
  ('עכו', 'צפון', 32.9281, 35.0818, 49000),
  ('אלעד', 'מרכז', 32.0525, 34.9511, 50000),
  ('רמת השרון', 'תל אביב', 32.1462, 34.8395, 46000),
  ('כרמיאל', 'צפון', 32.9192, 35.2951, 46000),
  ('טבריה', 'צפון', 32.7959, 35.5308, 45000),
  ('קריית ביאליק', 'חיפה', 32.8272, 35.0817, 41000),
  ('קריית מוצקין', 'חיפה', 32.8386, 35.0789, 42000),
  ('קריית ים', 'חיפה', 32.8478, 35.0678, 39000),
  ('קריית אונו', 'תל אביב', 32.0556, 34.8556, 40000),
  ('יבנה', 'מרכז', 31.8781, 34.7397, 51000),
  ('דימונה', 'דרום', 31.0700, 35.0333, 34000),
  ('נתיבות', 'דרום', 31.4222, 34.5931, 43000),
  ('שדרות', 'דרום', 31.5250, 34.5964, 28000),
  ('אור יהודה', 'תל אביב', 32.0292, 34.8536, 39000),
  ('יהוד-מונוסון', 'מרכז', 32.0333, 34.8917, 32000),
  ('טירת כרמל', 'חיפה', 32.7606, 34.9722, 25000),
  ('צפת', 'צפון', 32.9646, 35.4960, 37000),
  ('מעלה אדומים', 'ירושלים', 31.7717, 35.2983, 38000),
  ('אריאל', 'יהודה ושומרון', 32.1056, 35.1872, 20000),
  ('גבעת שמואל', 'מרכז', 32.0761, 34.8481, 30000),
  ('נשר', 'חיפה', 32.7686, 35.0431, 25000),
  ('זכרון יעקב', 'חיפה', 32.5717, 34.9531, 25000),
  ('בנימינה-גבעת עדה', 'חיפה', 32.5150, 34.9500, 18000),
  ('פרדס חנה-כרכור', 'חיפה', 32.4750, 34.9750, 44000),
  ('כפר יונה', 'מרכז', 32.3167, 34.9333, 26000),
  ('קדימה-צורן', 'מרכז', 32.2789, 34.9200, 22000),
  ('אבן יהודה', 'מרכז', 32.2711, 34.8869, 14000),
  ('שוהם', 'מרכז', 31.9989, 34.9469, 22000),
  ('רמת ישי', 'צפון', 32.7050, 35.1650, 8500),
  ('טירה', 'מרכז', 32.2333, 34.9500, 26000),
  ('טייבה', 'מרכז', 32.2667, 35.0083, 44000),
  ('קלנסווה', 'מרכז', 32.2833, 34.9833, 23000),
  ('באקה אל-גרביה', 'חיפה', 32.4167, 35.0333, 30000),
  ('אום אל-פחם', 'חיפה', 32.5194, 35.1522, 57000),
  ('סחנין', 'צפון', 32.8642, 35.2967, 32000),
  ('שפרעם', 'צפון', 32.8058, 35.1697, 42000),
  ('תמרה', 'צפון', 32.8536, 35.1978, 34000),
  ('מגאר', 'צפון', 32.8892, 35.4053, 22000),
  ('רהט', 'דרום', 31.3925, 34.7539, 76000),
  ('מעלות-תרשיחא', 'צפון', 33.0167, 35.2833, 22000),
  ('קריית שמונה', 'צפון', 33.2072, 35.5697, 23000),
  ('בית שאן', 'צפון', 32.4967, 35.4997, 18000),
  ('מגדל העמק', 'צפון', 32.6750, 35.2417, 26000),
  ('נוף הגליל', 'צפון', 32.7000, 35.3167, 42000),
  ('יקנעם עילית', 'צפון', 32.6600, 35.1100, 23000),
  ('אופקים', 'דרום', 31.3117, 34.6206, 32000),
  ('ערד', 'דרום', 31.2589, 35.2136, 26000),
  ('מצפה רמון', 'דרום', 30.6094, 34.8014, 5500),
  ('גדרה', 'מרכז', 31.8139, 34.7778, 30000),
  ('מזכרת בתיה', 'מרכז', 31.8517, 34.8394, 15000),
  ('קריית מלאכי', 'דרום', 31.7300, 34.7469, 27000),
  ('קריית עקרון', 'מרכז', 31.8697, 34.8194, 12000),
  ('בית דגן', 'מרכז', 32.0000, 34.8300, 7000),
  ('סביון', 'מרכז', 32.0464, 34.8797, 3500),
  ('כפר קאסם', 'מרכז', 32.1147, 34.9761, 25000),
  ('ג׳לג׳וליה', 'מרכז', 32.1533, 34.9539, 11000),
  ('אבו גוש', 'ירושלים', 31.8058, 35.1069, 7500),
  ('מבשרת ציון', 'ירושלים', 31.7986, 35.1508, 25000),
  ('אור עקיבא', 'חיפה', 32.5083, 34.9167, 20000),
  ('קיסריה', 'חיפה', 32.5000, 34.9000, 5500),
  ('עתלית', 'חיפה', 32.6889, 34.9403, 7500),
  ('יבנאל', 'צפון', 32.7069, 35.5031, 4500),
  ('להבים', 'דרום', 31.3733, 34.8153, 7000),
  ('מיתר', 'דרום', 31.3222, 34.9333, 8000),
  ('עומר', 'דרום', 31.2650, 34.8478, 8500)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- מקצועות ליבה
-- ---------------------------------------------------------------------
insert into public.professions (slug, name, description, icon, category, is_core, sort_order) values
  ('barber-hair', 'ספר או ספרית', 'תספורות, עיצוב וטיפוח שיער לנשים ולגברים', 'scissors', 'hair', true, 10),
  ('barber', 'ברבר', 'תספורות גברים, עיצוב זקן ותער', 'scissors', 'hair', true, 20),
  ('hair-stylist', 'מעצב או מעצבת שיער', 'צבע, החלקות, תסרוקות ועיצוב שיער מתקדם', 'sparkles', 'hair', true, 30),
  ('event-hair', 'מסרק או מסרקת לאירועים', 'תסרוקות ערב, כלות ואירועים', 'crown', 'hair', true, 40),
  ('manicurist', 'מניקוריסט או מניקוריסטית', 'מניקור, לק ג׳ל, בנייה ועיצוב ציפורניים', 'hand', 'nails', true, 50),
  ('pedicurist', 'פדיקוריסט או פדיקוריסטית', 'פדיקור רפואי וקוסמטי', 'footprints', 'nails', true, 60),
  ('makeup-artist', 'מאפר או מאפרת', 'איפור ערב, כלות, צילומים ואירועים', 'palette', 'makeup', true, 70),
  ('cosmetician', 'קוסמטיקאי או קוסמטיקאית', 'טיפולי פנים, פילינג והסרת שיער', 'flower', 'skin', true, 80),
  ('brow-artist', 'מעצב או מעצבת גבות', 'עיצוב, שיזוף וחיטוב גבות, למינציה', 'eye', 'brows', true, 90),
  ('lash-artist', 'מעצב או מעצבת ריסים', 'הרחבות ריסים, לאש ליפט ולמינציה', 'eye', 'lashes', true, 100),
  ('facial-therapist', 'מטפל או מטפלת פנים', 'טיפולי פנים מתקדמים, אנטי אייג׳ינג ומכשור', 'sun', 'skin', true, 110),
  ('other', 'מקצוע אחר', 'מקצוע שאינו מופיע ברשימה – יישלח לאישור מנהל', 'plus-circle', 'other', true, 999)
on conflict (slug) do nothing;


-- ==========================================================
-- 0013_storage_and_realtime.sql
-- ==========================================================

-- =====================================================================
-- 0013 – Supabase Storage ו־Realtime
-- =====================================================================
-- ההעלאות מתבצעות דרך שרת האפליקציה (‎/api/upload‎): שם הקובץ אקראי,
-- הסוג והגודל נבדקים, וההעלאה נעשית עם service_role. הדליים ציבוריים
-- לקריאה בלבד; כתיבה ומחיקה מוגבלות לבעלי התוכן.
-- =====================================================================

set search_path = public, extensions;

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'סכימת storage אינה קיימת (סביבה מקומית) – מדלגים על הגדרות Storage.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('avatars',      'avatars',      true,  5242880,
      array['image/jpeg','image/png','image/webp','image/avif']),
    ('covers',       'covers',       true,  8388608,
      array['image/jpeg','image/png','image/webp','image/avif']),
    ('posts',        'posts',        true,  26214400,
      array['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm','video/quicktime']),
    ('messages',     'messages',     true,  10485760,
      array['image/jpeg','image/png','image/webp','image/avif']),
    ('reviews',      'reviews',      true,  8388608,
      array['image/jpeg','image/png','image/webp','image/avif']),
    ('certificates', 'certificates', false, 10485760,
      array['image/jpeg','image/png','image/webp','application/pdf'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
end $$;

-- מדיניות Storage
do $$
declare b text;
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  -- קריאה ציבורית לדליים הציבוריים
  execute 'drop policy if exists "public_read_media" on storage.objects';
  execute $p$
    create policy "public_read_media" on storage.objects
      for select to anon, authenticated
      using (bucket_id in ('avatars', 'covers', 'posts', 'messages', 'reviews'))
  $p$;

  -- תעודות מקצועיות – רק הבעלים והמנהל
  execute 'drop policy if exists "certificates_owner_read" on storage.objects';
  execute $p$
    create policy "certificates_owner_read" on storage.objects
      for select to authenticated
      using (
        bucket_id = 'certificates'
        and (
          (storage.foldername(name))[1] = public.current_profile_id()::text
          or public.is_admin()
        )
      )
  $p$;

  -- כתיבה: רק לתיקייה האישית (‎<profile_id>/…‎)
  foreach b in array array['avatars', 'covers', 'posts', 'messages', 'reviews', 'certificates'] loop
    execute format('drop policy if exists %I on storage.objects', b || '_owner_write');
    execute format($p$
      create policy %I on storage.objects
        for insert to authenticated
        with check (
          bucket_id = %L
          and (storage.foldername(name))[1] = public.current_profile_id()::text
        )
    $p$, b || '_owner_write', b);

    execute format('drop policy if exists %I on storage.objects', b || '_owner_delete');
    execute format($p$
      create policy %I on storage.objects
        for delete to authenticated
        using (
          bucket_id = %L
          and ((storage.foldername(name))[1] = public.current_profile_id()::text or public.is_admin())
        )
    $p$, b || '_owner_delete', b);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Realtime – פרסום טבלאות לעדכונים בזמן אמת
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'messages', 'conversations', 'conversation_members', 'notifications',
    'bookings', 'booking_status_history', 'recurring_booking_series',
    'recurring_booking_occurrences', 'post_likes', 'post_comments',
    'professional_posts', 'professional_profiles', 'follows', 'reviews',
    'review_replies', 'professional_availability', 'professional_services'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array tables loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
      when others then raise notice 'לא ניתן להוסיף % ל־publication: %', t, sqlerrm;
    end;
  end loop;
end $$;

-- REPLICA IDENTITY FULL נדרש כדי לקבל את השורה הישנה באירועי UPDATE/DELETE.
do $$
declare
  t text;
  tables text[] := array['messages', 'notifications', 'bookings', 'post_likes', 'follows'];
begin
  foreach t in array tables loop
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;


-- ==========================================================
-- 0014_client_auth.sql
-- ==========================================================

-- ==========================================================
--  אימות בצד המסד
--
--  לקוח שרץ רק בדפדפן (כמו ‎index.html‎) אינו יכול לגזור סיסמאות
--  ואינו יכול לחתום אסימוני JWT — חתימה בדפדפן הייתה מחייבת להטמיע
--  את המפתח הסודי בקוד הלקוח, וזה אסור.
--
--  לכן כל האימות עובר לכאן: הסיסמה מגיעה פעם אחת דרך TLS אל פונקציה
--  ‎SECURITY DEFINER‎, נבדקת מול bcrypt בתוך המסד, והלקוח מקבל בחזרה
--  אסימון חתום בלבד. המפתח הסודי אף פעם לא עוזב את מסד הנתונים.
--
--  אותן פונקציות משמשות גם את אפליקציית Next.js, כך שלשני היישומים
--  יש בדיוק אותן סיסמאות ואותם משתמשים.
-- ==========================================================

set search_path = public, extensions;

-- ----------------------------------------------------------
-- מפתחות סודיים
-- ----------------------------------------------------------

create table if not exists public.app_secrets (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

comment on table public.app_secrets is
  'סודות שרת. אין לתת עליה שום הרשאה ל־anon או ל־authenticated.';

alter table public.app_secrets enable row level security;

-- ללא policy כלשהי – רק service_role ופונקציות SECURITY DEFINER מגיעות לכאן.
revoke all on public.app_secrets from public;

/** קובע סוד. נקרא פעם אחת בהתקנה, עם service_role. */
create or replace function public.set_app_secret(p_key text, p_value text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  insert into public.app_secrets (key, value)
  values (p_key, p_value)
  on conflict (key) do update set value = excluded.value, updated_at = now();
$$;

revoke all on function public.set_app_secret(text, text) from public, anon, authenticated;

-- ----------------------------------------------------------
-- חתימת JWT
-- ----------------------------------------------------------

/** base64url – כמו base64 אך בלי ריפוד ובלי תווים בעייתיים ב־URL. */
create or replace function public.b64url(p_data bytea)
returns text
language sql
immutable
as $$
  select translate(encode(p_data, 'base64'), E'+/=\n', '-_');
$$;

/**
 * חותם אסימון גישה בפורמט שבו Supabase משתמש (HS256).
 * ה־sub הוא מזהה הפרופיל, ולכן ‎current_profile_id()‎ ומדיניות ה־RLS
 * עובדות בדיוק כמו באפליקציית השרת.
 */
create or replace function public.sign_jwt(p_profile_id uuid, p_ttl_seconds integer default 60 * 60 * 24 * 30)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret  text;
  v_header  text;
  v_payload text;
  v_body    text;
begin
  select value into v_secret from public.app_secrets where key = 'jwt_secret';
  if v_secret is null then
    raise exception 'לא הוגדר מפתח חתימה. יש להריץ: select set_app_secret(''jwt_secret'', ''<SUPABASE_JWT_SECRET>'');';
  end if;

  v_header := public.b64url(convert_to('{"alg":"HS256","typ":"JWT"}', 'utf8'));

  v_payload := public.b64url(convert_to(
    jsonb_build_object(
      'sub', p_profile_id::text,
      'role', 'authenticated',
      'iat', floor(extract(epoch from now()))::bigint,
      'exp', floor(extract(epoch from now()))::bigint + p_ttl_seconds
    )::text, 'utf8'));

  v_body := v_header || '.' || v_payload;

  return v_body || '.' || public.b64url(extensions.hmac(v_body, v_secret, 'sha256'));
end;
$$;

revoke all on function public.sign_jwt(uuid, integer) from public, anon, authenticated;

-- ----------------------------------------------------------
-- סיסמאות
-- ----------------------------------------------------------

/** יוצר hash של סיסמה (bcrypt, עלות 10). המלח נוצר אקראית לכל סיסמה. */
create or replace function public.hash_password(p_password text)
returns text
language sql
security definer
set search_path = public, extensions
as $$
  select extensions.crypt(normalize(p_password, NFKC), extensions.gen_salt('bf', 10));
$$;

/**
 * משווה סיסמה מול hash שמור.
 * ‎crypt()‎ מחלץ את המלח מתוך ה־hash ומשווה בזמן קבוע.
 */
create or replace function public.verify_password(p_password text, p_stored text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select p_stored is not null
     and p_stored like '$2%'
     and p_stored = extensions.crypt(normalize(p_password, NFKC), p_stored);
$$;

revoke all on function public.hash_password(text) from public, anon, authenticated;
revoke all on function public.verify_password(text, text) from public, anon, authenticated;

/** קוד שחזור אקראי בפורמט YOFI-XXXX-XXXX-XXXX. */
create or replace function public.generate_recovery_code()
returns text
language plpgsql
as $$
declare
  -- ללא 0/O/1/I כדי שלא יהיו טעויות בהעתקה ידנית.
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_out text := 'YOFI';
  i integer;
begin
  for i in 1..12 loop
    if i % 4 = 1 then
      v_out := v_out || '-';
    end if;
    v_out := v_out || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
  end loop;
  return v_out;
end;
$$;

/** מנפיק קוד שחזור חדש ומבטל את הקודמים. הקוד מוחזר פעם אחת בלבד. */
create or replace function public.issue_recovery_code(p_profile_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
begin
  v_code := public.generate_recovery_code();

  update public.recovery_codes
     set revoked_at = now()
   where profile_id = p_profile_id and used_at is null and revoked_at is null;

  insert into public.recovery_codes (profile_id, code_hash, hint)
  values (p_profile_id, public.hash_password(v_code), right(v_code, 4));

  return v_code;
end;
$$;

revoke all on function public.issue_recovery_code(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------
-- בדיקות עזר
-- ----------------------------------------------------------

/** בודק אם שם משתמש פנוי. */
create or replace function public.username_available(p_username text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select not exists (select 1 from public.usernames u where u.username = p_username::citext);
$$;

/** מחזיר את הפרופיל הציבורי של המשתמש המחובר. */
create or replace function public.auth_me()
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  select to_jsonb(x) from (
    select p.id, p.username::text as username, p.full_name, p.avatar_url, p.bio,
           p.city_id, c.name as city_name, p.role::text as role, p.status::text as status,
           p.active_mode::text as active_mode, p.is_professional,
           p.followers_count, p.following_count,
           (select pp.id from public.professional_profiles pp where pp.profile_id = p.id) as professional_id
      from public.profiles p
      left join public.cities c on c.id = p.city_id
     where p.id = public.current_profile_id() and p.deleted_at is null
  ) x;
$$;

-- ----------------------------------------------------------
-- הרשמה, התחברות ושחזור
-- ----------------------------------------------------------

/**
 * הרשמה ללא אימייל.
 * מחזירה אסימון גישה, את הפרופיל, ואת קוד השחזור – שמוצג פעם אחת בלבד.
 */
-- ברירות המחדל חייבות להיות זהות לאלה שב־0015. ‎create or replace‎ אינו
-- יכול להסיר ברירת מחדל קיימת, ובלי ההתאמה הרצה חוזרת של ההתקנה נכשלת.
create or replace function public.auth_register(
  p_full_name  text,
  p_username   text,
  p_city_id    uuid default null,
  p_password   text default null,
  p_avatar_url text default null,
  p_birth_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id   uuid;
  v_code text;
begin
  if not public.consume_rate_limit('register', 'global', 40, 3600) then
    raise exception 'בוצעו יותר מדי הרשמות. נסו שוב בעוד שעה.';
  end if;

  p_full_name := btrim(coalesce(p_full_name, ''));
  p_username  := btrim(coalesce(p_username, ''));

  if length(p_full_name) < 2 then
    raise exception 'יש להזין שם מלא';
  end if;
  if p_username !~ '^[A-Za-zא-ת0-9_.]{3,30}$' then
    raise exception 'שם המשתמש חייב להכיל 3–30 תווים (אותיות, ספרות, קו תחתון או נקודה)';
  end if;
  if not public.username_available(p_username) then
    raise exception 'שם המשתמש כבר תפוס';
  end if;
  if not exists (select 1 from public.cities where id = p_city_id) then
    raise exception 'יש לבחור עיר מהרשימה';
  end if;
  if length(coalesce(p_password, '')) < 8
     or p_password !~ '[A-Za-zא-ת]'
     or p_password !~ '[0-9]' then
    raise exception 'הסיסמה חייבת לכלול לפחות שמונה תווים, אות אחת וספרה אחת';
  end if;

  insert into public.profiles (username, full_name, city_id, password_hash, avatar_url, birth_date)
  values (p_username::citext, p_full_name, p_city_id, public.hash_password(p_password),
          nullif(p_avatar_url, ''), p_birth_date)
  returning id into v_id;

  v_code := public.issue_recovery_code(v_id);

  insert into public.login_attempts (username, success, reason) values (p_username::citext, true, 'register');
  insert into public.security_events (profile_id, event, details)
  values (v_id, 'account_created', jsonb_build_object('username', p_username));

  return jsonb_build_object(
    'token', public.sign_jwt(v_id),
    'recovery_code', v_code,
    'profile', (select to_jsonb(x) from (
        select p.id, p.username::text as username, p.full_name, p.avatar_url,
               p.city_id, p.role::text as role, p.is_professional,
               p.active_mode::text as active_mode
          from public.profiles p where p.id = v_id) x)
  );
end;
$$;

/**
 * התחברות עם שם משתמש וסיסמה.
 * כוללת הגבלת קצב ונעילה זמנית אחרי חמישה ניסיונות כושלים.
 */
create or replace function public.auth_login(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_p        public.profiles%rowtype;
  v_failures integer;
  v_minutes  integer;
begin
  if not public.consume_rate_limit('login', coalesce(lower(p_username), 'anon'), 15, 900) then
    raise exception 'בוצעו יותר מדי ניסיונות התחברות. נסו שוב בעוד רבע שעה.';
  end if;

  select * into v_p from public.profiles
   where username = p_username::citext and deleted_at is null;

  if not found then
    insert into public.login_attempts (username, success, reason)
    values (p_username::citext, false, 'unknown_user');
    raise exception 'שם המשתמש או הסיסמה שגויים';
  end if;

  if v_p.locked_until is not null and v_p.locked_until > now() then
    v_minutes := greatest(1, ceil(extract(epoch from v_p.locked_until - now()) / 60)::int);
    raise exception 'החשבון נעול זמנית. אפשר לנסות שוב בעוד % דקות.', v_minutes;
  end if;

  if v_p.status = 'banned' then
    raise exception 'החשבון חסום. לפרטים נוספים אפשר לפנות לתמיכה.';
  end if;
  if v_p.status = 'suspended' then
    raise exception 'החשבון מושעה זמנית.';
  end if;

  if not public.verify_password(p_password, v_p.password_hash) then
    v_failures := v_p.failed_login_count + 1;

    update public.profiles
       set failed_login_count = v_failures,
           locked_until = case when v_failures >= 5 then now() + interval '15 minutes' end
     where id = v_p.id;

    insert into public.login_attempts (username, success, reason)
    values (p_username::citext, false, 'bad_password');

    if v_failures >= 5 then
      insert into public.security_events (profile_id, event, details)
      values (v_p.id, 'account_locked', jsonb_build_object('failures', v_failures));
      raise exception 'החשבון ננעל למשך 15 דקות בעקבות ניסיונות כושלים.';
    end if;

    raise exception 'שם המשתמש או הסיסמה שגויים. נותרו % ניסיונות לפני נעילה זמנית.', 5 - v_failures;
  end if;

  update public.profiles
     set failed_login_count = 0, locked_until = null, last_seen_at = now()
   where id = v_p.id;

  insert into public.login_attempts (username, success) values (p_username::citext, true);
  insert into public.security_events (profile_id, event) values (v_p.id, 'login');

  return jsonb_build_object(
    'token', public.sign_jwt(v_p.id),
    'profile', (select to_jsonb(x) from (
        select p.id, p.username::text as username, p.full_name, p.avatar_url,
               p.city_id, p.role::text as role, p.is_professional,
               p.active_mode::text as active_mode
          from public.profiles p where p.id = v_p.id) x)
  );
end;
$$;

/** איפוס סיסמה באמצעות שם משתמש וקוד שחזור. מנפיק קוד חדש. */
create or replace function public.auth_reset_password(p_username text, p_code text, p_new_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id      uuid;
  v_row     public.recovery_codes%rowtype;
  v_matched boolean := false;
  v_code    text;
begin
  if not public.consume_rate_limit('recover', coalesce(lower(p_username), 'anon'), 10, 3600) then
    raise exception 'בוצעו יותר מדי ניסיונות שחזור. נסו שוב בעוד שעה.';
  end if;

  if length(coalesce(p_new_password, '')) < 8
     or p_new_password !~ '[A-Za-zא-ת]'
     or p_new_password !~ '[0-9]' then
    raise exception 'הסיסמה חייבת לכלול לפחות שמונה תווים, אות אחת וספרה אחת';
  end if;

  select id into v_id from public.profiles
   where username = p_username::citext and deleted_at is null;

  if v_id is null then
    raise exception 'שם המשתמש או קוד השחזור שגויים';
  end if;

  -- הקוד מנורמל: אותיות גדולות, בלי רווחים, עם מקפים אחידים.
  p_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));

  for v_row in
    select * from public.recovery_codes
     where profile_id = v_id and used_at is null and revoked_at is null
  loop
    if public.verify_password(p_code, v_row.code_hash) then
      v_matched := true;
      update public.recovery_codes set used_at = now() where id = v_row.id;
      exit;
    end if;
  end loop;

  if not v_matched then
    raise exception 'שם המשתמש או קוד השחזור שגויים';
  end if;

  update public.profiles
     set password_hash = public.hash_password(p_new_password),
         password_updated_at = now(),
         failed_login_count = 0,
         locked_until = null
   where id = v_id;

  insert into public.security_events (profile_id, event) values (v_id, 'password_reset');
  v_code := public.issue_recovery_code(v_id);

  return jsonb_build_object('token', public.sign_jwt(v_id), 'recovery_code', v_code);
end;
$$;

/** שינוי סיסמה על ידי משתמש מחובר. */
create or replace function public.auth_change_password(p_current text, p_new text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id   uuid := public.current_profile_id();
  v_hash text;
begin
  if v_id is null then
    raise exception 'יש להתחבר תחילה';
  end if;
  if length(coalesce(p_new, '')) < 8 or p_new !~ '[A-Za-zא-ת]' or p_new !~ '[0-9]' then
    raise exception 'הסיסמה חייבת לכלול לפחות שמונה תווים, אות אחת וספרה אחת';
  end if;

  select password_hash into v_hash from public.profiles where id = v_id;

  if not public.verify_password(p_current, v_hash) then
    raise exception 'הסיסמה הנוכחית שגויה';
  end if;

  update public.profiles
     set password_hash = public.hash_password(p_new), password_updated_at = now()
   where id = v_id;

  insert into public.security_events (profile_id, event) values (v_id, 'password_changed');

  return jsonb_build_object('ok', true);
end;
$$;

/** מנפיק קוד שחזור חדש למשתמש המחובר ומבטל את הקודם. */
create or replace function public.auth_rotate_recovery_code()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid := public.current_profile_id();
begin
  if v_id is null then
    raise exception 'יש להתחבר תחילה';
  end if;

  insert into public.security_events (profile_id, event) values (v_id, 'recovery_code_rotated');
  return jsonb_build_object('recovery_code', public.issue_recovery_code(v_id));
end;
$$;

-- ----------------------------------------------------------
-- אישור מקצוע חדש
--
-- הפעולה נוגעת בכמה טבלאות ולכן היא עטופה בפונקציה אחת שבודקת
-- הרשאת מנהל בעצמה. כך גם לקוח הדפדפן יכול לבצע אותה, בלי לפתוח
-- הרשאות כתיבה רחבות על טבלת המקצועות.
-- ----------------------------------------------------------

create or replace function public.approve_profession_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_req        public.profession_requests%rowtype;
  v_profession uuid;
  v_name       text;
  v_slug       text;
  v_pro        uuid;
begin
  if not public.is_admin() then
    raise exception 'רק מנהל יכול לאשר מקצועות';
  end if;

  select * into v_req from public.profession_requests where id = p_request_id;
  if not found then raise exception 'הבקשה לא נמצאה'; end if;
  if v_req.status <> 'pending' then raise exception 'הבקשה כבר טופלה'; end if;

  v_name := btrim(v_req.raw_name);

  -- מניעת כפילויות: אם כבר קיים מקצוע עם שם מנורמל זהה, מאחדים אליו.
  select id into v_profession from public.professions
   where name_norm = public.normalize_profession_name(v_name);

  if v_profession is null then
    v_slug := regexp_replace(lower(v_name), '[^a-zא-ת0-9]+', '-', 'g');

    insert into public.professions (slug, name, category, is_active, created_by, approved_by)
    values (v_slug, v_name, 'beauty', true, v_req.requested_by, public.current_profile_id())
    returning id into v_profession;
  end if;

  update public.profession_requests
     set status = 'approved'::request_status,
         created_profession_id = v_profession,
         reviewed_by = public.current_profile_id(),
         reviewed_at = now()
   where id = p_request_id;

  -- שיוך אוטומטי של המבקש לקטגוריה החדשה
  select id into v_pro from public.professional_profiles where profile_id = v_req.requested_by;
  if v_pro is not null then
    insert into public.professional_professions (professional_id, profession_id)
    values (v_pro, v_profession)
    on conflict do nothing;
  end if;

  perform public.create_notification(
    v_req.requested_by, 'profession_approved',
    format('המקצוע "%s" אושר והתווסף לרשימה', v_name),
    null, public.current_profile_id(), 'profession', v_profession, '/dashboard/pro/profile');

  return jsonb_build_object('profession_id', v_profession, 'name', v_name);
end;
$$;

-- ----------------------------------------------------------
-- הרשאות
--
-- רק הפונקציות הציבוריות נגישות. הפונקציות שנוגעות במפתח הסודי
-- (sign_jwt, hash_password, set_app_secret) נשארות סגורות.
-- ----------------------------------------------------------

grant execute on function public.approve_profession_request(uuid) to authenticated;

grant execute on function public.auth_register(text, text, uuid, text, text, date) to anon, authenticated;
grant execute on function public.auth_login(text, text)                            to anon, authenticated;
grant execute on function public.auth_reset_password(text, text, text)             to anon, authenticated;
grant execute on function public.username_available(text)                          to anon, authenticated;
grant execute on function public.auth_change_password(text, text)                  to authenticated;
grant execute on function public.auth_rotate_recovery_code()                       to authenticated;
grant execute on function public.auth_me()                                         to authenticated;

-- אפליקציית השרת (Next.js) משתמשת באותן פונקציות גיבוב, כדי ששני היישומים
-- ישמרו סיסמאות באותו פורמט בדיוק. service_role הוא שרת בלבד.
grant execute on function public.hash_password(text)          to service_role;
grant execute on function public.verify_password(text, text)  to service_role;
grant execute on function public.issue_recovery_code(uuid)    to service_role;
grant execute on function public.sign_jwt(uuid, integer)      to service_role;


-- ==========================================================
-- 0015_minimal_signup.sql
-- ==========================================================

-- ==========================================================
--  הרשמה מינימלית
--
--  ההרשמה מבקשת עכשיו רק את מה שבאמת הכרחי: שם, שם משתמש וסיסמה
--  שהמשתמש ממציא. העיר עברה להגדרות הפרופיל, וההפיכה לבעל עסק
--  נעשית מאוחר יותר מתוך ההגדרות ולא בסיום ההרשמה.
--
--  ‎profiles.city_id‎ כבר מוגדר כ־nullable, ולכן אין שינוי סכמה —
--  רק הפונקציה מפסיקה לדרוש עיר.
-- ==========================================================

set search_path = public, extensions;

create or replace function public.auth_register(
  p_full_name  text,
  p_username   text,
  p_city_id    uuid default null,
  p_password   text default null,
  p_avatar_url text default null,
  p_birth_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id   uuid;
  v_code text;
begin
  if not public.consume_rate_limit('register', 'global', 40, 3600) then
    raise exception 'בוצעו יותר מדי הרשמות. נסו שוב בעוד שעה.';
  end if;

  p_full_name := btrim(coalesce(p_full_name, ''));
  p_username  := btrim(coalesce(p_username, ''));

  if length(p_full_name) < 2 then
    raise exception 'יש להזין שם';
  end if;

  if p_username !~ '^[A-Za-zא-ת0-9_.]{3,30}$' then
    raise exception 'שם המשתמש חייב להכיל 3–30 תווים (אותיות, ספרות, קו תחתון או נקודה)';
  end if;

  if not public.username_available(p_username) then
    raise exception 'שם המשתמש כבר תפוס';
  end if;

  -- העיר אינה חובה בהרשמה. אם נשלחה — היא חייבת להיות אמיתית.
  if p_city_id is not null and not exists (select 1 from public.cities where id = p_city_id) then
    raise exception 'יש לבחור עיר מהרשימה';
  end if;

  if length(coalesce(p_password, '')) < 8
     or p_password !~ '[A-Za-zא-ת]'
     or p_password !~ '[0-9]' then
    raise exception 'הסיסמה חייבת לכלול לפחות שמונה תווים, אות אחת וספרה אחת';
  end if;

  insert into public.profiles (username, full_name, city_id, password_hash, avatar_url, birth_date)
  values (p_username::citext, p_full_name, p_city_id, public.hash_password(p_password),
          nullif(p_avatar_url, ''), p_birth_date)
  returning id into v_id;

  v_code := public.issue_recovery_code(v_id);

  insert into public.login_attempts (username, success, reason) values (p_username::citext, true, 'register');
  insert into public.security_events (profile_id, event, details)
  values (v_id, 'account_created', jsonb_build_object('username', p_username));

  return jsonb_build_object(
    'token', public.sign_jwt(v_id),
    'recovery_code', v_code,
    'profile', (select to_jsonb(x) from (
        select p.id, p.username::text as username, p.full_name, p.avatar_url,
               p.city_id, p.role::text as role, p.is_professional,
               p.active_mode::text as active_mode
          from public.profiles p where p.id = v_id) x)
  );
end;
$$;

grant execute on function public.auth_register(text, text, uuid, text, text, date) to anon, authenticated;


-- ==========================================================
-- נתוני הדגמה בעברית
-- ==========================================================

-- =====================================================================
-- נתוני דוגמה בעברית
-- =====================================================================
-- נועדו אך ורק לתצוגה ראשונית וללימוד המערכת.
-- לאחר ההשקה כל התוכן מגיע מהמשתמשים האמיתיים דרך האפליקציה.
--
-- הסיסמה של כל משתמשי הדוגמה: Demo1234
-- ה־hash נכתב על ידי ‎scripts/db-seed.mjs‎ (אותו אלגוריתם scrypt של האפליקציה).
-- הרצה: npm run db:seed
-- =====================================================================

set search_path = public, extensions;

-- ניקוי נתוני דוגמה קודמים (מזוהים לפי שמות המשתמש)
do $$
declare v_ids uuid[];
begin
  select array_agg(id) into v_ids from public.profiles
  where username in (
    'shirley_hair','dana_makeup','yossi_barber','noa_nails','rami_barber','tal_brows',
    'michal_lashes','avi_hair','liat_cosmetics','maya_events','eden_pedi','oren_beard',
    'sivan_facial','ronit_bride','gal_color','yael_client','amir_client','hila_client',
    'moshe_client','shira_client','admin_yofi'
  );

  if v_ids is not null then
    delete from public.profiles where id = any(v_ids);
  end if;

  -- מחיקת פרופיל מוחקת גם את חברותו בשיחות (cascade), אך השיחה עצמה נשארת.
  -- ניקוי השיחות היתומות מבטיח שהרצה חוזרת של הזריעה תיצור אותן מחדש כראוי.
  delete from public.conversations c
  where not exists (
    select 1 from public.conversation_members cm where cm.conversation_id = c.id
  );
end $$;

-- ---------------------------------------------------------------------
-- משתמשים
-- ---------------------------------------------------------------------
-- SEED_PLACEHOLDER מוחלף ב־hash אמיתי על ידי סקריפט הזריעה.

insert into public.profiles (id, username, full_name, password_hash, city_id, avatar_url, bio, role)
select
  d.id, d.username, d.full_name, 'SEED_PLACEHOLDER',
  (select id from public.cities where name = d.city),
  d.avatar, d.bio, d.role::public.account_role
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'admin_yofi', 'צוות יופי', 'תל אביב-יפו',
   'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&q=80', 'ניהול הקהילה', 'admin'),

  ('a0000000-0000-4000-8000-000000000002'::uuid, 'shirley_hair', 'שירלי אזולאי', 'חדרה',
   'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&q=80',
   'ספרית ומעצבת שיער, מגיעה עד הבית', 'user'),

  ('a0000000-0000-4000-8000-000000000003'::uuid, 'dana_makeup', 'דנה כהן', 'תל אביב-יפו',
   'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=200&q=80',
   'מאפרת כלות ואירועים', 'user'),

  ('a0000000-0000-4000-8000-000000000004'::uuid, 'yossi_barber', 'יוסי מזרחי', 'ראשון לציון',
   'https://images.unsplash.com/photo-1503443207922-dff7d543fd0e?w=200&q=80',
   'ברבר, עיצוב זקן ותער', 'user'),

  ('a0000000-0000-4000-8000-000000000005'::uuid, 'noa_nails', 'נועה לוי', 'נתניה',
   'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&q=80',
   'מניקוריסטית, בנייה ולק ג׳ל', 'user'),

  ('a0000000-0000-4000-8000-000000000006'::uuid, 'rami_barber', 'רמי חדד', 'חיפה',
   'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=80',
   'ברבר שכונתי עם 15 שנות ניסיון', 'user'),

  ('a0000000-0000-4000-8000-000000000007'::uuid, 'tal_brows', 'טל שרון', 'כפר סבא',
   'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?w=200&q=80',
   'מעצבת גבות ולמינציה', 'user'),

  ('a0000000-0000-4000-8000-000000000008'::uuid, 'michal_lashes', 'מיכל ברוך', 'פתח תקווה',
   'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=200&q=80',
   'הרחבות ריסים ולאש ליפט', 'user'),

  ('a0000000-0000-4000-8000-000000000009'::uuid, 'avi_hair', 'אבי פרץ', 'ירושלים',
   'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200&q=80',
   'מעצב שיער גברים ונשים', 'user'),

  ('a0000000-0000-4000-8000-00000000000a'::uuid, 'liat_cosmetics', 'ליאת אברהם', 'רחובות',
   'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80',
   'קוסמטיקאית מוסמכת, טיפולי פנים', 'user'),

  ('a0000000-0000-4000-8000-00000000000b'::uuid, 'maya_events', 'מאיה גולן', 'הרצליה',
   'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=200&q=80',
   'מסרקת ומאפרת לאירועים', 'user'),

  ('a0000000-0000-4000-8000-00000000000c'::uuid, 'eden_pedi', 'עדן מלכה', 'אשדוד',
   'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&q=80',
   'פדיקוריסטית רפואית', 'user'),

  ('a0000000-0000-4000-8000-00000000000d'::uuid, 'oren_beard', 'אורן ביטון', 'באר שבע',
   'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&q=80',
   'ברבר ומעצב זקן', 'user'),

  ('a0000000-0000-4000-8000-00000000000e'::uuid, 'sivan_facial', 'סיון דוד', 'רמת גן',
   'https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=200&q=80',
   'מטפלת פנים, מכשור מתקדם', 'user'),

  ('a0000000-0000-4000-8000-00000000000f'::uuid, 'ronit_bride', 'רונית שמש', 'מודיעין-מכבים-רעות',
   'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200&q=80',
   'מאפרת כלות', 'user'),

  ('a0000000-0000-4000-8000-000000000010'::uuid, 'gal_color', 'גל אוחיון', 'בת ים',
   'https://images.unsplash.com/photo-1521119989659-a83eee488004?w=200&q=80',
   'קולוריסט – בלונדים והחלקות', 'user'),

  -- לקוחות
  ('a0000000-0000-4000-8000-000000000011'::uuid, 'yael_client', 'יעל בן דוד', 'חדרה',
   'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&q=80', null, 'user'),
  ('a0000000-0000-4000-8000-000000000012'::uuid, 'amir_client', 'אמיר נחום', 'ראשון לציון',
   'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80', null, 'user'),
  ('a0000000-0000-4000-8000-000000000013'::uuid, 'hila_client', 'הילה כץ', 'תל אביב-יפו',
   'https://images.unsplash.com/photo-1554151228-14d9def656e4?w=200&q=80', null, 'user'),
  ('a0000000-0000-4000-8000-000000000014'::uuid, 'moshe_client', 'משה אדרי', 'חיפה',
   'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=200&q=80', null, 'user'),
  ('a0000000-0000-4000-8000-000000000015'::uuid, 'shira_client', 'שירה קדוש', 'נתניה',
   'https://images.unsplash.com/photo-1541823709867-1b206113eafd?w=200&q=80', null, 'user')
) as d(id, username, full_name, city, avatar, bio, role);

-- ---------------------------------------------------------------------
-- פרופילים מקצועיים
-- ---------------------------------------------------------------------
insert into public.professional_profiles (
  id, profile_id, business_name, headline, bio, years_experience, city_id,
  avatar_url, cover_url, status, is_verified, phone_verified,
  accepts_home_visits, accepts_studio, accepts_events, accepts_online,
  max_travel_km, travel_fee_type, travel_fee, min_lead_time_minutes, max_lead_time_days,
  cancellation_policy, available_today
)
select
  p.pro_id, pr.id, p.business_name, p.headline, p.bio, p.years, pr.city_id,
  pr.avatar_url, p.cover, 'draft', p.verified, true,
  p.home, p.studio, p.events, false,
  p.travel_km, p.fee_type::public.travel_fee_type, p.fee, 120, 90,
  'ביטול עד 24 שעות לפני המועד ללא עלות. ביטול מאוחר יותר עשוי לחייב בדמי ביטול.',
  p.today
from (values
  ('b0000000-0000-4000-8000-000000000002'::uuid, 'shirley_hair', 'שירלי עיצוב שיער',
   'ספרית ומעצבת שיער – מגיעה עד הבית באזור חדרה והשרון',
   'שלום! אני שירלי, ספרית כבר 12 שנה. אני מתמחה בתספורות נשים, פן, צבע והחלקות. אני מגיעה עם כל הציוד עד אליכם הביתה, כדי שתוכלו ליהנות מטיפול מקצועי בלי לצאת מהבית. עובדת עם מוצרים איכותיים בלבד.',
   12, 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1200&q=80', true, true, true, true, false, 40, 'fixed', 20, true),

  ('b0000000-0000-4000-8000-000000000003'::uuid, 'dana_makeup', 'דנה כהן איפור',
   'מאפרת כלות ואירועים · תל אביב והמרכז',
   'איפור זה לא רק צבעים – זה להרגיש הכי יפה שיש. אני מאפרת כלות, ערב וצילומים כבר 8 שנים. מגיעה עד אליכן, כולל לאולם ולסטודיו לצילום.',
   8, 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=1200&q=80', true, true, false, true, false, 60, 'per_km', 2, true),

  ('b0000000-0000-4000-8000-000000000004'::uuid, 'yossi_barber', 'יוסי ברבר שופ',
   'ברבר · תספורות גברים, עיצוב זקן ותער חם',
   'ברבר שופ קלאסי בראשון לציון. תספורת, זקן, תער חם וטיפוח. אפשר גם שאגיע עד הבית לתספורת מהירה.',
   6, 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1200&q=80', false, true, true, false, false, 25, 'fixed', 30, true),

  ('b0000000-0000-4000-8000-000000000005'::uuid, 'noa_nails', 'נועה ניילס',
   'מניקוריסטית · בנייה, לק ג׳ל ועיצובים',
   'בונה ציפורניים ומעצבת כבר 5 שנים. עובדת בסטודיו ביתי נעים בנתניה, וגם מגיעה לבתים ולאירועים.',
   5, 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=1200&q=80', true, true, true, true, false, 30, 'fixed', 25, true),

  ('b0000000-0000-4000-8000-000000000006'::uuid, 'rami_barber', 'רמי ברבר',
   'ברבר ותיק בחיפה · 15 שנות ניסיון',
   'תספורות גברים וילדים, עיצוב זקן, גילוח בתער. מקבל בסטודיו וגם מגיע לבתי לקוחות מבוגרים.',
   15, 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=1200&q=80', false, true, true, false, false, 20, 'fixed', 25, false),

  ('b0000000-0000-4000-8000-000000000007'::uuid, 'tal_brows', 'טל עיצוב גבות',
   'מעצבת גבות · שיזוף, למינציה וחיטוב',
   'הגבות הן המסגרת של הפנים. אני עובדת בשיטת חוט ובשעווה, כולל למינציה וצביעה. מגיעה עד הבית בכפר סבא והסביבה.',
   4, 'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=1200&q=80', false, true, true, false, false, 25, 'none', 0, true),

  ('b0000000-0000-4000-8000-000000000008'::uuid, 'michal_lashes', 'מיכל ריסים',
   'מעצבת ריסים · הרחבות, לאש ליפט ולמינציה',
   'מומחית להרחבות ריסים בשיטת קלאסי, וולום ומגה וולום. עובדת בסטודיו מעוצב בפתח תקווה.',
   7, 'https://images.unsplash.com/photo-1595475207225-428b62bda831?w=1200&q=80', true, false, true, false, false, null, 'none', 0, false),

  ('b0000000-0000-4000-8000-000000000009'::uuid, 'avi_hair', 'אבי סטייל',
   'מעצב שיער · נשים וגברים בירושלים',
   'עיצוב שיער לכל המשפחה. תספורות, צבע, פן ותסרוקות ערב. מקבל בסטודיו במרכז העיר.',
   10, 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=1200&q=80', false, true, true, true, false, 30, 'fixed', 25, true),

  ('b0000000-0000-4000-8000-00000000000a'::uuid, 'liat_cosmetics', 'ליאת קוסמטיקס',
   'קוסמטיקאית מוסמכת · טיפולי פנים והסרת שיער',
   'טיפולי פנים מותאמים אישית, פילינג, ניקוי עמוק והסרת שיער בשעווה. עובדת עם מוצרים מקצועיים בלבד.',
   9, 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1200&q=80', true, true, true, false, false, 20, 'fixed', 20, false),

  ('b0000000-0000-4000-8000-00000000000b'::uuid, 'maya_events', 'מאיה תסרוקות ואיפור',
   'מסרקת ומאפרת לאירועים · הרצליה והשרון',
   'תסרוקות ערב, כלות ובנות מצווה. מגיעה עם צוות לאירועים גדולים.',
   11, 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=1200&q=80', true, true, false, true, false, 70, 'per_km', 3, true),

  ('b0000000-0000-4000-8000-00000000000c'::uuid, 'eden_pedi', 'עדן פדיקור',
   'פדיקוריסטית רפואית · אשדוד והסביבה',
   'פדיקור רפואי מקצועי, טיפול ביבלות, ציפורן חודרנית ופטרת. מגיעה גם לבתים ולמוסדות.',
   6, 'https://images.unsplash.com/photo-1519415510236-718bdfcd89c8?w=1200&q=80', false, true, true, false, false, 30, 'fixed', 20, true),

  ('b0000000-0000-4000-8000-00000000000d'::uuid, 'oren_beard', 'אורן ברבר',
   'ברבר ומעצב זקן · באר שבע',
   'תספורות גברים מודרניות ועיצוב זקן מדויק. אווירה טובה ומוזיקה טובה.',
   8, 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1200&q=80', false, false, true, false, false, null, 'none', 0, false),

  ('b0000000-0000-4000-8000-00000000000e'::uuid, 'sivan_facial', 'סיון טיפולי פנים',
   'מטפלת פנים · מכשור מתקדם ואנטי אייג׳ינג',
   'טיפולי פנים מתקדמים עם מכשור: רדיו פרקוונסי, אולטרסאונד והידרו פיל. תוצאות אמיתיות.',
   13, 'https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?w=1200&q=80', true, false, true, false, false, null, 'none', 0, true),

  ('b0000000-0000-4000-8000-00000000000f'::uuid, 'ronit_bride', 'רונית איפור כלות',
   'מאפרת כלות · מודיעין והסביבה',
   'מלווה כלות מהניסיון ועד היום הגדול. איפור עמיד שנשאר מושלם לאורך כל האירוע.',
   14, 'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=1200&q=80', true, true, false, true, false, 80, 'per_km', 2.5, false),

  ('b0000000-0000-4000-8000-000000000010'::uuid, 'gal_color', 'גל קולור',
   'קולוריסט · בלונדים, בליאז׳ והחלקות',
   'מתמחה בבלונדים מורכבים, בליאז׳, אירגון והחלקות. אבחון צבע חינם לפני כל טיפול.',
   9, 'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=1200&q=80', false, true, true, false, false, 25, 'fixed', 25, true)
) as p(pro_id, username, business_name, headline, bio, years, cover, verified, home, studio, events, online, travel_km, fee_type, fee, today)
join public.profiles pr on pr.username = p.username;

-- פרטי קשר פרטיים
insert into public.professional_contact_details (professional_id, phone, studio_address)
select pp.id,
       '05' || (2 + (row_number() over (order by pp.created_at)) % 8)::text || '-' ||
       lpad(((row_number() over (order by pp.created_at)) * 1234567 % 10000000)::text, 7, '0'),
       case when pp.accepts_studio then 'רחוב הרצל ' || (10 + (row_number() over (order by pp.created_at)))::text end
from public.professional_profiles pp;

-- ---------------------------------------------------------------------
-- שיוך מקצועות
-- ---------------------------------------------------------------------
insert into public.professional_professions (professional_id, profession_id, is_primary)
select pp.id, pf.id, m.primary_flag
from (values
  ('shirley_hair', 'barber-hair', true), ('shirley_hair', 'hair-stylist', false),
  ('dana_makeup', 'makeup-artist', true), ('dana_makeup', 'event-hair', false),
  ('yossi_barber', 'barber', true),
  ('noa_nails', 'manicurist', true), ('noa_nails', 'pedicurist', false),
  ('rami_barber', 'barber', true),
  ('tal_brows', 'brow-artist', true),
  ('michal_lashes', 'lash-artist', true),
  ('avi_hair', 'hair-stylist', true), ('avi_hair', 'barber-hair', false),
  ('liat_cosmetics', 'cosmetician', true), ('liat_cosmetics', 'facial-therapist', false),
  ('maya_events', 'event-hair', true), ('maya_events', 'makeup-artist', false),
  ('eden_pedi', 'pedicurist', true),
  ('oren_beard', 'barber', true),
  ('sivan_facial', 'facial-therapist', true), ('sivan_facial', 'cosmetician', false),
  ('ronit_bride', 'makeup-artist', true),
  ('gal_color', 'hair-stylist', true)
) as m(username, slug, primary_flag)
join public.profiles pr on pr.username = m.username
join public.professional_profiles pp on pp.profile_id = pr.id
join public.professions pf on pf.slug = m.slug;

-- ---------------------------------------------------------------------
-- שירותים ומחירים
-- ---------------------------------------------------------------------
insert into public.professional_services (
  professional_id, name, description, price_type, price_min, price_max,
  duration_minutes, buffer_minutes, at_client_home, at_studio, at_event, supports_recurring
)
select pp.id, s.name, s.description, s.price_type::public.price_type, s.price_min, s.price_max,
       s.duration, s.buffer, s.home, s.studio, s.event, s.recurring
from (values
  ('shirley_hair', 'תספורת נשים + פן', 'תספורת מותאמת אישית כולל שטיפה ופן מעוצב', 'fixed', 160, null, 75, 15, true, true, false, true),
  ('shirley_hair', 'צבע שורש', 'צבע שורש עם גוון מותאם, כולל שטיפה', 'range', 220, 320, 120, 20, true, true, false, true),
  ('shirley_hair', 'החלקה אורגנית', 'החלקה ללא פורמלין, מחליקה ומזינה', 'range', 600, 900, 180, 30, false, true, false, false),
  ('shirley_hair', 'פן מעוצב', 'פן חלק או גלי לאירוע', 'fixed', 90, null, 45, 10, true, true, true, true),

  ('dana_makeup', 'איפור ערב', 'איפור מלא לאירוע כולל ריסים', 'fixed', 350, null, 75, 20, true, false, true, false),
  ('dana_makeup', 'איפור כלה', 'ניסיון + איפור ביום החתונה', 'range', 1200, 1800, 150, 30, true, false, true, false),
  ('dana_makeup', 'איפור לצילומים', 'איפור מותאם למצלמה', 'fixed', 450, null, 90, 20, true, false, true, false),

  ('yossi_barber', 'תספורת גברים', 'תספורת מכונה ומספריים כולל שטיפה', 'fixed', 70, null, 30, 10, true, true, false, true),
  ('yossi_barber', 'תספורת + זקן', 'תספורת מלאה ועיצוב זקן', 'fixed', 110, null, 45, 10, true, true, false, true),
  ('yossi_barber', 'גילוח בתער חם', 'גילוח קלאסי עם מגבת חמה', 'fixed', 60, null, 30, 10, false, true, false, true),

  ('noa_nails', 'מניקור לק ג׳ל', 'מניקור מלא עם לק ג׳ל בצבע לבחירה', 'fixed', 140, null, 75, 15, true, true, false, true),
  ('noa_nails', 'בניית ציפורניים', 'בנייה בג׳ל כולל עיצוב', 'range', 220, 300, 120, 20, false, true, false, true),
  ('noa_nails', 'מילוי', 'מילוי לבנייה קיימת', 'fixed', 160, null, 90, 15, false, true, false, true),
  ('noa_nails', 'פדיקור + לק ג׳ל', 'פדיקור קוסמטי מלא', 'fixed', 170, null, 75, 15, true, true, false, true),

  ('rami_barber', 'תספורת גברים', 'תספורת קלאסית', 'fixed', 60, null, 30, 10, true, true, false, true),
  ('rami_barber', 'תספורת ילדים', 'תספורת בסבלנות לילדים', 'fixed', 50, null, 25, 10, true, true, false, true),

  ('tal_brows', 'עיצוב גבות', 'עיצוב בחוט או בשעווה', 'fixed', 70, null, 30, 10, true, true, false, true),
  ('tal_brows', 'למינציה לגבות', 'יישור וסידור השערות לאורך זמן', 'fixed', 250, null, 60, 15, false, true, false, false),
  ('tal_brows', 'עיצוב + צביעה', 'עיצוב מלא כולל צביעה', 'fixed', 110, null, 45, 10, true, true, false, true),

  ('michal_lashes', 'הרחבות ריסים קלאסי', 'שיטת אחת על אחת', 'fixed', 350, null, 120, 20, false, true, false, false),
  ('michal_lashes', 'מילוי ריסים', 'מילוי עד שלושה שבועות', 'fixed', 200, null, 75, 15, false, true, false, true),
  ('michal_lashes', 'לאש ליפט', 'הרמת ריסים טבעיים כולל צביעה', 'fixed', 280, null, 60, 15, false, true, false, false),

  ('avi_hair', 'תספורת גברים', 'תספורת ועיצוב', 'fixed', 80, null, 35, 10, true, true, false, true),
  ('avi_hair', 'תספורת נשים', 'תספורת ופן', 'fixed', 150, null, 60, 15, true, true, false, true),
  ('avi_hair', 'תסרוקת ערב', 'תסרוקת מעוצבת לאירוע', 'range', 250, 400, 75, 20, true, true, true, false),

  ('liat_cosmetics', 'טיפול פנים קלאסי', 'ניקוי עמוק, עיסוי ומסכה', 'fixed', 280, null, 75, 15, true, true, false, true),
  ('liat_cosmetics', 'פילינג כימי', 'חידוש העור והבהרת כתמים', 'range', 350, 500, 60, 20, false, true, false, false),
  ('liat_cosmetics', 'הסרת שיער בשעווה', 'רגליים מלאות או בהתאמה', 'range', 80, 200, 45, 10, true, true, false, true),

  ('maya_events', 'תסרוקת ערב', 'תסרוקת מעוצבת לאירוע', 'fixed', 320, null, 60, 20, true, true, true, false),
  ('maya_events', 'חבילת כלה', 'תסרוקת ואיפור ליום החתונה', 'range', 2000, 3000, 180, 30, true, false, true, false),

  ('eden_pedi', 'פדיקור רפואי', 'טיפול מקצועי בכפות הרגליים', 'fixed', 180, null, 60, 15, true, true, false, true),
  ('eden_pedi', 'טיפול ביבלות', 'הסרת יבלות וטיפול ממוקד', 'fixed', 220, null, 45, 15, true, true, false, true),

  ('oren_beard', 'תספורת + עיצוב זקן', 'החבילה המלאה', 'fixed', 100, null, 45, 10, false, true, false, true),
  ('oren_beard', 'עיצוב זקן', 'עיצוב וטיפוח זקן', 'fixed', 50, null, 25, 5, false, true, false, true),

  ('sivan_facial', 'טיפול פנים מכשור', 'רדיו פרקוונסי ואולטרסאונד', 'range', 450, 650, 90, 20, false, true, false, true),
  ('sivan_facial', 'הידרו פיל', 'ניקוי והזנה בטכנולוגיית מים', 'fixed', 520, null, 75, 20, false, true, false, false),

  ('ronit_bride', 'איפור כלה כולל ניסיון', 'פגישת ניסיון ואיפור ביום האירוע', 'range', 1500, 2200, 180, 30, true, false, true, false),
  ('ronit_bride', 'איפור אורחות', 'איפור לאורחות ולבנות משפחה', 'fixed', 280, null, 45, 15, true, false, true, false),

  ('gal_color', 'בליאז׳', 'בליאז׳ מלא כולל טונר', 'range', 750, 1100, 210, 30, false, true, false, false),
  ('gal_color', 'צבע מלא', 'צבע לכל השיער', 'range', 320, 480, 120, 20, false, true, false, true),
  ('gal_color', 'גוונים', 'גוונים לרענון הצבע', 'range', 450, 700, 150, 25, false, true, false, false)
) as s(username, name, description, price_type, price_min, price_max, duration, buffer, home, studio, event, recurring)
join public.profiles pr on pr.username = s.username
join public.professional_profiles pp on pp.profile_id = pr.id;

-- ---------------------------------------------------------------------
-- אזורי שירות
-- ---------------------------------------------------------------------
insert into public.service_areas (professional_id, city_id)
select pp.id, c.id
from public.professional_profiles pp
join public.cities c on c.id = pp.city_id
on conflict do nothing;

insert into public.service_areas (professional_id, city_id)
select pp.id, c.id
from public.professional_profiles pp
join public.profiles pr on pr.id = pp.profile_id
join lateral (
  select c2.id from public.cities c2
  where c2.id <> pp.city_id
    and public.haversine_km(
      (select latitude from public.cities where id = pp.city_id),
      (select longitude from public.cities where id = pp.city_id),
      c2.latitude, c2.longitude
    ) < 25
  limit 5
) c on true
where pp.accepts_home_visits
on conflict do nothing;

-- ---------------------------------------------------------------------
-- שעות פעילות: ראשון–חמישי 09:00–19:00, שישי 09:00–14:00
-- ---------------------------------------------------------------------
insert into public.professional_availability (professional_id, weekday, start_time, end_time, is_break)
select pp.id, d.weekday, d.start_time::time, d.end_time::time, false
from public.professional_profiles pp
cross join (values (0,'09:00','19:00'), (1,'09:00','19:00'), (2,'09:00','19:00'),
                   (3,'09:00','19:00'), (4,'09:00','19:00'), (5,'09:00','14:00')) as d(weekday, start_time, end_time);

-- הפסקת צהריים לימים ראשון–חמישי
insert into public.professional_availability (professional_id, weekday, start_time, end_time, is_break)
select pp.id, d.weekday, '13:00'::time, '13:45'::time, true
from public.professional_profiles pp
cross join (values (0), (1), (2), (3), (4)) as d(weekday);

-- ---------------------------------------------------------------------
-- פוסטים (תיק עבודות)
-- ---------------------------------------------------------------------
insert into public.professional_posts (
  id, professional_id, author_profile_id, service_id, city_id, title, description,
  tags, price_estimate, price_type, duration_minutes, is_before_after, consent_confirmed,
  status, published_at
)
select
  gen_random_uuid(), pp.id, pr.id,
  (select s.id from public.professional_services s
    where s.professional_id = pp.id and s.name = t.service_name limit 1),
  pp.city_id, t.title, t.description, t.tags, t.price, 'fixed', t.duration, false, false,
  'published', now() - (t.days_ago || ' days')::interval
from (values
  ('shirley_hair', 'תספורת נשים + פן', 'בוב קלאסי עם פסים רכים', 'תספורת בוב באורך הסנטר עם שכבות עדינות ופן חלק. מתאים לשיער ישר עד גלי.', array['בוב','תספורת','פן'], 160, 75, 2),
  ('shirley_hair', 'תספורת נשים + פן', 'שכבות ארוכות ונפח', 'תספורת שכבות שמוסיפה תנועה ונפח לשיער דק. הפן נעשה במברשת עגולה.', array['שכבות','נפח'], 160, 75, 5),
  ('shirley_hair', 'צבע שורש', 'צבע שורש בגוון שוקולד', 'כיסוי שורש מלא בגוון חם, כולל טיפול הזנה בסיום.', array['צבע','שוקולד'], 260, 120, 9),
  ('shirley_hair', 'פן מעוצב', 'פן גלי לאירוע', 'גלים רכים שמחזיקים כל הערב.', array['פן','אירוע'], 90, 45, 13),

  ('dana_makeup', 'איפור ערב', 'איפור ערב בגוונים חמים', 'עיניים עשנות בגוון ברונזה עם ליפ נוד. עמיד לכל הלילה.', array['איפור','ערב','ברונזה'], 350, 75, 1),
  ('dana_makeup', 'איפור כלה', 'כלה בסגנון טבעי', 'איפור כלה עדין שמדגיש את התווים הטבעיים. ריסים בודדים.', array['כלה','טבעי'], 1500, 150, 6),
  ('dana_makeup', 'איפור לצילומים', 'איפור לצילומי אופנה', 'איפור נקי עם דגש על עור זוהר, מותאם לתאורת סטודיו.', array['צילומים','אופנה'], 450, 90, 11),

  ('yossi_barber', 'תספורת + זקן', 'פייד גבוה עם זקן מעוצב', 'סקין פייד עם מעבר חלק ועיצוב זקן בקו מדויק.', array['פייד','זקן'], 110, 45, 1),
  ('yossi_barber', 'תספורת גברים', 'קרופ טקסטורלי', 'תספורת קרופ מודרנית עם טקסטורה בחלק העליון.', array['קרופ','גברים'], 70, 30, 4),
  ('yossi_barber', 'גילוח בתער חם', 'גילוח קלאסי בתער', 'מגבת חמה, קצף ותער. חוויה מלאה.', array['תער','גילוח'], 60, 30, 8),

  ('noa_nails', 'מניקור לק ג׳ל', 'לק ג׳ל בגוון ורוד עתיק', 'מניקור מלא עם לק ג׳ל בגוון עדין שמתאים לכל יום.', array['לק ג׳ל','ורוד'], 140, 75, 1),
  ('noa_nails', 'בניית ציפורניים', 'בנייה בצורת בלרינה', 'בנייה בג׳ל בצורת בלרינה עם עיצוב פרנץ׳ מודרני.', array['בנייה','פרנץ׳'], 250, 120, 3),
  ('noa_nails', 'מניקור לק ג׳ל', 'עיצוב כרום', 'אפקט כרום מטאלי שמושך את העין.', array['כרום','עיצוב'], 170, 90, 7),
  ('noa_nails', 'פדיקור + לק ג׳ל', 'פדיקור אדום קלאסי', 'פדיקור מלא עם לק ג׳ל אדום.', array['פדיקור','אדום'], 170, 75, 10),

  ('rami_barber', 'תספורת גברים', 'תספורת קלאסית בצד', 'שביל בצד עם מעבר עדין – קלאסיקה שלא מתיישנת.', array['קלאסי','גברים'], 60, 30, 2),
  ('rami_barber', 'תספורת ילדים', 'תספורת ראשונה', 'תספורת ראשונה לילד בן שנתיים, בסבלנות ובכיף.', array['ילדים'], 50, 25, 6),
  ('rami_barber', 'תספורת גברים', 'בס פייד נקי', 'פייד נמוך עם קו מדויק.', array['פייד'], 60, 30, 12),

  ('tal_brows', 'עיצוב גבות', 'עיצוב גבות בחוט', 'עיצוב מדויק בשיטת החוט – עדין ומהיר.', array['גבות','חוט'], 70, 30, 1),
  ('tal_brows', 'למינציה לגבות', 'למינציה לגבות מלאות', 'יישור וסידור השערות למראה מלא ומסודר לשישה שבועות.', array['למינציה','גבות'], 250, 60, 5),
  ('tal_brows', 'עיצוב + צביעה', 'עיצוב וצביעה בגוון חם', 'עיצוב מלא עם צביעה שמדגישה את המבט.', array['גבות','צביעה'], 110, 45, 9),

  ('michal_lashes', 'הרחבות ריסים קלאסי', 'הרחבות קלאסי טבעי', 'ריס על ריס במראה טבעי ומחמיא.', array['ריסים','קלאסי'], 350, 120, 2),
  ('michal_lashes', 'לאש ליפט', 'לאש ליפט וצביעה', 'הרמת הריסים הטבעיים – בלי הרחבות.', array['לאש ליפט'], 280, 60, 7),
  ('michal_lashes', 'הרחבות ריסים קלאסי', 'וולום 3D', 'מראה מלא ודרמטי לערב.', array['וולום','ריסים'], 420, 150, 14),

  ('avi_hair', 'תספורת נשים', 'תספורת פיקסי', 'תספורת קצרה ומעוצבת עם המון אופי.', array['פיקסי','קצר'], 150, 60, 3),
  ('avi_hair', 'תסרוקת ערב', 'תסרוקת אסופה', 'אסוף נמוך רך עם גדילים משוחררים.', array['תסרוקת','ערב'], 300, 75, 8),
  ('avi_hair', 'תספורת גברים', 'תספורת גברים מסודרת', 'תספורת יומיומית עם קווים נקיים.', array['גברים'], 80, 35, 15),

  ('liat_cosmetics', 'טיפול פנים קלאסי', 'טיפול פנים לעור רגיש', 'ניקוי עדין, מסכה מרגיעה ולחות עמוקה.', array['פנים','רגיש'], 280, 75, 2),
  ('liat_cosmetics', 'פילינג כימי', 'פילינג להבהרת כתמים', 'סדרת פילינג לטיפול בכתמי שמש.', array['פילינג','כתמים'], 400, 60, 9),
  ('liat_cosmetics', 'טיפול פנים קלאסי', 'ניקוי עמוק לעור שמן', 'טיפול ממוקד לעור שמן ונקבוביות.', array['ניקוי','שמן'], 280, 75, 16),

  ('maya_events', 'תסרוקת ערב', 'תסרוקת בת מצווה', 'תסרוקת חצי אסוף עם גלים ואקססוריז.', array['בת מצווה','תסרוקת'], 320, 60, 4),
  ('maya_events', 'חבילת כלה', 'חבילת כלה מלאה', 'תסרוקת ואיפור מהבוקר ועד הקבלת פנים.', array['כלה','חבילה'], 2400, 180, 10),
  ('maya_events', 'תסרוקת ערב', 'תסרוקת אורחת', 'גלים הוליוודיים לאורחת באירוע.', array['ערב','גלים'], 320, 60, 17),

  ('eden_pedi', 'פדיקור רפואי', 'פדיקור רפואי מלא', 'טיפול יסודי בכפות הרגליים כולל טיפוח.', array['פדיקור','רפואי'], 180, 60, 3),
  ('eden_pedi', 'טיפול ביבלות', 'טיפול בציפורן חודרנית', 'טיפול מקצועי ומדויק להקלה מיידית.', array['ציפורן','טיפול'], 220, 45, 11),
  ('eden_pedi', 'פדיקור רפואי', 'פדיקור לסוכרתיים', 'טיפול זהיר ומותאם.', array['פדיקור','סוכרת'], 200, 60, 18),

  ('oren_beard', 'תספורת + עיצוב זקן', 'זקן מעוצב עם קווים חדים', 'עיצוב זקן מדויק כולל תער בקווים.', array['זקן','עיצוב'], 100, 45, 2),
  ('oren_beard', 'עיצוב זקן', 'טיפוח זקן ארוך', 'עיצוב וטיפוח לזקן ארוך כולל שמן.', array['זקן','ארוך'], 50, 25, 8),
  ('oren_beard', 'תספורת + עיצוב זקן', 'החבילה המלאה', 'תספורת וזקן במחיר משתלם.', array['חבילה'], 100, 45, 15),

  ('sivan_facial', 'טיפול פנים מכשור', 'רדיו פרקוונסי למתיחת עור', 'טיפול לא פולשני להידוק העור.', array['אנטי אייג׳ינג','מכשור'], 550, 90, 1),
  ('sivan_facial', 'הידרו פיל', 'הידרו פיל לזוהר', 'ניקוי והזנה בטכנולוגיית מים – עור זוהר מיד.', array['הידרו פיל','זוהר'], 520, 75, 6),
  ('sivan_facial', 'טיפול פנים מכשור', 'אולטרסאונד להחדרת חומרים', 'החדרה עמוקה של חומרים פעילים.', array['אולטרסאונד'], 480, 90, 12),

  ('ronit_bride', 'איפור כלה כולל ניסיון', 'כלה בסגנון רומנטי', 'איפור רומנטי בגווני ורוד ואפרסק.', array['כלה','רומנטי'], 1800, 180, 3),
  ('ronit_bride', 'איפור אורחות', 'איפור לאם הכלה', 'איפור מכובד ומחמיא שמחזיק כל הערב.', array['אורחות'], 280, 45, 9),
  ('ronit_bride', 'איפור כלה כולל ניסיון', 'כלה בסגנון גלאם', 'איפור נוצץ עם עיניים דרמטיות.', array['כלה','גלאם'], 2000, 180, 16),

  ('gal_color', 'בליאז׳', 'בליאז׳ בלונד קרמל', 'מעבר רך מהשורש לקצוות בגוון קרמל.', array['בליאז׳','בלונד'], 950, 210, 1),
  ('gal_color', 'צבע מלא', 'אדום נחושת', 'צבע מלא בגוון נחושת עשיר.', array['צבע','נחושת'], 400, 120, 7),
  ('gal_color', 'גוונים', 'גוונים לרענון', 'גוונים דקים לרענון הבלונד.', array['גוונים'], 550, 150, 13)
) as t(username, service_name, title, description, tags, price, duration, days_ago)
join public.profiles pr on pr.username = t.username
join public.professional_profiles pp on pp.profile_id = pr.id;

-- מדיה לכל פוסט (שלוש תמונות)
insert into public.post_media (post_id, url, media_type, position, alt_text)
select pt.id,
       'https://images.unsplash.com/' || m.photo || '?w=1000&q=80',
       'image', m.position, pt.title
from public.professional_posts pt
cross join lateral (
  select * from (values
    (0, (array[
      'photo-1560066984-138dadb4c035','photo-1595475207225-428b62bda831','photo-1522337360788-8b13dee7a37e',
      'photo-1604654894610-df63bc536371','photo-1516975080664-ed2fc6a32937','photo-1570172619644-dfd03ed5d881'
    ])[1 + (abs(hashtext(pt.id::text)) % 6)]),
    (1, (array[
      'photo-1519699047748-de8e457a634e','photo-1503951914875-452162b0f3f1','photo-1562322140-8baeececf3df',
      'photo-1512290923902-8a9f81dc236c','photo-1596462502278-27bfdc403348','photo-1585747860715-2ba37e788b70'
    ])[1 + (abs(hashtext(pt.id::text || 'b')) % 6)]),
    (2, (array[
      'photo-1521590832167-7bcbfaa6381f','photo-1487412947147-5cebf100ffc2','photo-1519415510236-718bdfcd89c8',
      'photo-1622286342621-4bd786c2447c','photo-1524504388940-b1c1722653e1','photo-1560869713-7d0a29430803'
    ])[1 + (abs(hashtext(pt.id::text || 'c')) % 6)])
  ) as x(position, photo)
) m;

-- ---------------------------------------------------------------------
-- פרסום כל הפרופילים המקצועיים (עכשיו כשיש תיק עבודות)
-- ---------------------------------------------------------------------
update public.professional_profiles set status = 'active';
update public.profiles set active_mode = 'professional' where is_professional;

-- ---------------------------------------------------------------------
-- מעקב, לייקים, תגובות ושמירות
-- ---------------------------------------------------------------------
insert into public.follows (follower_id, following_id)
select f.id, t.id
from public.profiles f
cross join public.profiles t
where f.id <> t.id
  and t.is_professional
  and (abs(hashtext(f.username || t.username)) % 100) < 45
on conflict do nothing;

insert into public.post_likes (post_id, profile_id)
select pt.id, pr.id
from public.professional_posts pt
cross join public.profiles pr
where pr.id <> pt.author_profile_id
  and (abs(hashtext(pt.id::text || pr.username)) % 100) < 40
on conflict do nothing;

insert into public.post_comments (post_id, profile_id, body)
select pt.id, pr.id, c.body
from public.professional_posts pt
join lateral (
  select pr2.id from public.profiles pr2
  where pr2.id <> pt.author_profile_id
  order by hashtext(pt.id::text || pr2.username)
  limit 2
) pr on true
cross join lateral (
  select (array[
    'מהמם! ממש אהבתי 😍',
    'איזה יופי, כמה זמן לוקח הטיפול?',
    'עשית לי את זה בשבוע שעבר ואני עדיין מקבלת מחמאות',
    'אפשר לקבל פרטים על המחיר?',
    'עבודה נקייה ומדויקת 👏',
    'זה בדיוק מה שחיפשתי, אפשר לתאם?'
  ])[1 + (abs(hashtext(pt.id::text || pr.id::text)) % 6)] as body
) c;

insert into public.saved_posts (profile_id, post_id)
select pr.id, pt.id
from public.profiles pr
cross join public.professional_posts pt
where (abs(hashtext(pr.username || pt.id::text)) % 100) < 12
on conflict do nothing;

insert into public.saved_professionals (profile_id, professional_id)
select pr.id, pp.id
from public.profiles pr
cross join public.professional_profiles pp
where pp.profile_id <> pr.id
  and (abs(hashtext(pr.username || pp.id::text)) % 100) < 20
on conflict do nothing;

-- ---------------------------------------------------------------------
-- כתובות לקוחות
-- ---------------------------------------------------------------------
insert into public.service_addresses (id, profile_id, label, city_id, street, house_number, apartment, floor, has_parking, is_default)
select a.id, pr.id, 'הבית שלי', pr.city_id, a.street, a.house, a.apartment, a.floor, a.parking, true
from (values
  ('c0000000-0000-4000-8000-000000000011'::uuid, 'yael_client', 'הרצל', '15', '4', '2', true),
  ('c0000000-0000-4000-8000-000000000012'::uuid, 'amir_client', 'ז׳בוטינסקי', '42', '12', '3', false),
  ('c0000000-0000-4000-8000-000000000013'::uuid, 'hila_client', 'דיזנגוף', '108', '7', '2', false),
  ('c0000000-0000-4000-8000-000000000014'::uuid, 'moshe_client', 'הנביאים', '23', '1', '1', true),
  ('c0000000-0000-4000-8000-000000000015'::uuid, 'shira_client', 'ויצמן', '61', '9', '4', true)
) as a(id, username, street, house, apartment, floor, parking)
join public.profiles pr on pr.username = a.username;

-- ---------------------------------------------------------------------
-- הזמנות: היסטוריה, ממתינות ועתידיות
-- ---------------------------------------------------------------------
-- הזמנות שהושלמו (מאפשרות ביקורות)
insert into public.bookings (
  id, client_id, professional_id, service_id, address_id, location_type, status,
  scheduled_start, scheduled_end, duration_minutes, buffer_minutes,
  price_type, price_amount, travel_fee, completed_at, confirmed_at
)
select
  b.id, cl.id, pp.id, s.id, addr.id, 'client_home', 'completed',
  now() - (b.days_ago || ' days')::interval,
  now() - (b.days_ago || ' days')::interval + (s.duration_minutes || ' minutes')::interval,
  s.duration_minutes, s.buffer_minutes,
  'fixed', s.price_min, 20,
  now() - (b.days_ago || ' days')::interval,
  now() - ((b.days_ago + 2) || ' days')::interval
from (values
  ('d0000000-0000-4000-8000-000000000001'::uuid, 'yael_client', 'shirley_hair', 'תספורת נשים + פן', 21),
  ('d0000000-0000-4000-8000-000000000002'::uuid, 'yael_client', 'shirley_hair', 'תספורת נשים + פן', 7),
  ('d0000000-0000-4000-8000-000000000003'::uuid, 'amir_client', 'yossi_barber', 'תספורת + זקן', 14),
  ('d0000000-0000-4000-8000-000000000004'::uuid, 'hila_client', 'dana_makeup', 'איפור ערב', 30),
  ('d0000000-0000-4000-8000-000000000005'::uuid, 'shira_client', 'noa_nails', 'מניקור לק ג׳ל', 18),
  ('d0000000-0000-4000-8000-000000000006'::uuid, 'moshe_client', 'rami_barber', 'תספורת גברים', 10),
  ('d0000000-0000-4000-8000-000000000007'::uuid, 'hila_client', 'tal_brows', 'עיצוב גבות', 25),
  ('d0000000-0000-4000-8000-000000000008'::uuid, 'shira_client', 'michal_lashes', 'לאש ליפט', 40)
) as b(id, client_username, pro_username, service_name, days_ago)
join public.profiles cl on cl.username = b.client_username
join public.profiles prp on prp.username = b.pro_username
join public.professional_profiles pp on pp.profile_id = prp.id
join public.professional_services s on s.professional_id = pp.id and s.name = b.service_name
join public.service_addresses addr on addr.profile_id = cl.id;

-- הזמנות עתידיות מאושרות
insert into public.bookings (
  client_id, professional_id, service_id, address_id, location_type, status,
  scheduled_start, scheduled_end, duration_minutes, buffer_minutes,
  price_type, price_amount, travel_fee, confirmed_at
)
select
  cl.id, pp.id, s.id, addr.id, 'client_home', 'confirmed',
  (date_trunc('day', now()) + (b.days_ahead || ' days')::interval + '17:00'::interval),
  (date_trunc('day', now()) + (b.days_ahead || ' days')::interval + '17:00'::interval + (s.duration_minutes || ' minutes')::interval),
  s.duration_minutes, s.buffer_minutes, 'fixed', s.price_min, 20, now()
from (values
  ('yael_client', 'shirley_hair', 'תספורת נשים + פן', 3),
  ('amir_client', 'yossi_barber', 'תספורת + זקן', 5),
  ('hila_client', 'dana_makeup', 'איפור ערב', 8)
) as b(client_username, pro_username, service_name, days_ahead)
join public.profiles cl on cl.username = b.client_username
join public.profiles prp on prp.username = b.pro_username
join public.professional_profiles pp on pp.profile_id = prp.id
join public.professional_services s on s.professional_id = pp.id and s.name = b.service_name
join public.service_addresses addr on addr.profile_id = cl.id;

-- הזמנות שממתינות לאישור
insert into public.bookings (
  client_id, professional_id, service_id, address_id, location_type, status,
  scheduled_start, scheduled_end, duration_minutes, buffer_minutes,
  price_type, price_amount, travel_fee, notes
)
select
  cl.id, pp.id, s.id, addr.id, 'client_home', 'pending',
  (date_trunc('day', now()) + (b.days_ahead || ' days')::interval + '11:00'::interval),
  (date_trunc('day', now()) + (b.days_ahead || ' days')::interval + '11:00'::interval + (s.duration_minutes || ' minutes')::interval),
  s.duration_minutes, s.buffer_minutes, 'fixed', s.price_min, 20, b.notes
from (values
  ('shira_client', 'noa_nails', 'מניקור לק ג׳ל', 4, 'אשמח לגוון עדין, יש לי אירוע בערב'),
  ('moshe_client', 'rami_barber', 'תספורת גברים', 2, 'אפשר קצת קצר יותר מהפעם הקודמת')
) as b(client_username, pro_username, service_name, days_ahead, notes)
join public.profiles cl on cl.username = b.client_username
join public.profiles prp on prp.username = b.pro_username
join public.professional_profiles pp on pp.profile_id = prp.id
join public.professional_services s on s.professional_id = pp.id and s.name = b.service_name
join public.service_addresses addr on addr.profile_id = cl.id;

-- ---------------------------------------------------------------------
-- ביקורות (רק על הזמנות שהושלמו)
-- ---------------------------------------------------------------------
insert into public.reviews (booking_id, professional_id, client_id, service_id, rating, body)
select b.id, b.professional_id, b.client_id, b.service_id, r.rating, r.body
from public.bookings b
join lateral (
  select
    (array[5,5,5,4,5,4,5,5])[1 + (abs(hashtext(b.id::text)) % 8)] as rating,
    (array[
      'הגיעה בזמן, עבודה מקצועית ונעימה. ממליצה בחום!',
      'פשוט מושלם. הבית נשאר נקי והתוצאה מדהימה.',
      'שירות אדיב ומקצועי, בדיוק מה שביקשתי.',
      'תוצאה יפה מאוד, אחזור בוודאות.',
      'סבלנות אין סופית והקשבה אמיתית למה שרציתי.',
      'מחיר הוגן ותוצאה מעולה. תודה!',
      'הגיע עד הבית וזה חסך לי המון זמן. מומלץ.',
      'איכות גבוהה, ברור שיש כאן ניסיון.'
    ])[1 + (abs(hashtext(b.id::text || 'r')) % 8)] as body
) r on true
where b.status = 'completed'
on conflict do nothing;

-- תגובות של בעלי מקצוע לחלק מהביקורות
insert into public.review_replies (review_id, professional_id, body)
select rv.id, rv.professional_id,
       (array[
         'תודה רבה! היה תענוג, נתראה בפעם הבאה 🙏',
         'איזה כיף לקרוא, תודה על המילים החמות!',
         'תודה! מחכה לראות אתכם שוב.'
       ])[1 + (abs(hashtext(rv.id::text)) % 3)]
from public.reviews rv
where (abs(hashtext(rv.id::text)) % 100) < 60
on conflict do nothing;

-- ---------------------------------------------------------------------
-- סדרות מפגשים קבועות
-- ---------------------------------------------------------------------
insert into public.recurring_booking_series (
  id, client_id, professional_id, service_id, address_id, location_type,
  frequency, interval_weeks, weekday, start_time, duration_minutes,
  start_date, planned_occurrences, price_amount, travel_fee, notes,
  approval_mode, status, client_approved_at, professional_approved_at
)
select
  sr.id, cl.id, pp.id, s.id, addr.id, 'client_home',
  sr.frequency::public.recurrence_frequency, sr.interval_weeks, sr.weekday, sr.start_time::time,
  s.duration_minutes, current_date + 7, 6, s.price_min, 20, sr.notes,
  'whole_series', 'active', now() - interval '3 days', now() - interval '2 days'
from (values
  ('e0000000-0000-4000-8000-000000000001'::uuid, 'yael_client', 'shirley_hair', 'תספורת נשים + פן',
   'biweekly', 2, 4, '17:00', 'כמו תמיד – תספורת קלה ופן'),
  ('e0000000-0000-4000-8000-000000000002'::uuid, 'amir_client', 'yossi_barber', 'תספורת + זקן',
   'every_3_weeks', 3, 2, '18:30', 'פייד 1 בצדדים')
) as sr(id, client_username, pro_username, service_name, frequency, interval_weeks, weekday, start_time, notes)
join public.profiles cl on cl.username = sr.client_username
join public.profiles prp on prp.username = sr.pro_username
join public.professional_profiles pp on pp.profile_id = prp.id
join public.professional_services s on s.professional_id = pp.id and s.name = sr.service_name
join public.service_addresses addr on addr.profile_id = cl.id;

-- יצירת המפגשים בפועל
select public.generate_series_occurrences('e0000000-0000-4000-8000-000000000001');
select public.materialize_series_bookings('e0000000-0000-4000-8000-000000000001');
select public.generate_series_occurrences('e0000000-0000-4000-8000-000000000002');
select public.materialize_series_bookings('e0000000-0000-4000-8000-000000000002');

-- הערות פרטיות של בעל המקצוע על לקוחות קבועים
insert into public.customer_notes (professional_id, client_id, note)
select sr.professional_id, sr.client_id,
       (array[
         'מעדיפה מים פושרים, רגישה בקרקפת',
         'תמיד מבקש/ת קפה שחור בלי סוכר',
         'לצלצל בפעמון ולא לדפוק – יש תינוק ישן'
       ])[1 + (abs(hashtext(sr.id::text)) % 3)]
from public.recurring_booking_series sr;

-- ---------------------------------------------------------------------
-- שיחות והודעות
-- ---------------------------------------------------------------------
do $$
declare
  v_pair record;
  v_conversation uuid;
  v_key text;
begin
  for v_pair in
    select distinct b.client_id, pp.profile_id as pro_profile_id
    from public.bookings b
    join public.professional_profiles pp on pp.id = b.professional_id
  loop
    v_key := public.direct_pair_key(v_pair.client_id, v_pair.pro_profile_id);

    select conversation_id into v_conversation
    from public.direct_conversation_keys where pair_key = v_key;

    if v_conversation is null then
      insert into public.conversations (created_by) values (v_pair.client_id)
      returning id into v_conversation;

      insert into public.conversation_members (conversation_id, profile_id)
      values (v_conversation, v_pair.client_id), (v_conversation, v_pair.pro_profile_id);

      insert into public.direct_conversation_keys (pair_key, conversation_id)
      values (v_key, v_conversation);

      insert into public.messages (conversation_id, sender_id, body, created_at)
      values
        (v_conversation, v_pair.client_id, 'היי! ראיתי את העבודות שלך ואשמח לתאם תור 😊', now() - interval '3 days'),
        (v_conversation, v_pair.pro_profile_id, 'היי! בשמחה. איזה יום נוח לך?', now() - interval '3 days' + interval '20 minutes'),
        (v_conversation, v_pair.client_id, 'חמישי אחר הצהריים מתאים לי מצוין', now() - interval '2 days'),
        (v_conversation, v_pair.pro_profile_id, 'מצוין, רשמתי. נתראה!', now() - interval '2 days' + interval '15 minutes');
    end if;
  end loop;
end $$;

-- הודעות נוספות (במקרה שהבלוק שלמעלה נעצר)
insert into public.messages (conversation_id, sender_id, body, created_at)
select c.id, cm.profile_id, 'מעולה, נתראה! אם משהו משתנה אעדכן מראש 🙏', now() - interval '1 day'
from public.conversations c
join lateral (
  select profile_id from public.conversation_members where conversation_id = c.id order by joined_at limit 1
) cm on true
where not exists (
  select 1 from public.messages m where m.conversation_id = c.id and m.created_at > now() - interval '2 days'
);

-- ---------------------------------------------------------------------
-- בקשת מקצוע חדש לדוגמה (ממתינה לאישור מנהל)
-- ---------------------------------------------------------------------
insert into public.profession_requests (requested_by, raw_name, note)
select pr.id, 'מעצב/ת תסרוקות אפרו', 'מתמחה בקוקיות, צמות וטיפוח שיער מתולתל'
from public.profiles pr where pr.username = 'maya_events'
on conflict do nothing;

-- ---------------------------------------------------------------------
-- רענון מדדים מחושבים
-- ---------------------------------------------------------------------
select public.refresh_professional_rating(id) from public.professional_profiles;
select public.refresh_response_time(id) from public.professional_profiles;

update public.professional_profiles pp
set clients_count = (
  select count(distinct b.client_id) from public.bookings b
  where b.professional_id = pp.id and b.status = 'completed'
);

-- מונחי חיפוש פופולריים
insert into public.popular_searches (term, hits) values
  ('ספר עד הבית', 42), ('מניקור', 38), ('איפור כלה', 31), ('ברבר', 29),
  ('עיצוב גבות', 24), ('הרחבות ריסים', 19), ('טיפול פנים', 17), ('פדיקור רפואי', 12)
on conflict (term) do update set hits = excluded.hits;


-- ==========================================================
-- סיסמאות למשתמשי ההדגמה
-- כל משתמש מקבל hash אקראי משלו. הסיסמה לכולם: Demo1234
-- ==========================================================

update public.profiles
   set password_hash = public.hash_password('Demo1234')
 where password_hash = 'SEED_PLACEHOLDER';


-- ==========================================================
--  ⬅⬅⬅  הצעד האחרון — חובה  ➡➡➡
--
--  החליפו את PASTE_YOUR_JWT_SECRET_HERE במפתח האמיתי שלכם:
--    Project Settings → API → JWT Settings → JWT Secret
--
--  המפתח נשמר בטבלה ‎app_secrets‎ שאין עליה שום הרשאה למשתמשים,
--  ומשמש לחתימת אסימוני ההתחברות בתוך מסד הנתונים בלבד.
-- ==========================================================

select public.set_app_secret('jwt_secret', 'PASTE_YOUR_JWT_SECRET_HERE');

-- ==========================================================
--  סיימתם. מה הלאה?
--
--  1. Project Settings → API — העתיקו את Project URL ואת מפתח ה־anon
--  2. פתחו את index.html והדביקו אותם בשתי השורות שבראש הקובץ
--  3. פתחו את הקובץ בדפדפן — האפליקציה מוכנה
--
--  משתמשי הדגמה (הסיסמה לכולם: Demo1234):
--    admin_yofi     — מנהל מערכת
--    shirley_hair   — מעצבת שיער עם פרופיל מלא
--    yael_client    — לקוחה עם הזמנות וסדרה קבועה
-- ==========================================================
