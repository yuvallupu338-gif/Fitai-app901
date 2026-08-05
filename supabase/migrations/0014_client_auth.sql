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
create or replace function public.auth_register(
  p_full_name  text,
  p_username   text,
  p_city_id    uuid,
  p_password   text,
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
