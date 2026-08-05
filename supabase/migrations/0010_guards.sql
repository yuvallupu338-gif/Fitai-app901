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
