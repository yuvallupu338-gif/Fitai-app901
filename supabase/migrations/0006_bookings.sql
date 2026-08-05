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
