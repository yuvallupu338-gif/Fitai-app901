#!/usr/bin/env node
/**
 * מייצא את בעלי המקצוע שנוצרו במחולל לקובץ SQL אחד.
 *
 * מיועד למי שאין לו Node בסביבת היעד: מדביקים את הקובץ ב־SQL Editor
 * של Supabase אחרי ‎setup.sql‎, ומקבלים את אותם בעלי מקצוע בדיוק.
 *
 *   node scripts/export-agents.mjs [יעד]
 *
 * הסיסמאות מיוצאות כ־hash קיים ולא כטקסט, בדיוק כפי שהן במסד.
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv();

import pg from 'pg';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] || join(root, 'supabase', 'agents.sql');
const TAG = 'generated-agent';

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('\n✖ חסר SUPABASE_DB_URL בקובץ .env.local\n');
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
});
await client.connect();

// פונקציות עזר שמייצרות ביטוי חיפוש לפי שם, במקום מזהה שאינו נייד.
await client.query(`
  create or replace function pg_temp.city_ref(p_id uuid) returns text language sql stable as $fn$
    select case when p_id is null then 'null'
           else '(select id from public.cities where name = ' || quote_literal(name) || ' limit 1)' end
      from public.cities where id = p_id
    union all select 'null' where p_id is null limit 1;
  $fn$;
  create or replace function pg_temp.profession_ref(p_id uuid) returns text language sql stable as $fn$
    select case when p_id is null then 'null'
           else '(select id from public.professions where slug = ' || quote_literal(slug) || ' limit 1)' end
      from public.professions where id = p_id
    union all select 'null' where p_id is null limit 1;
  $fn$;
`);

/** ממיר ערך מ־Postgres לליטרל SQL. */
function literal(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (Array.isArray(value)) {
    return `array[${value.map((v) => literal(v)).join(',')}]::text[]`;
  }
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** מייצא טבלה שלמה כשורות INSERT. */
async function dump(label, table, sql, params = []) {
  const { rows } = await client.query(sql, params);
  if (!rows.length) return { label, count: 0, sql: '' };

  // עמודה ששמה מסתיים ב־__raw מכילה ביטוי SQL מוכן (חיפוש לפי שם),
  // כי מזהי הערים והמקצועות נוצרים מחדש בכל התקנה ואינם ניתנים להעתקה.
  const columns = Object.keys(rows[0]);
  const names = columns.map((c) => c.replace(/__raw$/, ''));
  const values = rows.map((row) =>
    `  (${columns.map((c) => (c.endsWith('__raw') ? (row[c] ?? 'null') : literal(row[c]))).join(', ')})`);

  return {
    label,
    count: rows.length,
    sql: `-- ${label} (${rows.length})\ninsert into public.${table} (${names.join(', ')})\nvalues\n`
      + values.join(',\n')
      + '\non conflict do nothing;\n',
  };
}

const AGENTS = `(select id from public.profiles where bio like '%[${TAG}]%')`;
const AGENT_PROS = `(select pp.id from public.professional_profiles pp
   join public.profiles p on p.id = pp.profile_id where p.bio like '%[${TAG}]%')`;

const sections = [
  await dump('משתמשים', 'profiles', `
    select p.id, p.username::text as username, p.full_name, p.password_hash,
           pg_temp.city_ref(p.city_id) as city_id__raw, p.avatar_url, p.bio,
           p.role::text as role, p.status::text as status, p.active_mode::text as active_mode,
           p.created_at
      from public.profiles p where p.id in ${AGENTS} order by p.created_at`),

  await dump('פרופילים עסקיים', 'professional_profiles', `
    select id, profile_id, business_name, headline, bio, years_experience,
           pg_temp.city_ref(city_id) as city_id__raw, avatar_url,
           cover_url, accepts_home_visits, accepts_studio, accepts_events, max_travel_km,
           travel_fee, travel_fee_type::text as travel_fee_type, default_buffer_minutes,
           cancellation_policy, min_lead_time_minutes, max_lead_time_days, available_today,
           'draft' as status, published_at, created_at
      from public.professional_profiles where id in ${AGENT_PROS} order by created_at`),

  await dump('מקצועות', 'professional_professions', `
    select professional_id, pg_temp.profession_ref(profession_id) as profession_id__raw
      from public.professional_professions where professional_id in ${AGENT_PROS}`),

  await dump('שירותים', 'professional_services', `
    select id, professional_id, pg_temp.profession_ref(profession_id) as profession_id__raw,
           name, description, price_type::text as price_type,
           price_min, price_max, duration_minutes, buffer_minutes, at_client_home, at_studio,
           supports_recurring, is_active, sort_order
      from public.professional_services where professional_id in ${AGENT_PROS}`),

  await dump('אזורי שירות', 'service_areas', `
    select professional_id, pg_temp.city_ref(city_id) as city_id__raw
      from public.service_areas where professional_id in ${AGENT_PROS}`),

  await dump('שעות פעילות', 'professional_availability', `
    select id, professional_id, weekday, start_time::text as start_time,
           end_time::text as end_time, is_break
      from public.professional_availability where professional_id in ${AGENT_PROS}`),

  await dump('פוסטים', 'professional_posts', `
    select id, professional_id, author_profile_id, service_id,
           pg_temp.profession_ref(profession_id) as profession_id__raw,
           pg_temp.city_ref(city_id) as city_id__raw, title,
           description, tags, price_estimate, price_type::text as price_type, duration_minutes,
           is_before_after, consent_confirmed, status::text as status, is_pinned, pinned_order,
           published_at, views_count, created_at
      from public.professional_posts
     where professional_id in ${AGENT_PROS} order by created_at`),

  await dump('תמונות', 'post_media', `
    select pm.id, pm.post_id, pm.media_type::text as media_type, pm.url, pm.position, pm.alt_text
      from public.post_media pm
      join public.professional_posts pt on pt.id = pm.post_id
     where pt.professional_id in ${AGENT_PROS}`),

  await dump('מעקבים', 'follows', `
    select follower_id, following_id from public.follows
     where follower_id in ${AGENTS} and following_id in ${AGENTS}`),

  // רק לייקים על פוסטים שנוצרו כאן. לייקים על פוסטים מהזריעה אינם ניתנים
  // לייצוא, כי מזהי הפוסטים ההם נוצרים מחדש בכל התקנה.
  await dump('לייקים', 'post_likes', `
    select pl.post_id, pl.profile_id
      from public.post_likes pl
      join public.professional_posts pt on pt.id = pl.post_id
     where pl.profile_id in ${AGENTS} and pt.professional_id in ${AGENT_PROS}`),
];

const header = `-- ==========================================================
--  יופי — ${sections[0].count} בעלי מקצוע
-- ==========================================================
--
--  מה עושים:
--    1. מריצים קודם את supabase/setup.sql
--    2. פותחים SQL Editor → New query
--    3. מדביקים את הקובץ הזה ולוחצים Run
--
--  אפשר להריץ שוב בבטחה — שורות קיימות מדולגות.
--
--  הסיסמאות מיוצאות כ־hash, כפי שהן במסד. הסיסמה לכל החשבונות
--  האלה היא Agent1234, אלא אם שיניתם אותה בזמן היצירה.
--
--  נוצר אוטומטית: node scripts/export-agents.mjs
-- ==========================================================

`;

const body = sections.filter((s) => s.count).map((s) => s.sql).join('\n');

// המונים מתוחזקים בטריגרים, ולכן יש לרענן אותם אחרי טעינה בבת אחת.
const footer = `
-- ==========================================================
-- הפעלת הפרופילים
--
-- הפרופילים נטענו כטיוטה, כי הטריגר שבמסד חוסם פרסום לפני שיש
-- שירותים ותמונות עבודה. עכשיו, כשהכול קיים, אפשר לפרסם אותם —
-- והבדיקה עוברת בדיוק כמו לבעל מקצוע שממלא את הטופס בעצמו.
-- ==========================================================

update public.professional_profiles
   set status = 'active', published_at = coalesce(published_at, now())
 where status = 'draft'
   and profile_id in (select id from public.profiles where bio like '%[${TAG}]%');

-- ==========================================================
-- רענון מונים ומסמכי חיפוש
-- הטריגרים מתחזקים אותם בזמן אמת, אבל טעינה גורפת עוקפת חלק מהם.
-- ==========================================================

update public.professional_posts pt
   set likes_count = (select count(*) from public.post_likes pl where pl.post_id = pt.id);

update public.profiles pr
   set followers_count = (select count(*) from public.follows f where f.following_id = pr.id),
       following_count = (select count(*) from public.follows f where f.follower_id  = pr.id);

update public.professional_profiles pp
   set followers_count = (select count(*) from public.follows f where f.following_id = pp.profile_id),
       posts_count     = (select count(*) from public.professional_posts pt
                           where pt.professional_id = pp.id and pt.status = 'published'),
       search_doc      = public.build_search_doc(pp.id);

select count(*) || ' בעלי מקצוע פעילים' as result
  from public.professional_profiles where status = 'active';
`;

writeFileSync(target, header + body + footer, 'utf8');

console.log(`✓ נוצר ${target}`);
for (const s of sections) {
  if (s.count) console.log(`    ${s.label.padEnd(18)} ${s.count}`);
}

await client.end();
