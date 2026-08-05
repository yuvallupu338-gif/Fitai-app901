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
