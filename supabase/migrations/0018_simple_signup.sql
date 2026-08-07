-- ==========================================================
--  הרשמה בשני שדות
--
--  ההרשמה ביקשה שם מלא *וגם* שם משתמש — שני שדות שנראים כמעט זהים
--  ומבלבלים. עכשיו מספיק שם אחד וסיסמה אחת, ושם המשתמש נגזר מהשם
--  אוטומטית כאן, במסד, כדי שבדיקת הייחודיות והיצירה יקרו יחד ולא
--  ייווצר מצב שבו שני אנשים תופסים את אותו שם באותו רגע.
-- ==========================================================

set search_path = public, extensions;

/**
 * גוזר שם משתמש תקין מתוך שם חופשי.
 * רווחים הופכים לקו תחתון, תווים לא חוקיים מושמטים, והתוצאה
 * מקוצרת לאורך המותר. אינו מבטיח ייחודיות — לכך יש ‎derive_username‎.
 */
create or replace function public.slugify_username(p_name text)
returns text
language sql
immutable
as $$
  select left(
    regexp_replace(
      regexp_replace(btrim(coalesce(p_name, '')), '\s+', '_', 'g'),
      '[^A-Za-zא-ת0-9_.]', '', 'g'),
    24);
$$;

/**
 * מחזיר שם משתמש פנוי שנגזר מהשם שהוזן.
 * אם השם תפוס — נוספת ספרה, וכך הלאה. אם אי אפשר לגזור שם תקין
 * (למשל שם באמוג׳י בלבד) — נוצר שם ניטרלי עם מספר.
 */
create or replace function public.derive_username(p_name text)
returns text
language plpgsql
as $$
declare
  v_base      text := public.slugify_username(p_name);
  v_candidate text;
  v_suffix    int := 1;
begin
  if length(v_base) < 3 then
    v_base := 'user';
  end if;

  v_candidate := v_base;

  while exists (select 1 from public.usernames u where u.username = v_candidate::citext) loop
    v_suffix := v_suffix + 1;
    v_candidate := left(v_base, 24) || v_suffix::text;
  end loop;

  return v_candidate;
end;
$$;

/**
 * הרשמה בשני שדות: שם וסיסמה.
 *
 * מחזירה בין השאר את שם המשתמש שנגזר, כדי שאפשר יהיה להציג אותו
 * למשתמש — זה מה שהוא יזין בהתחברות הבאה.
 */
create or replace function public.auth_register_simple(p_name text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text;
  v_result   jsonb;
begin
  p_name := btrim(coalesce(p_name, ''));

  if length(p_name) < 2 then
    raise exception 'יש להזין שם';
  end if;
  if length(p_name) > 80 then
    raise exception 'השם ארוך מדי';
  end if;

  v_username := public.derive_username(p_name);
  v_result := public.auth_register(p_name, v_username, null, p_password);

  return v_result || jsonb_build_object('username', v_username);
end;
$$;

grant execute on function public.slugify_username(text)            to anon, authenticated;
grant execute on function public.derive_username(text)             to anon, authenticated;
grant execute on function public.auth_register_simple(text, text)  to anon, authenticated;
