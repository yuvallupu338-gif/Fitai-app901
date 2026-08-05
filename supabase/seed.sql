-- =====================================================================
-- נתוני דוגמה בעברית
-- =====================================================================
-- נועדו אך ורק לתצוגה ראשונית וללימוד המערכת.
-- לאחר ההשקה כל התוכן מגיע מהמשתמשים האמיתיים דרך האפליקציה.
--
-- הסיסמה של כל משתמשי הדוגמה: Demo1234
-- ה־hash נכתב על ידי ‎scripts/db-seed.mjs‎ (אותו אלגוריתם scrypt של האפליקציה).
-- הרצה: npm run db:seed
-- =====================================================================

set search_path = public, extensions;

-- ניקוי נתוני דוגמה קודמים (מזוהים לפי שמות המשתמש)
do $$
declare v_ids uuid[];
begin
  select array_agg(id) into v_ids from public.profiles
  where username in (
    'shirley_hair','dana_makeup','yossi_barber','noa_nails','rami_barber','tal_brows',
    'michal_lashes','avi_hair','liat_cosmetics','maya_events','eden_pedi','oren_beard',
    'sivan_facial','ronit_bride','gal_color','yael_client','amir_client','hila_client',
    'moshe_client','shira_client','admin_yofi'
  );

  if v_ids is not null then
    delete from public.profiles where id = any(v_ids);
  end if;

  -- מחיקת פרופיל מוחקת גם את חברותו בשיחות (cascade), אך השיחה עצמה נשארת.
  -- ניקוי השיחות היתומות מבטיח שהרצה חוזרת של הזריעה תיצור אותן מחדש כראוי.
  delete from public.conversations c
  where not exists (
    select 1 from public.conversation_members cm where cm.conversation_id = c.id
  );
end $$;

-- ---------------------------------------------------------------------
-- משתמשים
-- ---------------------------------------------------------------------
-- SEED_PLACEHOLDER מוחלף ב־hash אמיתי על ידי סקריפט הזריעה.

insert into public.profiles (id, username, full_name, password_hash, city_id, avatar_url, bio, role)
select
  d.id, d.username, d.full_name, 'SEED_PLACEHOLDER',
  (select id from public.cities where name = d.city),
  d.avatar, d.bio, d.role::public.account_role
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'admin_yofi', 'צוות יופי', 'תל אביב-יפו',
   'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&q=80', 'ניהול הקהילה', 'admin'),

  ('a0000000-0000-4000-8000-000000000002'::uuid, 'shirley_hair', 'שירלי אזולאי', 'חדרה',
   'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&q=80',
   'ספרית ומעצבת שיער, מגיעה עד הבית', 'user'),

  ('a0000000-0000-4000-8000-000000000003'::uuid, 'dana_makeup', 'דנה כהן', 'תל אביב-יפו',
   'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=200&q=80',
   'מאפרת כלות ואירועים', 'user'),

  ('a0000000-0000-4000-8000-000000000004'::uuid, 'yossi_barber', 'יוסי מזרחי', 'ראשון לציון',
   'https://images.unsplash.com/photo-1503443207922-dff7d543fd0e?w=200&q=80',
   'ברבר, עיצוב זקן ותער', 'user'),

  ('a0000000-0000-4000-8000-000000000005'::uuid, 'noa_nails', 'נועה לוי', 'נתניה',
   'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&q=80',
   'מניקוריסטית, בנייה ולק ג׳ל', 'user'),

  ('a0000000-0000-4000-8000-000000000006'::uuid, 'rami_barber', 'רמי חדד', 'חיפה',
   'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=80',
   'ברבר שכונתי עם 15 שנות ניסיון', 'user'),

  ('a0000000-0000-4000-8000-000000000007'::uuid, 'tal_brows', 'טל שרון', 'כפר סבא',
   'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?w=200&q=80',
   'מעצבת גבות ולמינציה', 'user'),

  ('a0000000-0000-4000-8000-000000000008'::uuid, 'michal_lashes', 'מיכל ברוך', 'פתח תקווה',
   'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=200&q=80',
   'הרחבות ריסים ולאש ליפט', 'user'),

  ('a0000000-0000-4000-8000-000000000009'::uuid, 'avi_hair', 'אבי פרץ', 'ירושלים',
   'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200&q=80',
   'מעצב שיער גברים ונשים', 'user'),

  ('a0000000-0000-4000-8000-00000000000a'::uuid, 'liat_cosmetics', 'ליאת אברהם', 'רחובות',
   'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80',
   'קוסמטיקאית מוסמכת, טיפולי פנים', 'user'),

  ('a0000000-0000-4000-8000-00000000000b'::uuid, 'maya_events', 'מאיה גולן', 'הרצליה',
   'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=200&q=80',
   'מסרקת ומאפרת לאירועים', 'user'),

  ('a0000000-0000-4000-8000-00000000000c'::uuid, 'eden_pedi', 'עדן מלכה', 'אשדוד',
   'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&q=80',
   'פדיקוריסטית רפואית', 'user'),

  ('a0000000-0000-4000-8000-00000000000d'::uuid, 'oren_beard', 'אורן ביטון', 'באר שבע',
   'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&q=80',
   'ברבר ומעצב זקן', 'user'),

  ('a0000000-0000-4000-8000-00000000000e'::uuid, 'sivan_facial', 'סיון דוד', 'רמת גן',
   'https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=200&q=80',
   'מטפלת פנים, מכשור מתקדם', 'user'),

  ('a0000000-0000-4000-8000-00000000000f'::uuid, 'ronit_bride', 'רונית שמש', 'מודיעין-מכבים-רעות',
   'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200&q=80',
   'מאפרת כלות', 'user'),

  ('a0000000-0000-4000-8000-000000000010'::uuid, 'gal_color', 'גל אוחיון', 'בת ים',
   'https://images.unsplash.com/photo-1521119989659-a83eee488004?w=200&q=80',
   'קולוריסט – בלונדים והחלקות', 'user'),

  -- לקוחות
  ('a0000000-0000-4000-8000-000000000011'::uuid, 'yael_client', 'יעל בן דוד', 'חדרה',
   'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&q=80', null, 'user'),
  ('a0000000-0000-4000-8000-000000000012'::uuid, 'amir_client', 'אמיר נחום', 'ראשון לציון',
   'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80', null, 'user'),
  ('a0000000-0000-4000-8000-000000000013'::uuid, 'hila_client', 'הילה כץ', 'תל אביב-יפו',
   'https://images.unsplash.com/photo-1554151228-14d9def656e4?w=200&q=80', null, 'user'),
  ('a0000000-0000-4000-8000-000000000014'::uuid, 'moshe_client', 'משה אדרי', 'חיפה',
   'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=200&q=80', null, 'user'),
  ('a0000000-0000-4000-8000-000000000015'::uuid, 'shira_client', 'שירה קדוש', 'נתניה',
   'https://images.unsplash.com/photo-1541823709867-1b206113eafd?w=200&q=80', null, 'user')
) as d(id, username, full_name, city, avatar, bio, role);

