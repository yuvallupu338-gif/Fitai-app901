-- ==========================================================
--  חיפוש בשפה חופשית
--
--  עד כה כל מחרוזת החיפוש חופשה כמילה אחת, ולכן שאילתה טבעית כמו
--  "ספר שמגיע הביתה בחדרה" לא החזירה דבר — היא חופשה כמחרוזת שלמה
--  בתוך שם העסק או שם השירות.
--
--  כאן היא מפורקת למילים, מילות קישור מושמטות, ומילים שמביעות כוונה
--  ("הביתה", "היום", "לאירוע") הופכות למסננים אמיתיים. שאר המילים
--  חייבות כולן להימצא — במקצוע, בשירות, בשם או בעיר.
-- ==========================================================

set search_path = public, extensions;

/**
 * מפרק מחרוזת חיפוש למילים משמעותיות.
 * מילות קישור וכינויים מושמטים כדי שלא ידרשו התאמה.
 */
create or replace function public.search_tokens(p_term text)
returns text[]
language sql
immutable
as $$
  select coalesce(
    array_agg(word) filter (
      where length(word) >= 2
        and word <> all (array[
          'של','עם','עד','על','אל','את','גם','כל','אני','לי','לו','לה','לנו',
          'הוא','היא','הם','הן','זה','זו','יש','אין','או','אבל','כי','מי','מה',
          'איפה','מתי','איך','שמגיע','שמגיעה','שיגיע','שתגיע','מגיע','מגיעה',
          'רוצה','צריך','צריכה','מחפש','מחפשת','בבקשה','טוב','טובה','הכי'
        ])
    ),
    '{}'::text[])
  from unnest(
    string_to_array(
      regexp_replace(public.normalize_text(coalesce(p_term, '')), '[^\wא-ת]+', ' ', 'g'),
      ' ')
  ) as word;
$$;

/** האם מחרוזת החיפוש מבקשת שירות בבית הלקוח? */
create or replace function public.search_wants_home(p_term text)
returns boolean
language sql
immutable
as $$
  select public.normalize_text(coalesce(p_term, ''))
         ~ '(הביתה|בבית|עד הבית|לבית|אליי|אלי הביתה|ביקור בית)';
$$;

/** האם מחרוזת החיפוש מבקשת זמינות היום? */
create or replace function public.search_wants_today(p_term text)
returns boolean
language sql
immutable
as $$
  select public.normalize_text(coalesce(p_term, '')) ~ '(היום|עכשיו|מיד|דחוף|פנוי היום|פנויה היום)';
$$;

/** האם מחרוזת החיפוש מבקשת שירות לאירוע? */
create or replace function public.search_wants_event(p_term text)
returns boolean
language sql
immutable
as $$
  select public.normalize_text(coalesce(p_term, '')) ~ '(אירוע|לאירוע|חתונה|בת מצווה|בר מצווה|ערב)';
$$;

/** האם מחרוזת החיפוש מבקשת מפגש קבוע? */
create or replace function public.search_wants_recurring(p_term text)
returns boolean
language sql
immutable
as $$
  select public.normalize_text(coalesce(p_term, '')) ~ '(קבוע|קבועה|כל שבוע|כל שבועיים|כל חודש|חוזר)';
$$;

/**
 * מזהה עיר שמוזכרת במחרוזת החיפוש.
 * מוחזר מזהה העיר, או NULL אם לא זוהתה עיר.
 */
create or replace function public.search_city(p_term text)
returns uuid
language sql
stable
as $$
  select c.id
    from public.cities c
   where c.is_active
     and length(c.name) >= 3
     and public.normalize_text(coalesce(p_term, '')) like '%' || public.normalize_text(c.name) || '%'
   order by length(c.name) desc
   limit 1;
$$;

/**
 * האם בעל המקצוע מתאים למילה בודדת?
 * המילה נבדקת מול שם העסק, השם האישי, שם המשתמש, המקצועות,
 * השירותים והעיר — התאמה באחד מהם מספיקה.
 */
