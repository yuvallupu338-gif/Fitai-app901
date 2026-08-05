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
