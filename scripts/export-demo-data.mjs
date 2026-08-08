#!/usr/bin/env node
/**
 * מייצא את נתוני ההדגמה ל־JSON שמוטמע בתוך ‎index.html‎.
 *
 * מאפשר לאפליקציה לרוץ בלי מסד נתונים כלל: אותם מסכים, אותה לוגיקה,
 * רק שהנתונים מגיעים מזיכרון הדפדפן במקום מ־Supabase.
 *
 *   node scripts/export-demo-data.mjs
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv();

import pg from 'pg';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'supabase', 'demo-data.json');

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

const q = async (sql) => (await client.query(sql)).rows;

/** מסיר שדות ריקים כדי לצמצם את גודל הקובץ. */
function compact(rows) {
  return rows.map((row) => {
    const out = {};
    for (const [key, value] of Object.entries(row)) {
      if (value === null || value === undefined) continue;
      out[key] = value instanceof Date ? value.toISOString() : value;
    }
    return out;
  });
}

const data = {};

data.cities = compact(await q(`
  select id, name, district, latitude, longitude, population, is_active
    from public.cities where is_active order by population desc nulls last`));

data.professions = compact(await q(`
  select id, slug, name, name_norm, category, is_active, sort_order
    from public.professions where is_active order by sort_order`));

// כל הפרופילים שיש להם פרופיל עסקי פעיל, ועוד כמה לקוחות לצורך תוכן
data.profiles = compact(await q(`
  select p.id, p.username::text as username, p.full_name, p.avatar_url, p.city_id,
         p.role::text as role, p.status::text as status, p.active_mode::text as active_mode,
         p.is_professional, p.followers_count, p.following_count, p.created_at
    from public.profiles p
   where p.deleted_at is null
     and (exists (select 1 from public.professional_profiles pp
                   where pp.profile_id = p.id and pp.status = 'active')
          or p.role = 'admin'
          or exists (select 1 from public.bookings b where b.client_id = p.id))`));

data.professional_profiles = compact(await q(`
  select id, profile_id, business_name, headline, bio, years_experience, city_id, avatar_url,
         cover_url, accepts_home_visits, accepts_studio, accepts_events, max_travel_km,
         travel_fee, travel_fee_type::text as travel_fee_type, default_buffer_minutes,
         min_lead_time_minutes, max_lead_time_days,
         available_today, available_now, is_verified,
         round(rating_avg, 2) as rating_avg, rating_count, followers_count,
         completed_bookings_count, clients_count, posts_count, profile_views_count,
         response_time_minutes, status::text as status, published_at
    from public.professional_profiles where status = 'active'`));

data.professional_professions = compact(await q(`
  select ppf.professional_id, ppf.profession_id
    from public.professional_professions ppf
    join public.professional_profiles pp on pp.id = ppf.professional_id
   where pp.status = 'active'`));

data.professional_services = compact(await q(`
  select s.id, s.professional_id, s.profession_id, s.name, s.description,
         s.price_type::text as price_type, s.price_min, s.price_max, s.duration_minutes,
         s.buffer_minutes, s.at_client_home, s.at_studio, s.supports_recurring,
         s.is_active, s.sort_order
    from public.professional_services s
    join public.professional_profiles pp on pp.id = s.professional_id
   where pp.status = 'active' and s.is_active and s.deleted_at is null`));

data.service_areas = compact(await q(`
  select sa.professional_id, sa.city_id from public.service_areas sa
    join public.professional_profiles pp on pp.id = sa.professional_id
   where pp.status = 'active'`));

data.professional_availability = compact(await q(`
  select a.id, a.professional_id, a.weekday, a.start_time::text as start_time,
         a.end_time::text as end_time, a.is_break
    from public.professional_availability a
    join public.professional_profiles pp on pp.id = a.professional_id
   where pp.status = 'active'`));

data.professional_posts = compact(await q(`
  select pt.id, pt.professional_id, pt.author_profile_id, pt.service_id, pt.profession_id,
         pt.city_id, pt.title, pt.description, pt.tags, pt.price_estimate,
         pt.price_type::text as price_type, pt.duration_minutes, pt.is_before_after,
         pt.status::text as status, pt.is_pinned, pt.published_at,
         pt.likes_count, pt.comments_count, pt.saves_count, pt.views_count
    from public.professional_posts pt
    join public.professional_profiles pp on pp.id = pt.professional_id
   where pp.status = 'active' and pt.status = 'published' and pt.deleted_at is null
     and pt.id in (
       select id from (
         select id, row_number() over (partition by professional_id order by published_at desc) as rn
           from public.professional_posts
          where status = 'published' and deleted_at is null) t
        where rn <= 4)`));

