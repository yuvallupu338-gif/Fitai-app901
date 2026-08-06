-- ==========================================================
--  הרשמה מינימלית
--
--  ההרשמה מבקשת עכשיו רק את מה שבאמת הכרחי: שם, שם משתמש וסיסמה
--  שהמשתמש ממציא. העיר עברה להגדרות הפרופיל, וההפיכה לבעל עסק
--  נעשית מאוחר יותר מתוך ההגדרות ולא בסיום ההרשמה.
--
--  ‎profiles.city_id‎ כבר מוגדר כ־nullable, ולכן אין שינוי סכמה —
--  רק הפונקציה מפסיקה לדרוש עיר.
-- ==========================================================

set search_path = public, extensions;

create or replace function public.auth_register(
  p_full_name  text,
  p_username   text,
  p_city_id    uuid default null,
  p_password   text default null,
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
    raise exception 'יש להזין שם';
  end if;

  if p_username !~ '^[A-Za-zא-ת0-9_.]{3,30}$' then
    raise exception 'שם המשתמש חייב להכיל 3–30 תווים (אותיות, ספרות, קו תחתון או נקודה)';
  end if;

  if not public.username_available(p_username) then
    raise exception 'שם המשתמש כבר תפוס';
  end if;

  -- העיר אינה חובה בהרשמה. אם נשלחה — היא חייבת להיות אמיתית.
  if p_city_id is not null and not exists (select 1 from public.cities where id = p_city_id) then
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

grant execute on function public.auth_register(text, text, uuid, text, text, date) to anon, authenticated;
