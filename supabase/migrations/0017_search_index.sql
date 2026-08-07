-- ==========================================================
--  אינדוקס החיפוש
--
--  ההתאמה לכל מילה נבדקה מול ארבע טבלאות בנפרד, לכל בעל מקצוע
--  ולכל מילה — עלות שגדלה ליניארית עם מספר בעלי המקצוע.
--
--  כאן כל הטקסט שניתן לחפש בו מרוכז לעמודה אחת שמתוחזקת בטריגרים,
--  ומעליה אינדקס טריגרמות. ההתאמה הופכת לבדיקה אחת על עמודה
--  מאונדקסת במקום עשרות תת־שאילתות.
-- ==========================================================

set search_path = public, extensions;

alter table public.professional_profiles
  add column if not exists search_doc text;

comment on column public.professional_profiles.search_doc is
  'כל הטקסט שניתן לחפש בו, מנורמל. מתוחזק בטריגרים — אין לעדכן ידנית.';

/**
 * בונה את מסמך החיפוש של בעל מקצוע:
 * שם עסק, כותרת, שם אישי, שם משתמש, עיר, אזורי שירות,
 * מקצועות ושמות השירותים.
 */
create or replace function public.build_search_doc(p_professional_id uuid)
returns text
language sql
stable
as $$
  select public.strip_marks(public.normalize_text(
    concat_ws(' ',
      pp.business_name,
      pp.headline,
      pr.full_name,
      pr.username::text,
      ct.name,
      (select string_agg(c2.name, ' ')
         from public.service_areas sa join public.cities c2 on c2.id = sa.city_id
        where sa.professional_id = pp.id),
      (select string_agg(pf.name, ' ')
         from public.professional_professions ppf
         join public.professions pf on pf.id = ppf.profession_id
        where ppf.professional_id = pp.id),
      (select string_agg(concat_ws(' ', s.name, s.description), ' ')
         from public.professional_services s
        where s.professional_id = pp.id and s.is_active and s.deleted_at is null)
    )))
  from public.professional_profiles pp
  join public.profiles pr on pr.id = pp.profile_id
  left join public.cities ct on ct.id = pp.city_id
  where pp.id = p_professional_id;
$$;

/** מרענן את מסמך החיפוש של בעל מקצוע אחד. */
create or replace function public.refresh_search_doc(p_professional_id uuid)
returns void
language sql
as $$
  update public.professional_profiles
     set search_doc = public.build_search_doc(p_professional_id)
   where id = p_professional_id
     and search_doc is distinct from public.build_search_doc(p_professional_id);
$$;

/* ---------- טריגרים ---------- */

/** שינוי בטבלאות הבת מרענן את המסמך של בעל המקצוע. */
create or replace function public.touch_search_doc_from_child()
returns trigger
language plpgsql
as $$
begin
  perform public.refresh_search_doc(coalesce(new.professional_id, old.professional_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_search_doc_professions on public.professional_professions;
create trigger trg_search_doc_professions
  after insert or update or delete on public.professional_professions
  for each row execute function public.touch_search_doc_from_child();

drop trigger if exists trg_search_doc_services on public.professional_services;
create trigger trg_search_doc_services
  after insert or update or delete on public.professional_services
  for each row execute function public.touch_search_doc_from_child();

drop trigger if exists trg_search_doc_areas on public.service_areas;
create trigger trg_search_doc_areas
  after insert or update or delete on public.service_areas
  for each row execute function public.touch_search_doc_from_child();

/**
 * שינוי בפרופיל עצמו. הטריגר הוא AFTER ומעדכן רק כשהמסמך באמת
 * השתנה, ולכן אין לולאה אינסופית.
 */
create or replace function public.touch_search_doc_self()
returns trigger
language plpgsql
as $$
begin
  perform public.refresh_search_doc(new.id);
  return null;
end;
$$;

drop trigger if exists trg_search_doc_self on public.professional_profiles;
create trigger trg_search_doc_self
  after insert or update of business_name, headline, city_id, profile_id
  on public.professional_profiles
  for each row execute function public.touch_search_doc_self();

/** שינוי שם המשתמש או השם המלא מרענן את המסמך של הפרופיל העסקי. */
create or replace function public.touch_search_doc_from_profile()
returns trigger
language plpgsql
as $$
declare
  v_pro uuid;
begin
  select id into v_pro from public.professional_profiles where profile_id = new.id;
  if v_pro is not null then perform public.refresh_search_doc(v_pro); end if;
  return null;
end;
$$;

drop trigger if exists trg_search_doc_from_profile on public.profiles;
create trigger trg_search_doc_from_profile
  after update of full_name, username on public.profiles
  for each row execute function public.touch_search_doc_from_profile();

/* ---------- מילוי ראשוני ואינדקס ---------- */

update public.professional_profiles
   set search_doc = public.build_search_doc(id)
 where search_doc is null;

create index if not exists professional_profiles_search_doc_trgm
  on public.professional_profiles using gin (search_doc extensions.gin_trgm_ops);

/* ---------- התאמת מילה, עכשיו מול עמודה אחת ---------- */

create or replace function public.professional_matches_word(p_professional_id uuid, p_word text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
      from public.professional_profiles pp,
           unnest(public.word_forms(p_word)) as f
     where pp.id = p_professional_id
       and pp.search_doc like '%' || f || '%'
  );
$$;

grant execute on function public.build_search_doc(uuid)   to authenticated;
grant execute on function public.refresh_search_doc(uuid) to authenticated;
