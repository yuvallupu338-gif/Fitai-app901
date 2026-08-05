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
