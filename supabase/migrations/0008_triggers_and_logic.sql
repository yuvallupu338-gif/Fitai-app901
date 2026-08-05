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
