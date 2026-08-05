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