create or replace function public.professional_matches_word(p_professional_id uuid, p_word text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
      from public.professional_profiles pp
      join public.profiles pr on pr.id = pp.profile_id
      left join public.cities ct on ct.id = pp.city_id
     where pp.id = p_professional_id
       and (
            public.normalize_text(pp.business_name) like '%' || p_word || '%'
         or public.normalize_text(coalesce(pp.headline, '')) like '%' || p_word || '%'
         or public.normalize_text(pr.full_name) like '%' || p_word || '%'
         or pr.username::text like '%' || p_word || '%'
         or public.normalize_text(coalesce(ct.name, '')) like '%' || p_word || '%'
       )
  )
  or exists (
    select 1 from public.professional_professions ppf
      join public.professions pf on pf.id = ppf.profession_id
     where ppf.professional_id = p_professional_id
       and (pf.name_norm like '%' || p_word || '%' or similarity(pf.name_norm, p_word) > 0.42)
  )
  or exists (
    select 1 from public.professional_services s
     where s.professional_id = p_professional_id and s.is_active and s.deleted_at is null
       and (public.normalize_text(s.name) like '%' || p_word || '%'
            or public.normalize_text(coalesce(s.description, '')) like '%' || p_word || '%')
  );
$$;

grant execute on function public.search_tokens(text)                         to anon, authenticated;
grant execute on function public.search_wants_home(text)                     to anon, authenticated;
grant execute on function public.search_wants_today(text)                    to anon, authenticated;
grant execute on function public.search_wants_event(text)                    to anon, authenticated;
grant execute on function public.search_wants_recurring(text)                to anon, authenticated;
grant execute on function public.search_city(text)                           to anon, authenticated;
grant execute on function public.professional_matches_word(uuid, text)       to anon, authenticated;

-- ----------------------------------------------------------
-- טיפול בתחיליות עבריות ובגרשיים
--
-- בעברית מילית חיבור נדבקת למילה ("בחדרה", "בג׳ל"), ולכן חיפוש
-- מילולי פשוט מפספס אותה. בנוסף גרש בתוך מילה ("ג׳ל") אינו מוקלד
-- תמיד. שתי הפונקציות האלה מייצרות את הצורות החלופיות להשוואה.
-- ----------------------------------------------------------

/** מסיר גרשיים כדי ש־"ג׳ל" ו־"גל" ייחשבו זהים. */
create or replace function public.strip_marks(p_text text)
returns text
language sql
immutable
as $$
  select translate(coalesce(p_text, ''), '׳״''"`', '');
$$;

/**
 * צורות אפשריות של מילת חיפוש: המילה עצמה, ובלי תחילית עברית.
 * התחילית מוסרת רק ממילים ארוכות מספיק, כדי לא לשבש מילים קצרות.
 */
create or replace function public.word_forms(p_word text)
returns text[]
language sql
immutable
as $$
  select array_remove(array[
    public.strip_marks(p_word),
    -- סף של 3 תווים, כדי ש־"בתל" יימצא גם כ־"תל". שתי הצורות נבדקות,
    -- ולכן מילה שהאות הראשונה שלה אינה תחילית ("בית") ממשיכה להתאים כרגיל.
    case when length(p_word) >= 3 and left(p_word, 1) in ('ב','ל','כ','מ','ש','ה','ו')
         then public.strip_marks(substr(p_word, 2)) end,
    case when length(p_word) >= 5 and left(p_word, 2) in ('כש','לכ','מה','שה','וה','בה')
         then public.strip_marks(substr(p_word, 3)) end
  ], null);
$$;

create or replace function public.professional_matches_word(p_professional_id uuid, p_word text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from unnest(public.word_forms(p_word)) as f
    where exists (
      select 1
        from public.professional_profiles pp
        join public.profiles pr on pr.id = pp.profile_id
        left join public.cities ct on ct.id = pp.city_id
       where pp.id = p_professional_id
         and (
              public.strip_marks(public.normalize_text(pp.business_name)) like '%' || f || '%'
           or public.strip_marks(public.normalize_text(coalesce(pp.headline, ''))) like '%' || f || '%'
           or public.strip_marks(public.normalize_text(pr.full_name)) like '%' || f || '%'
           or pr.username::text like '%' || f || '%'
           or public.strip_marks(public.normalize_text(coalesce(ct.name, ''))) like '%' || f || '%'
         )
    )
    or exists (
      select 1 from public.professional_professions ppf
        join public.professions pf on pf.id = ppf.profession_id
       where ppf.professional_id = p_professional_id
         and (public.strip_marks(pf.name_norm) like '%' || f || '%'
              or similarity(public.strip_marks(pf.name_norm), f) > 0.42)
    )
    or exists (
      select 1 from public.professional_services s
       where s.professional_id = p_professional_id and s.is_active and s.deleted_at is null
         and (public.strip_marks(public.normalize_text(s.name)) like '%' || f || '%'
              or public.strip_marks(public.normalize_text(coalesce(s.description, ''))) like '%' || f || '%')
    )
  );
$$;