-- ---------------------------------------------------------------------
-- פרופילים מקצועיים
-- ---------------------------------------------------------------------
insert into public.professional_profiles (
  id, profile_id, business_name, headline, bio, years_experience, city_id,
  avatar_url, cover_url, status, is_verified, phone_verified,
  accepts_home_visits, accepts_studio, accepts_events, accepts_online,
  max_travel_km, travel_fee_type, travel_fee, min_lead_time_minutes, max_lead_time_days,
  cancellation_policy, available_today
)
select
  p.pro_id, pr.id, p.business_name, p.headline, p.bio, p.years, pr.city_id,
  pr.avatar_url, p.cover, 'draft', p.verified, true,
  p.home, p.studio, p.events, false,
  p.travel_km, p.fee_type::public.travel_fee_type, p.fee, 120, 90,
  'ביטול עד 24 שעות לפני המועד ללא עלות. ביטול מאוחר יותר עשוי לחייב בדמי ביטול.',
  p.today
from (values
  ('b0000000-0000-4000-8000-000000000002'::uuid, 'shirley_hair', 'שירלי עיצוב שיער',
   'ספרית ומעצבת שיער – מגיעה עד הבית באזור חדרה והשרון',
   'שלום! אני שירלי, ספרית כבר 12 שנה. אני מתמחה בתספורות נשים, פן, צבע והחלקות. אני מגיעה עם כל הציוד עד אליכם הביתה, כדי שתוכלו ליהנות מטיפול מקצועי בלי לצאת מהבית. עובדת עם מוצרים איכותיים בלבד.',
   12, 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1200&q=80', true, true, true, true, false, 40, 'fixed', 20, true),

  ('b0000000-0000-4000-8000-000000000003'::uuid, 'dana_makeup', 'דנה כהן איפור',
   'מאפרת כלות ואירועים · תל אביב והמרכז',
   'איפור זה לא רק צבעים – זה להרגיש הכי יפה שיש. אני מאפרת כלות, ערב וצילומים כבר 8 שנים. מגיעה עד אליכן, כולל לאולם ולסטודיו לצילום.',
   8, 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=1200&q=80', true, true, false, true, false, 60, 'per_km', 2, true),

  ('b0000000-0000-4000-8000-000000000004'::uuid, 'yossi_barber', 'יוסי ברבר שופ',
   'ברבר · תספורות גברים, עיצוב זקן ותער חם',
   'ברבר שופ קלאסי בראשון לציון. תספורת, זקן, תער חם וטיפוח. אפשר גם שאגיע עד הבית לתספורת מהירה.',
   6, 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1200&q=80', false, true, true, false, false, 25, 'fixed', 30, true),

  ('b0000000-0000-4000-8000-000000000005'::uuid, 'noa_nails', 'נועה ניילס',
   'מניקוריסטית · בנייה, לק ג׳ל ועיצובים',
   'בונה ציפורניים ומעצבת כבר 5 שנים. עובדת בסטודיו ביתי נעים בנתניה, וגם מגיעה לבתים ולאירועים.',
   5, 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=1200&q=80', true, true, true, true, false, 30, 'fixed', 25, true),

  ('b0000000-0000-4000-8000-000000000006'::uuid, 'rami_barber', 'רמי ברבר',
   'ברבר ותיק בחיפה · 15 שנות ניסיון',
   'תספורות גברים וילדים, עיצוב זקן, גילוח בתער. מקבל בסטודיו וגם מגיע לבתי לקוחות מבוגרים.',
   15, 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=1200&q=80', false, true, true, false, false, 20, 'fixed', 25, false),

  ('b0000000-0000-4000-8000-000000000007'::uuid, 'tal_brows', 'טל עיצוב גבות',
   'מעצבת גבות · שיזוף, למינציה וחיטוב',
   'הגבות הן המסגרת של הפנים. אני עובדת בשיטת חוט ובשעווה, כולל למינציה וצביעה. מגיעה עד הבית בכפר סבא והסביבה.',
   4, 'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=1200&q=80', false, true, true, false, false, 25, 'none', 0, true),

  ('b0000000-0000-4000-8000-000000000008'::uuid, 'michal_lashes', 'מיכל ריסים',
   'מעצבת ריסים · הרחבות, לאש ליפט ולמינציה',
   'מומחית להרחבות ריסים בשיטת קלאסי, וולום ומגה וולום. עובדת בסטודיו מעוצב בפתח תקווה.',
   7, 'https://images.unsplash.com/photo-1595475207225-428b62bda831?w=1200&q=80', true, false, true, false, false, null, 'none', 0, false),

  ('b0000000-0000-4000-8000-000000000009'::uuid, 'avi_hair', 'אבי סטייל',
   'מעצב שיער · נשים וגברים בירושלים',
   'עיצוב שיער לכל המשפחה. תספורות, צבע, פן ותסרוקות ערב. מקבל בסטודיו במרכז העיר.',
   10, 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=1200&q=80', false, true, true, true, false, 30, 'fixed', 25, true),

  ('b0000000-0000-4000-8000-00000000000a'::uuid, 'liat_cosmetics', 'ליאת קוסמטיקס',
   'קוסמטיקאית מוסמכת · טיפולי פנים והסרת שיער',
   'טיפולי פנים מותאמים אישית, פילינג, ניקוי עמוק והסרת שיער בשעווה. עובדת עם מוצרים מקצועיים בלבד.',
   9, 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1200&q=80', true, true, true, false, false, 20, 'fixed', 20, false),

  ('b0000000-0000-4000-8000-00000000000b'::uuid, 'maya_events', 'מאיה תסרוקות ואיפור',
   'מסרקת ומאפרת לאירועים · הרצליה והשרון',
   'תסרוקות ערב, כלות ובנות מצווה. מגיעה עם צוות לאירועים גדולים.',
   11, 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=1200&q=80', true, true, false, true, false, 70, 'per_km', 3, true),

  ('b0000000-0000-4000-8000-00000000000c'::uuid, 'eden_pedi', 'עדן פדיקור',
   'פדיקוריסטית רפואית · אשדוד והסביבה',
   'פדיקור רפואי מקצועי, טיפול ביבלות, ציפורן חודרנית ופטרת. מגיעה גם לבתים ולמוסדות.',
   6, 'https://images.unsplash.com/photo-1519415510236-718bdfcd89c8?w=1200&q=80', false, true, true, false, false, 30, 'fixed', 20, true),

  ('b0000000-0000-4000-8000-00000000000d'::uuid, 'oren_beard', 'אורן ברבר',
   'ברבר ומעצב זקן · באר שבע',
   'תספורות גברים מודרניות ועיצוב זקן מדויק. אווירה טובה ומוזיקה טובה.',
   8, 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1200&q=80', false, false, true, false, false, null, 'none', 0, false),

  ('b0000000-0000-4000-8000-00000000000e'::uuid, 'sivan_facial', 'סיון טיפולי פנים',
   'מטפלת פנים · מכשור מתקדם ואנטי אייג׳ינג',
   'טיפולי פנים מתקדמים עם מכשור: רדיו פרקוונסי, אולטרסאונד והידרו פיל. תוצאות אמיתיות.',
   13, 'https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?w=1200&q=80', true, false, true, false, false, null, 'none', 0, true),

  ('b0000000-0000-4000-8000-00000000000f'::uuid, 'ronit_bride', 'רונית איפור כלות',
   'מאפרת כלות · מודיעין והסביבה',
   'מלווה כלות מהניסיון ועד היום הגדול. איפור עמיד שנשאר מושלם לאורך כל האירוע.',
   14, 'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=1200&q=80', true, true, false, true, false, 80, 'per_km', 2.5, false),

  ('b0000000-0000-4000-8000-000000000010'::uuid, 'gal_color', 'גל קולור',
   'קולוריסט · בלונדים, בליאז׳ והחלקות',
   'מתמחה בבלונדים מורכבים, בליאז׳, אירגון והחלקות. אבחון צבע חינם לפני כל טיפול.',
   9, 'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=1200&q=80', false, true, true, false, false, 25, 'fixed', 25, true)
) as p(pro_id, username, business_name, headline, bio, years, cover, verified, home, studio, events, online, travel_km, fee_type, fee, today)
join public.profiles pr on pr.username = p.username;

-- פרטי קשר פרטיים
insert into public.professional_contact_details (professional_id, phone, studio_address)
select pp.id,
       '05' || (2 + (row_number() over (order by pp.created_at)) % 8)::text || '-' ||
       lpad(((row_number() over (order by pp.created_at)) * 1234567 % 10000000)::text, 7, '0'),
       case when pp.accepts_studio then 'רחוב הרצל ' || (10 + (row_number() over (order by pp.created_at)))::text end
from public.professional_profiles pp;

-- ---------------------------------------------------------------------
-- שיוך מקצועות
-- ---------------------------------------------------------------------
insert into public.professional_professions (professional_id, profession_id, is_primary)
select pp.id, pf.id, m.primary_flag
from (values
  ('shirley_hair', 'barber-hair', true), ('shirley_hair', 'hair-stylist', false),
  ('dana_makeup', 'makeup-artist', true), ('dana_makeup', 'event-hair', false),
  ('yossi_barber', 'barber', true),
  ('noa_nails', 'manicurist', true), ('noa_nails', 'pedicurist', false),
  ('rami_barber', 'barber', true),
  ('tal_brows', 'brow-artist', true),
  ('michal_lashes', 'lash-artist', true),
  ('avi_hair', 'hair-stylist', true), ('avi_hair', 'barber-hair', false),
  ('liat_cosmetics', 'cosmetician', true), ('liat_cosmetics', 'facial-therapist', false),
  ('maya_events', 'event-hair', true), ('maya_events', 'makeup-artist', false),
  ('eden_pedi', 'pedicurist', true),
  ('oren_beard', 'barber', true),
  ('sivan_facial', 'facial-therapist', true), ('sivan_facial', 'cosmetician', false),
  ('ronit_bride', 'makeup-artist', true),
  ('gal_color', 'hair-stylist', true)
) as m(username, slug, primary_flag)
join public.profiles pr on pr.username = m.username
join public.professional_profiles pp on pp.profile_id = pr.id
join public.professions pf on pf.slug = m.slug;

-- ---------------------------------------------------------------------
-- שירותים ומחירים
-- ---------------------------------------------------------------------
insert into public.professional_services (
  professional_id, name, description, price_type, price_min, price_max,
  duration_minutes, buffer_minutes, at_client_home, at_studio, at_event, supports_recurring
)
select pp.id, s.name, s.description, s.price_type::public.price_type, s.price_min, s.price_max,
       s.duration, s.buffer, s.home, s.studio, s.event, s.recurring
from (values
  ('shirley_hair', 'תספורת נשים + פן', 'תספורת מותאמת אישית כולל שטיפה ופן מעוצב', 'fixed', 160, null, 75, 15, true, true, false, true),
  ('shirley_hair', 'צבע שורש', 'צבע שורש עם גוון מותאם, כולל שטיפה', 'range', 220, 320, 120, 20, true, true, false, true),
  ('shirley_hair', 'החלקה אורגנית', 'החלקה ללא פורמלין, מחליקה ומזינה', 'range', 600, 900, 180, 30, false, true, false, false),
  ('shirley_hair', 'פן מעוצב', 'פן חלק או גלי לאירוע', 'fixed', 90, null, 45, 10, true, true, true, true),

  ('dana_makeup', 'איפור ערב', 'איפור מלא לאירוע כולל ריסים', 'fixed', 350, null, 75, 20, true, false, true, false),
  ('dana_makeup', 'איפור כלה', 'ניסיון + איפור ביום החתונה', 'range', 1200, 1800, 150, 30, true, false, true, false),
  ('dana_makeup', 'איפור לצילומים', 'איפור מותאם למצלמה', 'fixed', 450, null, 90, 20, true, false, true, false),

  ('yossi_barber', 'תספורת גברים', 'תספורת מכונה ומספריים כולל שטיפה', 'fixed', 70, null, 30, 10, true, true, false, true),
  ('yossi_barber', 'תספורת + זקן', 'תספורת מלאה ועיצוב זקן', 'fixed', 110, null, 45, 10, true, true, false, true),
  ('yossi_barber', 'גילוח בתער חם', 'גילוח קלאסי עם מגבת חמה', 'fixed', 60, null, 30, 10, false, true, false, true),

  ('noa_nails', 'מניקור לק ג׳ל', 'מניקור מלא עם לק ג׳ל בצבע לבחירה', 'fixed', 140, null, 75, 15, true, true, false, true),
  ('noa_nails', 'בניית ציפורניים', 'בנייה בג׳ל כולל עיצוב', 'range', 220, 300, 120, 20, false, true, false, true),
  ('noa_nails', 'מילוי', 'מילוי לבנייה קיימת', 'fixed', 160, null, 90, 15, false, true, false, true),
  ('noa_nails', 'פדיקור + לק ג׳ל', 'פדיקור קוסמטי מלא', 'fixed', 170, null, 75, 15, true, true, false, true),

  ('rami_barber', 'תספורת גברים', 'תספורת קלאסית', 'fixed', 60, null, 30, 10, true, true, false, true),
  ('rami_barber', 'תספורת ילדים', 'תספורת בסבלנות לילדים', 'fixed', 50, null, 25, 10, true, true, false, true),

  ('tal_brows', 'עיצוב גבות', 'עיצוב בחוט או בשעווה', 'fixed', 70, null, 30, 10, true, true, false, true),
  ('tal_brows', 'למינציה לגבות', 'יישור וסידור השערות לאורך זמן', 'fixed', 250, null, 60, 15, false, true, false, false),
  ('tal_brows', 'עיצוב + צביעה', 'עיצוב מלא כולל צביעה', 'fixed', 110, null, 45, 10, true, true, false, true),

  ('michal_lashes', 'הרחבות ריסים קלאסי', 'שיטת אחת על אחת', 'fixed', 350, null, 120, 20, false, true, false, false),
  ('michal_lashes', 'מילוי ריסים', 'מילוי עד שלושה שבועות', 'fixed', 200, null, 75, 15, false, true, false, true),
  ('michal_lashes', 'לאש ליפט', 'הרמת ריסים טבעיים כולל צביעה', 'fixed', 280, null, 60, 15, false, true, false, false),

  ('avi_hair', 'תספורת גברים', 'תספורת ועיצוב', 'fixed', 80, null, 35, 10, true, true, false, true),
  ('avi_hair', 'תספורת נשים', 'תספורת ופן', 'fixed', 150, null, 60, 15, true, true, false, true),
  ('avi_hair', 'תסרוקת ערב', 'תסרוקת מעוצבת לאירוע', 'range', 250, 400, 75, 20, true, true, true, false),

  ('liat_cosmetics', 'טיפול פנים קלאסי', 'ניקוי עמוק, עיסוי ומסכה', 'fixed', 280, null, 75, 15, true, true, false, true),
  ('liat_cosmetics', 'פילינג כימי', 'חידוש העור והבהרת כתמים', 'range', 350, 500, 60, 20, false, true, false, false),
  ('liat_cosmetics', 'הסרת שיער בשעווה', 'רגליים מלאות או בהתאמה', 'range', 80, 200, 45, 10, true, true, false, true),

  ('maya_events', 'תסרוקת ערב', 'תסרוקת מעוצבת לאירוע', 'fixed', 320, null, 60, 20, true, true, true, false),
  ('maya_events', 'חבילת כלה', 'תסרוקת ואיפור ליום החתונה', 'range', 2000, 3000, 180, 30, true, false, true, false),

  ('eden_pedi', 'פדיקור רפואי', 'טיפול מקצועי בכפות הרגליים', 'fixed', 180, null, 60, 15, true, true, false, true),
  ('eden_pedi', 'טיפול ביבלות', 'הסרת יבלות וטיפול ממוקד', 'fixed', 220, null, 45, 15, true, true, false, true),

  ('oren_beard', 'תספורת + עיצוב זקן', 'החבילה המלאה', 'fixed', 100, null, 45, 10, false, true, false, true),
  ('oren_beard', 'עיצוב זקן', 'עיצוב וטיפוח זקן', 'fixed', 50, null, 25, 5, false, true, false, true),

  ('sivan_facial', 'טיפול פנים מכשור', 'רדיו פרקוונסי ואולטרסאונד', 'range', 450, 650, 90, 20, false, true, false, true),
  ('sivan_facial', 'הידרו פיל', 'ניקוי והזנה בטכנולוגיית מים', 'fixed', 520, null, 75, 20, false, true, false, false),

  ('ronit_bride', 'איפור כלה כולל ניסיון', 'פגישת ניסיון ואיפור ביום האירוע', 'range', 1500, 2200, 180, 30, true, false, true, false),
  ('ronit_bride', 'איפור אורחות', 'איפור לאורחות ולבנות משפחה', 'fixed', 280, null, 45, 15, true, false, true, false),

  ('gal_color', 'בליאז׳', 'בליאז׳ מלא כולל טונר', 'range', 750, 1100, 210, 30, false, true, false, false),
  ('gal_color', 'צבע מלא', 'צבע לכל השיער', 'range', 320, 480, 120, 20, false, true, false, true),
  ('gal_color', 'גוונים', 'גוונים לרענון הצבע', 'range', 450, 700, 150, 25, false, true, false, false)
) as s(username, name, description, price_type, price_min, price_max, duration, buffer, home, studio, event, recurring)
join public.profiles pr on pr.username = s.username
join public.professional_profiles pp on pp.profile_id = pr.id;

-- ---------------------------------------------------------------------
-- אזורי שירות
-- ---------------------------------------------------------------------
insert into public.service_areas (professional_id, city_id)
select pp.id, c.id
from public.professional_profiles pp
join public.cities c on c.id = pp.city_id
on conflict do nothing;

insert into public.service_areas (professional_id, city_id)
select pp.id, c.id
from public.professional_profiles pp
join public.profiles pr on pr.id = pp.profile_id
join lateral (
  select c2.id from public.cities c2
  where c2.id <> pp.city_id
    and public.haversine_km(
      (select latitude from public.cities where id = pp.city_id),
      (select longitude from public.cities where id = pp.city_id),
      c2.latitude, c2.longitude
    ) < 25
  limit 5
) c on true
where pp.accepts_home_visits
on conflict do nothing;

-- ---------------------------------------------------------------------
-- שעות פעילות: ראשון–חמישי 09:00–19:00, שישי 09:00–14:00
-- ---------------------------------------------------------------------
insert into public.professional_availability (professional_id, weekday, start_time, end_time, is_break)
select pp.id, d.weekday, d.start_time::time, d.end_time::time, false
from public.professional_profiles pp
cross join (values (0,'09:00','19:00'), (1,'09:00','19:00'), (2,'09:00','19:00'),
                   (3,'09:00','19:00'), (4,'09:00','19:00'), (5,'09:00','14:00')) as d(weekday, start_time, end_time);

-- הפסקת צהריים לימים ראשון–חמישי
insert into public.professional_availability (professional_id, weekday, start_time, end_time, is_break)
select pp.id, d.weekday, '13:00'::time, '13:45'::time, true
from public.professional_profiles pp
cross join (values (0), (1), (2), (3), (4)) as d(weekday);

-- ---------------------------------------------------------------------
-- פוסטים (תיק עבודות)
-- ---------------------------------------------------------------------
insert into public.professional_posts (
  id, professional_id, author_profile_id, service_id, city_id, title, description,
  tags, price_estimate, price_type, duration_minutes, is_before_after, consent_confirmed,
  status, published_at
)
select
  gen_random_uuid(), pp.id, pr.id,
  (select s.id from public.professional_services s
    where s.professional_id = pp.id and s.name = t.service_name limit 1),
  pp.city_id, t.title, t.description, t.tags, t.price, 'fixed', t.duration, false, false,
  'published', now() - (t.days_ago || ' days')::interval
from (values
  ('shirley_hair', 'תספורת נשים + פן', 'בוב קלאסי עם פסים רכים', 'תספורת בוב באורך הסנטר עם שכבות עדינות ופן חלק. מתאים לשיער ישר עד גלי.', array['בוב','תספורת','פן'], 160, 75, 2),
  ('shirley_hair', 'תספורת נשים + פן', 'שכבות ארוכות ונפח', 'תספורת שכבות שמוסיפה תנועה ונפח לשיער דק. הפן נעשה במברשת עגולה.', array['שכבות','נפח'], 160, 75, 5),
  ('shirley_hair', 'צבע שורש', 'צבע שורש בגוון שוקולד', 'כיסוי שורש מלא בגוון חם, כולל טיפול הזנה בסיום.', array['צבע','שוקולד'], 260, 120, 9),
  ('shirley_hair', 'פן מעוצב', 'פן גלי לאירוע', 'גלים רכים שמחזיקים כל הערב.', array['פן','אירוע'], 90, 45, 13),

  ('dana_makeup', 'איפור ערב', 'איפור ערב בגוונים חמים', 'עיניים עשנות בגוון ברונזה עם ליפ נוד. עמיד לכל הלילה.', array['איפור','ערב','ברונזה'], 350, 75, 1),
  ('dana_makeup', 'איפור כלה', 'כלה בסגנון טבעי', 'איפור כלה עדין שמדגיש את התווים הטבעיים. ריסים בודדים.', array['כלה','טבעי'], 1500, 150, 6),
  ('dana_makeup', 'איפור לצילומים', 'איפור לצילומי אופנה', 'איפור נקי עם דגש על עור זוהר, מותאם לתאורת סטודיו.', array['צילומים','אופנה'], 450, 90, 11),

  ('yossi_barber', 'תספורת + זקן', 'פייד גבוה עם זקן מעוצב', 'סקין פייד עם מעבר חלק ועיצוב זקן בקו מדויק.', array['פייד','זקן'], 110, 45, 1),
  ('yossi_barber', 'תספורת גברים', 'קרופ טקסטורלי', 'תספורת קרופ מודרנית עם טקסטורה בחלק העליון.', array['קרופ','גברים'], 70, 30, 4),
  ('yossi_barber', 'גילוח בתער חם', 'גילוח קלאסי בתער', 'מגבת חמה, קצף ותער. חוויה מלאה.', array['תער','גילוח'], 60, 30, 8),

  ('noa_nails', 'מניקור לק ג׳ל', 'לק ג׳ל בגוון ורוד עתיק', 'מניקור מלא עם לק ג׳ל בגוון עדין שמתאים לכל יום.', array['לק ג׳ל','ורוד'], 140, 75, 1),
  ('noa_nails', 'בניית ציפורניים', 'בנייה בצורת בלרינה', 'בנייה בג׳ל בצורת בלרינה עם עיצוב פרנץ׳ מודרני.', array['בנייה','פרנץ׳'], 250, 120, 3),
  ('noa_nails', 'מניקור לק ג׳ל', 'עיצוב כרום', 'אפקט כרום מטאלי שמושך את העין.', array['כרום','עיצוב'], 170, 90, 7),
  ('noa_nails', 'פדיקור + לק ג׳ל', 'פדיקור אדום קלאסי', 'פדיקור מלא עם לק ג׳ל אדום.', array['פדיקור','אדום'], 170, 75, 10),

  ('rami_barber', 'תספורת גברים', 'תספורת קלאסית בצד', 'שביל בצד עם מעבר עדין – קלאסיקה שלא מתיישנת.', array['קלאסי','גברים'], 60, 30, 2),
  ('rami_barber', 'תספורת ילדים', 'תספורת ראשונה', 'תספורת ראשונה לילד בן שנתיים, בסבלנות ובכיף.', array['ילדים'], 50, 25, 6),
  ('rami_barber', 'תספורת גברים', 'בס פייד נקי', 'פייד נמוך עם קו מדויק.', array['פייד'], 60, 30, 12),

  ('tal_brows', 'עיצוב גבות', 'עיצוב גבות בחוט', 'עיצוב מדויק בשיטת החוט – עדין ומהיר.', array['גבות','חוט'], 70, 30, 1),
  ('tal_brows', 'למינציה לגבות', 'למינציה לגבות מלאות', 'יישור וסידור השערות למראה מלא ומסודר לשישה שבועות.', array['למינציה','גבות'], 250, 60, 5),
  ('tal_brows', 'עיצוב + צביעה', 'עיצוב וצביעה בגוון חם', 'עיצוב מלא עם צביעה שמדגישה את המבט.', array['גבות','צביעה'], 110, 45, 9),

  ('michal_lashes', 'הרחבות ריסים קלאסי', 'הרחבות קלאסי טבעי', 'ריס על ריס במראה טבעי ומחמיא.', array['ריסים','קלאסי'], 350, 120, 2),
  ('michal_lashes', 'לאש ליפט', 'לאש ליפט וצביעה', 'הרמת הריסים הטבעיים – בלי הרחבות.', array['לאש ליפט'], 280, 60, 7),
  ('michal_lashes', 'הרחבות ריסים קלאסי', 'וולום 3D', 'מראה מלא ודרמטי לערב.', array['וולום','ריסים'], 420, 150, 14),

  ('avi_hair', 'תספורת נשים', 'תספורת פיקסי', 'תספורת קצרה ומעוצבת עם המון אופי.', array['פיקסי','קצר'], 150, 60, 3),
  ('avi_hair', 'תסרוקת ערב', 'תסרוקת אסופה', 'אסוף נמוך רך עם גדילים משוחררים.', array['תסרוקת','ערב'], 300, 75, 8),
  ('avi_hair', 'תספורת גברים', 'תספורת גברים מסודרת', 'תספורת יומיומית עם קווים נקיים.', array['גברים'], 80, 35, 15),

  ('liat_cosmetics', 'טיפול פנים קלאסי', 'טיפול פנים לעור רגיש', 'ניקוי עדין, מסכה מרגיעה ולחות עמוקה.', array['פנים','רגיש'], 280, 75, 2),
  ('liat_cosmetics', 'פילינג כימי', 'פילינג להבהרת כתמים', 'סדרת פילינג לטיפול בכתמי שמש.', array['פילינג','כתמים'], 400, 60, 9),
  ('liat_cosmetics', 'טיפול פנים קלאסי', 'ניקוי עמוק לעור שמן', 'טיפול ממוקד לעור שמן ונקבוביות.', array['ניקוי','שמן'], 280, 75, 16),

  ('maya_events', 'תסרוקת ערב', 'תסרוקת בת מצווה', 'תסרוקת חצי אסוף עם גלים ואקססוריז.', array['בת מצווה','תסרוקת'], 320, 60, 4),
  ('maya_events', 'חבילת כלה', 'חבילת כלה מלאה', 'תסרוקת ואיפור מהבוקר ועד הקבלת פנים.', array['כלה','חבילה'], 2400, 180, 10),
  ('maya_events', 'תסרוקת ערב', 'תסרוקת אורחת', 'גלים הוליוודיים לאורחת באירוע.', array['ערב','גלים'], 320, 60, 17),

  ('eden_pedi', 'פדיקור רפואי', 'פדיקור רפואי מלא', 'טיפול יסודי בכפות הרגליים כולל טיפוח.', array['פדיקור','רפואי'], 180, 60, 3),
  ('eden_pedi', 'טיפול ביבלות', 'טיפול בציפורן חודרנית', 'טיפול מקצועי ומדויק להקלה מיידית.', array['ציפורן','טיפול'], 220, 45, 11),
  ('eden_pedi', 'פדיקור רפואי', 'פדיקור לסוכרתיים', 'טיפול זהיר ומותאם.', array['פדיקור','סוכרת'], 200, 60, 18),

  ('oren_beard', 'תספורת + עיצוב זקן', 'זקן מעוצב עם קווים חדים', 'עיצוב זקן מדויק כולל תער בקווים.', array['זקן','עיצוב'], 100, 45, 2),
  ('oren_beard', 'עיצוב זקן', 'טיפוח זקן ארוך', 'עיצוב וטיפוח לזקן ארוך כולל שמן.', array['זקן','ארוך'], 50, 25, 8),
  ('oren_beard', 'תספורת + עיצוב זקן', 'החבילה המלאה', 'תספורת וזקן במחיר משתלם.', array['חבילה'], 100, 45, 15),

  ('sivan_facial', 'טיפול פנים מכשור', 'רדיו פרקוונסי למתיחת עור', 'טיפול לא פולשני להידוק העור.', array['אנטי אייג׳ינג','מכשור'], 550, 90, 1),
  ('sivan_facial', 'הידרו פיל', 'הידרו פיל לזוהר', 'ניקוי והזנה בטכנולוגיית מים – עור זוהר מיד.', array['הידרו פיל','זוהר'], 520, 75, 6),
  ('sivan_facial', 'טיפול פנים מכשור', 'אולטרסאונד להחדרת חומרים', 'החדרה עמוקה של חומרים פעילים.', array['אולטרסאונד'], 480, 90, 12),

  ('ronit_bride', 'איפור כלה כולל ניסיון', 'כלה בסגנון רומנטי', 'איפור רומנטי בגווני ורוד ואפרסק.', array['כלה','רומנטי'], 1800, 180, 3),
  ('ronit_bride', 'איפור אורחות', 'איפור לאם הכלה', 'איפור מכובד ומחמיא שמחזיק כל הערב.', array['אורחות'], 280, 45, 9),
  ('ronit_bride', 'איפור כלה כולל ניסיון', 'כלה בסגנון גלאם', 'איפור נוצץ עם עיניים דרמטיות.', array['כלה','גלאם'], 2000, 180, 16),

  ('gal_color', 'בליאז׳', 'בליאז׳ בלונד קרמל', 'מעבר רך מהשורש לקצוות בגוון קרמל.', array['בליאז׳','בלונד'], 950, 210, 1),
  ('gal_color', 'צבע מלא', 'אדום נחושת', 'צבע מלא בגוון נחושת עשיר.', array['צבע','נחושת'], 400, 120, 7),
  ('gal_color', 'גוונים', 'גוונים לרענון', 'גוונים דקים לרענון הבלונד.', array['גוונים'], 550, 150, 13)
) as t(username, service_name, title, description, tags, price, duration, days_ago)
join public.profiles pr on pr.username = t.username
join public.professional_profiles pp on pp.profile_id = pr.id;

-- מדיה לכל פוסט (שלוש תמונות)
insert into public.post_media (post_id, url, media_type, position, alt_text)
select pt.id,
       'https://images.unsplash.com/' || m.photo || '?w=1000&q=80',
       'image', m.position, pt.title
from public.professional_posts pt
cross join lateral (
  select * from (values
    (0, (array[
      'photo-1560066984-138dadb4c035','photo-1595475207225-428b62bda831','photo-1522337360788-8b13dee7a37e',
      'photo-1604654894610-df63bc536371','photo-1516975080664-ed2fc6a32937','photo-1570172619644-dfd03ed5d881'
    ])[1 + (abs(hashtext(pt.id::text)) % 6)]),
    (1, (array[
      'photo-1519699047748-de8e457a634e','photo-1503951914875-452162b0f3f1','photo-1562322140-8baeececf3df',
      'photo-1512290923902-8a9f81dc236c','photo-1596462502278-27bfdc403348','photo-1585747860715-2ba37e788b70'
    ])[1 + (abs(hashtext(pt.id::text || 'b')) % 6)]),
    (2, (array[
      'photo-1521590832167-7bcbfaa6381f','photo-1487412947147-5cebf100ffc2','photo-1519415510236-718bdfcd89c8',
      'photo-1622286342621-4bd786c2447c','photo-1524504388940-b1c1722653e1','photo-1560869713-7d0a29430803'
    ])[1 + (abs(hashtext(pt.id::text || 'c')) % 6)])
  ) as x(position, photo)
) m;

-- ---------------------------------------------------------------------
-- פרסום כל הפרופילים המקצועיים (עכשיו כשיש תיק עבודות)
-- ---------------------------------------------------------------------
update public.professional_profiles set status = 'active';
update public.profiles set active_mode = 'professional' where is_professional;

-- ---------------------------------------------------------------------
-- מעקב, לייקים, תגובות ושמירות
-- ---------------------------------------------------------------------
insert into public.follows (follower_id, following_id)
select f.id, t.id
from public.profiles f
cross join public.profiles t
where f.id <> t.id
  and t.is_professional
  and (abs(hashtext(f.username || t.username)) % 100) < 45
on conflict do nothing;

insert into public.post_likes (post_id, profile_id)
select pt.id, pr.id
from public.professional_posts pt
cross join public.profiles pr
where pr.id <> pt.author_profile_id
  and (abs(hashtext(pt.id::text || pr.username)) % 100) < 40
on conflict do nothing;

insert into public.post_comments (post_id, profile_id, body)
select pt.id, pr.id, c.body
from public.professional_posts pt
join lateral (
  select pr2.id from public.profiles pr2
  where pr2.id <> pt.author_profile_id
  order by hashtext(pt.id::text || pr2.username)
  limit 2
) pr on true
cross join lateral (
  select (array[
    'מהמם! ממש אהבתי 😍',
    'איזה יופי, כמה זמן לוקח הטיפול?',
    'עשית לי את זה בשבוע שעבר ואני עדיין מקבלת מחמאות',
    'אפשר לקבל פרטים על המחיר?',
    'עבודה נקייה ומדויקת 👏',
    'זה בדיוק מה שחיפשתי, אפשר לתאם?'
  ])[1 + (abs(hashtext(pt.id::text || pr.id::text)) % 6)] as body
) c;

insert into public.saved_posts (profile_id, post_id)
select pr.id, pt.id
from public.profiles pr
cross join public.professional_posts pt
where (abs(hashtext(pr.username || pt.id::text)) % 100) < 12
on conflict do nothing;

insert into public.saved_professionals (profile_id, professional_id)
select pr.id, pp.id
from public.profiles pr
cross join public.professional_profiles pp
where pp.profile_id <> pr.id
  and (abs(hashtext(pr.username || pp.id::text)) % 100) < 20
on conflict do nothing;

-- ---------------------------------------------------------------------
-- כתובות לקוחות
-- ---------------------------------------------------------------------
insert into public.service_addresses (id, profile_id, label, city_id, street, house_number, apartment, floor, has_parking, is_default)
select a.id, pr.id, 'הבית שלי', pr.city_id, a.street, a.house, a.apartment, a.floor, a.parking, true
from (values
  ('c0000000-0000-4000-8000-000000000011'::uuid, 'yael_client', 'הרצל', '15', '4', '2', true),
  ('c0000000-0000-4000-8000-000000000012'::uuid, 'amir_client', 'ז׳בוטינסקי', '42', '12', '3', false),
  ('c0000000-0000-4000-8000-000000000013'::uuid, 'hila_client', 'דיזנגוף', '108', '7', '2', false),
  ('c0000000-0000-4000-8000-000000000014'::uuid, 'moshe_client', 'הנביאים', '23', '1', '1', true),
  ('c0000000-0000-4000-8000-000000000015'::uuid, 'shira_client', 'ויצמן', '61', '9', '4', true)
) as a(id, username, street, house, apartment, floor, parking)
join public.profiles pr on pr.username = a.username;

-- ---------------------------------------------------------------------
-- הזמנות: היסטוריה, ממתינות ועתידיות
-- ---------------------------------------------------------------------
-- הזמנות שהושלמו (מאפשרות ביקורות)
insert into public.bookings (
  id, client_id, professional_id, service_id, address_id, location_type, status,
  scheduled_start, scheduled_end, duration_minutes, buffer_minutes,
  price_type, price_amount, travel_fee, completed_at, confirmed_at
)
select
  b.id, cl.id, pp.id, s.id, addr.id, 'client_home', 'completed',
  now() - (b.days_ago || ' days')::interval,
  now() - (b.days_ago || ' days')::interval + (s.duration_minutes || ' minutes')::interval,
  s.duration_minutes, s.buffer_minutes,
  'fixed', s.price_min, 20,
  now() - (b.days_ago || ' days')::interval,
  now() - ((b.days_ago + 2) || ' days')::interval
from (values
  ('d0000000-0000-4000-8000-000000000001'::uuid, 'yael_client', 'shirley_hair', 'תספורת נשים + פן', 21),
  ('d0000000-0000-4000-8000-000000000002'::uuid, 'yael_client', 'shirley_hair', 'תספורת נשים + פן', 7),
  ('d0000000-0000-4000-8000-000000000003'::uuid, 'amir_client', 'yossi_barber', 'תספורת + זקן', 14),
  ('d0000000-0000-4000-8000-000000000004'::uuid, 'hila_client', 'dana_makeup', 'איפור ערב', 30),
  ('d0000000-0000-4000-8000-000000000005'::uuid, 'shira_client', 'noa_nails', 'מניקור לק ג׳ל', 18),
  ('d0000000-0000-4000-8000-000000000006'::uuid, 'moshe_client', 'rami_barber', 'תספורת גברים', 10),
  ('d0000000-0000-4000-8000-000000000007'::uuid, 'hila_client', 'tal_brows', 'עיצוב גבות', 25),
  ('d0000000-0000-4000-8000-000000000008'::uuid, 'shira_client', 'michal_lashes', 'לאש ליפט', 40)
) as b(id, client_username, pro_username, service_name, days_ago)
join public.profiles cl on cl.username = b.client_username
join public.profiles prp on prp.username = b.pro_username
join public.professional_profiles pp on pp.profile_id = prp.id
join public.professional_services s on s.professional_id = pp.id and s.name = b.service_name
join public.service_addresses addr on addr.profile_id = cl.id;

-- הזמנות עתידיות מאושרות
insert into public.bookings (
  client_id, professional_id, service_id, address_id, location_type, status,
  scheduled_start, scheduled_end, duration_minutes, buffer_minutes,
  price_type, price_amount, travel_fee, confirmed_at
)
select
  cl.id, pp.id, s.id, addr.id, 'client_home', 'confirmed',
  (date_trunc('day', now()) + (b.days_ahead || ' days')::interval + '17:00'::interval),
  (date_trunc('day', now()) + (b.days_ahead || ' days')::interval + '17:00'::interval + (s.duration_minutes || ' minutes')::interval),
  s.duration_minutes, s.buffer_minutes, 'fixed', s.price_min, 20, now()
from (values
  ('yael_client', 'shirley_hair', 'תספורת נשים + פן', 3),
  ('amir_client', 'yossi_barber', 'תספורת + זקן', 5),
  ('hila_client', 'dana_makeup', 'איפור ערב', 8)
) as b(client_username, pro_username, service_name, days_ahead)
join public.profiles cl on cl.username = b.client_username
join public.profiles prp on prp.username = b.pro_username
join public.professional_profiles pp on pp.profile_id = prp.id
join public.professional_services s on s.professional_id = pp.id and s.name = b.service_name
join public.service_addresses addr on addr.profile_id = cl.id;

-- הזמנות שממתינות לאישור
insert into public.bookings (
  client_id, professional_id, service_id, address_id, location_type, status,
  scheduled_start, scheduled_end, duration_minutes, buffer_minutes,
  price_type, price_amount, travel_fee, notes
)
select
  cl.id, pp.id, s.id, addr.id, 'client_home', 'pending',
  (date_trunc('day', now()) + (b.days_ahead || ' days')::interval + '11:00'::interval),
  (date_trunc('day', now()) + (b.days_ahead || ' days')::interval + '11:00'::interval + (s.duration_minutes || ' minutes')::interval),
  s.duration_minutes, s.buffer_minutes, 'fixed', s.price_min, 20, b.notes
from (values
  ('shira_client', 'noa_nails', 'מניקור לק ג׳ל', 4, 'אשמח לגוון עדין, יש לי אירוע בערב'),
  ('moshe_client', 'rami_barber', 'תספורת גברים', 2, 'אפשר קצת קצר יותר מהפעם הקודמת')
) as b(client_username, pro_username, service_name, days_ahead, notes)
join public.profiles cl on cl.username = b.client_username
join public.profiles prp on prp.username = b.pro_username
join public.professional_profiles pp on pp.profile_id = prp.id
join public.professional_services s on s.professional_id = pp.id and s.name = b.service_name
join public.service_addresses addr on addr.profile_id = cl.id;

-- ---------------------------------------------------------------------
-- ביקורות (רק על הזמנות שהושלמו)
-- ---------------------------------------------------------------------
insert into public.reviews (booking_id, professional_id, client_id, service_id, rating, body)
select b.id, b.professional_id, b.client_id, b.service_id, r.rating, r.body
from public.bookings b
join lateral (
  select
    (array[5,5,5,4,5,4,5,5])[1 + (abs(hashtext(b.id::text)) % 8)] as rating,
    (array[
      'הגיעה בזמן, עבודה מקצועית ונעימה. ממליצה בחום!',
      'פשוט מושלם. הבית נשאר נקי והתוצאה מדהימה.',
      'שירות אדיב ומקצועי, בדיוק מה שביקשתי.',
      'תוצאה יפה מאוד, אחזור בוודאות.',
      'סבלנות אין סופית והקשבה אמיתית למה שרציתי.',
      'מחיר הוגן ותוצאה מעולה. תודה!',
      'הגיע עד הבית וזה חסך לי המון זמן. מומלץ.',
      'איכות גבוהה, ברור שיש כאן ניסיון.'
    ])[1 + (abs(hashtext(b.id::text || 'r')) % 8)] as body
) r on true
where b.status = 'completed'
on conflict do nothing;

-- תגובות של בעלי מקצוע לחלק מהביקורות
insert into public.review_replies (review_id, professional_id, body)
select rv.id, rv.professional_id,
       (array[
         'תודה רבה! היה תענוג, נתראה בפעם הבאה 🙏',
         'איזה כיף לקרוא, תודה על המילים החמות!',
         'תודה! מחכה לראות אתכם שוב.'
       ])[1 + (abs(hashtext(rv.id::text)) % 3)]
from public.reviews rv
where (abs(hashtext(rv.id::text)) % 100) < 60
on conflict do nothing;

-- ---------------------------------------------------------------------
-- סדרות מפגשים קבועות
-- ---------------------------------------------------------------------
insert into public.recurring_booking_series (
  id, client_id, professional_id, service_id, address_id, location_type,
  frequency, interval_weeks, weekday, start_time, duration_minutes,
  start_date, planned_occurrences, price_amount, travel_fee, notes,
  approval_mode, status, client_approved_at, professional_approved_at
)
select
  sr.id, cl.id, pp.id, s.id, addr.id, 'client_home',
  sr.frequency::public.recurrence_frequency, sr.interval_weeks, sr.weekday, sr.start_time::time,
  s.duration_minutes, current_date + 7, 6, s.price_min, 20, sr.notes,
  'whole_series', 'active', now() - interval '3 days', now() - interval '2 days'
from (values
  ('e0000000-0000-4000-8000-000000000001'::uuid, 'yael_client', 'shirley_hair', 'תספורת נשים + פן',
   'biweekly', 2, 4, '17:00', 'כמו תמיד – תספורת קלה ופן'),
  ('e0000000-0000-4000-8000-000000000002'::uuid, 'amir_client', 'yossi_barber', 'תספורת + זקן',
   'every_3_weeks', 3, 2, '18:30', 'פייד 1 בצדדים')
) as sr(id, client_username, pro_username, service_name, frequency, interval_weeks, weekday, start_time, notes)
join public.profiles cl on cl.username = sr.client_username
join public.profiles prp on prp.username = sr.pro_username
join public.professional_profiles pp on pp.profile_id = prp.id
join public.professional_services s on s.professional_id = pp.id and s.name = sr.service_name
join public.service_addresses addr on addr.profile_id = cl.id;

-- יצירת המפגשים בפועל
select public.generate_series_occurrences('e0000000-0000-4000-8000-000000000001');
select public.materialize_series_bookings('e0000000-0000-4000-8000-000000000001');
select public.generate_series_occurrences('e0000000-0000-4000-8000-000000000002');
select public.materialize_series_bookings('e0000000-0000-4000-8000-000000000002');

-- הערות פרטיות של בעל המקצוע על לקוחות קבועים
insert into public.customer_notes (professional_id, client_id, note)
select sr.professional_id, sr.client_id,
       (array[
         'מעדיפה מים פושרים, רגישה בקרקפת',
         'תמיד מבקש/ת קפה שחור בלי סוכר',
         'לצלצל בפעמון ולא לדפוק – יש תינוק ישן'
       ])[1 + (abs(hashtext(sr.id::text)) % 3)]
from public.recurring_booking_series sr;

-- ---------------------------------------------------------------------
-- שיחות והודעות
-- ---------------------------------------------------------------------
do $$
declare
  v_pair record;
  v_conversation uuid;
  v_key text;
begin
  for v_pair in
    select distinct b.client_id, pp.profile_id as pro_profile_id
    from public.bookings b
    join public.professional_profiles pp on pp.id = b.professional_id
  loop
    v_key := public.direct_pair_key(v_pair.client_id, v_pair.pro_profile_id);

    select conversation_id into v_conversation
    from public.direct_conversation_keys where pair_key = v_key;

    if v_conversation is null then
      insert into public.conversations (created_by) values (v_pair.client_id)
      returning id into v_conversation;

      insert into public.conversation_members (conversation_id, profile_id)
      values (v_conversation, v_pair.client_id), (v_conversation, v_pair.pro_profile_id);

      insert into public.direct_conversation_keys (pair_key, conversation_id)
      values (v_key, v_conversation);

      insert into public.messages (conversation_id, sender_id, body, created_at)
      values
        (v_conversation, v_pair.client_id, 'היי! ראיתי את העבודות שלך ואשמח לתאם תור 😊', now() - interval '3 days'),
        (v_conversation, v_pair.pro_profile_id, 'היי! בשמחה. איזה יום נוח לך?', now() - interval '3 days' + interval '20 minutes'),
        (v_conversation, v_pair.client_id, 'חמישי אחר הצהריים מתאים לי מצוין', now() - interval '2 days'),
        (v_conversation, v_pair.pro_profile_id, 'מצוין, רשמתי. נתראה!', now() - interval '2 days' + interval '15 minutes');
    end if;
  end loop;
end $$;

-- הודעות נוספות (במקרה שהבלוק שלמעלה נעצר)
insert into public.messages (conversation_id, sender_id, body, created_at)
select c.id, cm.profile_id, 'מעולה, נתראה! אם משהו משתנה אעדכן מראש 🙏', now() - interval '1 day'
from public.conversations c
join lateral (
  select profile_id from public.conversation_members where conversation_id = c.id order by joined_at limit 1
) cm on true
where not exists (
  select 1 from public.messages m where m.conversation_id = c.id and m.created_at > now() - interval '2 days'
);

-- ---------------------------------------------------------------------
-- בקשת מקצוע חדש לדוגמה (ממתינה לאישור מנהל)
-- ---------------------------------------------------------------------
insert into public.profession_requests (requested_by, raw_name, note)
select pr.id, 'מעצב/ת תסרוקות אפרו', 'מתמחה בקוקיות, צמות וטיפוח שיער מתולתל'
from public.profiles pr where pr.username = 'maya_events'
on conflict do nothing;

-- ---------------------------------------------------------------------
-- רענון מדדים מחושבים
-- ---------------------------------------------------------------------
select public.refresh_professional_rating(id) from public.professional_profiles;
select public.refresh_response_time(id) from public.professional_profiles;

update public.professional_profiles pp
set clients_count = (
  select count(distinct b.client_id) from public.bookings b
  where b.professional_id = pp.id and b.status = 'completed'
);

-- מונחי חיפוש פופולריים
insert into public.popular_searches (term, hits) values
  ('ספר עד הבית', 42), ('מניקור', 38), ('איפור כלה', 31), ('ברבר', 29),
  ('עיצוב גבות', 24), ('הרחבות ריסים', 19), ('טיפול פנים', 17), ('פדיקור רפואי', 12)
on conflict (term) do update set hits = excluded.hits;
