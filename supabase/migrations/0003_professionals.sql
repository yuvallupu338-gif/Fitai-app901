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