/** האם המילה מתייחסת לעיר שזוהתה בשאילתה? */
create or replace function public.word_is_city(p_word text, p_city_id uuid)
returns boolean
language sql
stable
as $$
  select p_city_id is not null and exists (
    select 1 from public.cities c, unnest(public.word_forms(p_word)) as f
     where c.id = p_city_id
       and (public.strip_marks(public.normalize_text(c.name)) like '%' || f || '%'
            or f like '%' || public.strip_marks(public.normalize_text(c.name)) || '%')
  );
$$;

grant execute on function public.strip_marks(text)            to anon, authenticated;
grant execute on function public.word_forms(text)             to anon, authenticated;
grant execute on function public.word_is_city(text, uuid)     to anon, authenticated;

-- ----------------------------------------------------------
-- search_professionals — גרסה שמבינה שאילתה בשפה חופשית
-- ----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.search_professionals(p_term text DEFAULT NULL::text, p_profession_ids uuid[] DEFAULT NULL::uuid[], p_city_id uuid DEFAULT NULL::uuid, p_max_distance_km integer DEFAULT NULL::integer, p_price_min numeric DEFAULT NULL::numeric, p_price_max numeric DEFAULT NULL::numeric, p_min_rating numeric DEFAULT NULL::numeric, p_min_experience integer DEFAULT NULL::integer, p_home_visit boolean DEFAULT NULL::boolean, p_studio boolean DEFAULT NULL::boolean, p_event boolean DEFAULT NULL::boolean, p_online boolean DEFAULT NULL::boolean, p_available_today boolean DEFAULT NULL::boolean, p_available_now boolean DEFAULT NULL::boolean, p_recurring boolean DEFAULT NULL::boolean, p_verified boolean DEFAULT NULL::boolean, p_sort text DEFAULT 'recommended'::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, profile_id uuid, username text, full_name text, business_name text, headline text, avatar_url text, cover_url text, city_id uuid, city_name text, rating_avg numeric, rating_count integer, followers_count integer, completed_bookings_count integer, years_experience integer, is_verified boolean, available_today boolean, available_now boolean, accepts_home_visits boolean, accepts_studio boolean, accepts_events boolean, response_time_minutes integer, min_price numeric, professions jsonb, distance_km double precision, published_at timestamp with time zone, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  with ref as (
    select c.latitude as lat, c.longitude as lng from public.cities c where c.id = p_city_id
  ),
  -- העיר שמוזכרת בתוך מחרוזת החיפוש עצמה ("...בחדרה"), אם יש כזו.
  term_city as (
    select public.search_city(p_term) as id
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
      -- מחרוזת חיפוש חופשית: כל מילה משמעותית חייבת להתאים במקום כלשהו,
      -- או שההתאמה מתקבלת מדמיון שם. מילות כוונה (הביתה/היום/לאירוע)
      -- מטופלות למטה כמסננים ולא כמילים שדורשות התאמה טקסטואלית.
      (p_term is null or trim(p_term) = ''
        or b.name_score > 0.12
        or (
          select bool_and(
            public.professional_matches_word(b.id, w)
            or (public.search_wants_home(p_term)     and w in ('הביתה','בבית','לבית','הבית'))
            or (public.search_wants_today(p_term)    and w in ('היום','עכשיו','מיד','פנוי','פנויה','דחוף'))
            or (public.search_wants_event(p_term)    and w in ('אירוע','לאירוע','חתונה','ערב','מצווה'))
            or (public.search_wants_recurring(p_term) and w in ('קבוע','קבועה','חוזר','שבועיים','שבוע','חודש'))
            or (public.word_is_city(w, (select id from term_city)))
          )
          from unnest(public.search_tokens(p_term)) as w
        )
      )
      -- מסננים משתמעים מהניסוח החופשי
      and (not public.search_wants_home(coalesce(p_term, ''))     or b.accepts_home_visits)
      and (not public.search_wants_event(coalesce(p_term, ''))    or b.accepts_events)
      and (not public.search_wants_today(coalesce(p_term, ''))    or b.available_today or b.available_now)
      and (p_profession_ids is null or array_length(p_profession_ids, 1) is null or exists (
            select 1 from public.professional_professions ppf
            where ppf.professional_id = b.id and ppf.profession_id = any (p_profession_ids)))
      and (
        coalesce(p_city_id, (select id from term_city)) is null
        or b.city_id = coalesce(p_city_id, (select id from term_city))
        or exists (select 1 from public.service_areas sa
                    where sa.professional_id = b.id and sa.city_id = coalesce(p_city_id, (select id from term_city)))
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
$function$;

grant execute on function public.search_professionals(text, uuid[], uuid, integer, numeric, numeric,
  numeric, integer, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean,
  text, integer, integer) to anon, authenticated;