data.post_media = compact(await q(`
  select pm.id, pm.post_id, pm.media_type::text as media_type, pm.url, pm.position, pm.alt_text
    from public.post_media pm
    join public.professional_posts pt on pt.id = pm.post_id
    join public.professional_profiles pp on pp.id = pt.professional_id
   where pp.status = 'active' and pm.position < 2`));

data.follows = compact(await q(`select follower_id, following_id, created_at from public.follows`));

data.post_likes = compact(await q(`
  select pl.post_id, pl.profile_id from public.post_likes pl
    join public.professional_posts pt on pt.id = pl.post_id
    join public.professional_profiles pp on pp.id = pt.professional_id
   where pp.status = 'active'`));

data.post_comments = compact(await q(`
  select c.id, c.post_id, c.profile_id, c.body, c.created_at
    from public.post_comments c
    join public.professional_posts pt on pt.id = c.post_id
    join public.professional_profiles pp on pp.id = pt.professional_id
   where pp.status = 'active' and c.deleted_at is null`));

data.reviews = compact(await q(`
  select r.id, r.booking_id, r.professional_id, r.client_id, r.service_id, r.rating, r.body,
         r.is_verified_booking, r.created_at
    from public.reviews r
    join public.professional_profiles pp on pp.id = r.professional_id
   where pp.status = 'active' and r.deleted_at is null and not r.is_hidden`));

data.review_replies = compact(await q(`
  select rr.id, rr.review_id, rr.body, rr.created_at
    from public.review_replies rr
    join public.reviews r on r.id = rr.review_id
    join public.professional_profiles pp on pp.id = r.professional_id
   where pp.status = 'active'`));

data.popular_searches = compact(await q(`
  select term, hits as search_count from public.popular_searches
   order by hits desc limit 12`));

/**
 * מקצר מזהים.
 *
 * כל שורה נושאת כמה UUID באורך 36 תווים, וזה רוב משקל הקובץ. כאן הם
 * מוחלפים במזהים קצרים ויציבים. האפליקציה מתייחסת אליהם כמחרוזות
 * אטומות בלבד — השוואה וניתוב עובדים בדיוק אותו דבר.
 */
function shortenIds(tables) {
  const map = new Map();
  const short = (uuid) => {
    if (!map.has(uuid)) map.set(uuid, map.size.toString(36));
    return map.get(uuid);
  };
  const isUuid = (v) =>
    typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);

  for (const rows of Object.values(tables)) {
    for (const row of rows) {
      for (const [key, value] of Object.entries(row)) {
        if (isUuid(value)) row[key] = short(value);
      }
    }
  }
  return tables;
}

// שדות שאפשר לגזור מחדש בצד הלקוח ואין טעם לשלוח
for (const post of data.professional_posts) delete post.author_profile_id;
for (const media of data.post_media) { delete media.alt_text; delete media.id; }
for (const slot of data.professional_availability) delete slot.id;

/**
 * דוחס מחרוזות חוזרות.
 *
 * כתובות תמונה, תיאורים וכותרות חוזרים מאות פעמים. כאן הם נאספים
 * לטבלה אחת, וכל מופע מוחלף בהפניה קצרה. הלקוח משחזר בטעינה.
 */
function poolStrings(tables) {
  const counts = new Map();
  const walk = (fn) => {
    for (const rows of Object.values(tables)) {
      for (const row of rows) {
        for (const [key, value] of Object.entries(row)) {
          if (typeof value === 'string' && value.length >= 10) fn(row, key, value);
          else if (Array.isArray(value)) {
            value.forEach((item, i) => {
              if (typeof item === 'string' && item.length >= 10) fn(value, i, item);
            });
          }
        }
      }
    }
  };

  walk((_, __, value) => counts.set(value, (counts.get(value) ?? 0) + 1));

  const pool = [...counts.entries()].filter(([, n]) => n >= 3).map(([value]) => value);
  const index = new Map(pool.map((value, i) => [value, i]));

  // \u0001 אינו מופיע בטקסט אמיתי, ולכן בטוח לסימון הפניה.
  walk((container, key, value) => {
    if (index.has(value)) container[key] = '\u0001' + index.get(value).toString(36);
  });

  return { pool, tables };
}

const pooled = poolStrings(shortenIds(data));
const json = JSON.stringify({ pool: pooled.pool, tables: pooled.tables });
writeFileSync(target, json, 'utf8');

console.log(`✓ נוצר ${target} — ${(Buffer.byteLength(json) / 1024 / 1024).toFixed(2)} MB`);
console.log(`    מאגר מחרוזות              ${pooled.pool.length}`);
for (const [key, rows] of Object.entries(data)) {
  console.log(`    ${key.padEnd(28)} ${rows.length}`);
}

await client.end();
