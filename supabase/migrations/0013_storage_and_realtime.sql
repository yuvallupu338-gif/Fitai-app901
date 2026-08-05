-- =====================================================================
-- 0013 – Supabase Storage ו־Realtime
-- =====================================================================
-- ההעלאות מתבצעות דרך שרת האפליקציה (‎/api/upload‎): שם הקובץ אקראי,
-- הסוג והגודל נבדקים, וההעלאה נעשית עם service_role. הדליים ציבוריים
-- לקריאה בלבד; כתיבה ומחיקה מוגבלות לבעלי התוכן.
-- =====================================================================

set search_path = public, extensions;

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'סכימת storage אינה קיימת (סביבה מקומית) – מדלגים על הגדרות Storage.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('avatars',      'avatars',      true,  5242880,
      array['image/jpeg','image/png','image/webp','image/avif']),
    ('covers',       'covers',       true,  8388608,
      array['image/jpeg','image/png','image/webp','image/avif']),
    ('posts',        'posts',        true,  26214400,
      array['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm','video/quicktime']),
    ('messages',     'messages',     true,  10485760,
      array['image/jpeg','image/png','image/webp','image/avif']),
    ('reviews',      'reviews',      true,  8388608,
      array['image/jpeg','image/png','image/webp','image/avif']),
    ('certificates', 'certificates', false, 10485760,
      array['image/jpeg','image/png','image/webp','application/pdf'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
end $$;

-- מדיניות Storage
do $$
declare b text;
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  -- קריאה ציבורית לדליים הציבוריים
  execute 'drop policy if exists "public_read_media" on storage.objects';
  execute $p$
    create policy "public_read_media" on storage.objects
      for select to anon, authenticated
      using (bucket_id in ('avatars', 'covers', 'posts', 'messages', 'reviews'))
  $p$;

  -- תעודות מקצועיות – רק הבעלים והמנהל
  execute 'drop policy if exists "certificates_owner_read" on storage.objects';
  execute $p$
    create policy "certificates_owner_read" on storage.objects
      for select to authenticated
      using (
        bucket_id = 'certificates'
        and (
          (storage.foldername(name))[1] = public.current_profile_id()::text
          or public.is_admin()
        )
      )
  $p$;

  -- כתיבה: רק לתיקייה האישית (‎<profile_id>/…‎)
  foreach b in array array['avatars', 'covers', 'posts', 'messages', 'reviews', 'certificates'] loop
    execute format('drop policy if exists %I on storage.objects', b || '_owner_write');
    execute format($p$
      create policy %I on storage.objects
        for insert to authenticated
        with check (
          bucket_id = %L
          and (storage.foldername(name))[1] = public.current_profile_id()::text
        )
    $p$, b || '_owner_write', b);

    execute format('drop policy if exists %I on storage.objects', b || '_owner_delete');
    execute format($p$
      create policy %I on storage.objects
        for delete to authenticated
        using (
          bucket_id = %L
          and ((storage.foldername(name))[1] = public.current_profile_id()::text or public.is_admin())
        )
    $p$, b || '_owner_delete', b);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Realtime – פרסום טבלאות לעדכונים בזמן אמת
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'messages', 'conversations', 'conversation_members', 'notifications',
    'bookings', 'booking_status_history', 'recurring_booking_series',
    'recurring_booking_occurrences', 'post_likes', 'post_comments',
    'professional_posts', 'professional_profiles', 'follows', 'reviews',
    'review_replies', 'professional_availability', 'professional_services'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array tables loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
      when others then raise notice 'לא ניתן להוסיף % ל־publication: %', t, sqlerrm;
    end;
  end loop;
end $$;

-- REPLICA IDENTITY FULL נדרש כדי לקבל את השורה הישנה באירועי UPDATE/DELETE.
do $$
declare
  t text;
  tables text[] := array['messages', 'notifications', 'bookings', 'post_likes', 'follows'];
begin
  foreach t in array tables loop
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;
