-- =====================================================================
-- 0011 – Row Level Security
-- =====================================================================
-- כל טבלה מוגנת. ההרשאות נבדקות פעמיים: גם בקוד השרת וגם כאן.
-- הרשאות ברמת עמודה מונעות חשיפת שדות רגישים (סיסמה, קוד שחזור וכו').
-- =====================================================================

set search_path = public, extensions;

-- ודא שקיימים התפקידים של Supabase (בסביבת פיתוח מקומית הם עשויים לחסר).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;

-- ברירת מחדל: הרשאות מלאות ל־service_role, קריאה/כתיבה מבוקרת לשאר.
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- הפעלת RLS על כל הטבלאות
do $$
declare t record;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- =====================================================================
-- profiles
-- =====================================================================
-- שדות רגישים אינם ניתנים לקריאה כלל על ידי לקוח – רק דרך קוד שרת מהימן.
revoke select on public.profiles from anon, authenticated;
grant select (
  id, username, full_name, city_id, avatar_url, bio, role, status, active_mode,
  is_professional, followers_count, following_count, privacy, last_seen_at,
  created_at, updated_at, deleted_at
) on public.profiles to anon, authenticated;

revoke update on public.profiles from authenticated;
grant update (full_name, city_id, avatar_url, bio, privacy, active_mode, last_seen_at)
  on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to anon, authenticated
  using (
    (deleted_at is null and status <> 'banned')
    or id = public.current_profile_id()
    or public.is_admin()
  );

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = public.current_profile_id() and status = 'active')
  with check (id = public.current_profile_id());

-- =====================================================================
-- usernames – רק לבדיקת תפיסה
-- =====================================================================
revoke all on public.usernames from anon, authenticated;
grant select (username) on public.usernames to anon, authenticated;

drop policy if exists usernames_select on public.usernames;
create policy usernames_select on public.usernames
  for select to anon, authenticated using (true);

-- =====================================================================
-- טבלאות אימות – שרת בלבד (ללא מדיניות = ללא גישה)
-- =====================================================================
revoke all on public.recovery_codes from anon, authenticated;
revoke all on public.login_attempts from anon, authenticated;
revoke all on public.rate_limits from anon, authenticated;
revoke all on public.phone_verification_codes from anon, authenticated;
revoke all on public.direct_conversation_keys from anon, authenticated;
revoke all on public.activity_log from anon, authenticated;

-- היסטוריית התחברויות: המשתמש רשאי לראות את שלו בלבד.
revoke all on public.auth_sessions from anon, authenticated;
grant select (id, profile_id, user_agent, ip_address, created_at, last_used_at, expires_at, revoked_at)
  on public.auth_sessions to authenticated;
grant update (revoked_at) on public.auth_sessions to authenticated;

drop policy if exists auth_sessions_own on public.auth_sessions;
create policy auth_sessions_own on public.auth_sessions
  for select to authenticated using (profile_id = public.current_profile_id());

drop policy if exists auth_sessions_revoke_own on public.auth_sessions;
create policy auth_sessions_revoke_own on public.auth_sessions
  for update to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

drop policy if exists security_events_own on public.security_events;
create policy security_events_own on public.security_events
  for select to authenticated
  using (profile_id = public.current_profile_id() or public.is_admin());

-- =====================================================================
-- cities – ציבורי לקריאה
-- =====================================================================
drop policy if exists cities_select on public.cities;
create policy cities_select on public.cities
  for select to anon, authenticated using (true);

drop policy if exists cities_admin_write on public.cities;
create policy cities_admin_write on public.cities
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- professions
-- =====================================================================
drop policy if exists professions_select on public.professions;
create policy professions_select on public.professions
  for select to anon, authenticated
  using (is_active or public.is_admin());

drop policy if exists professions_admin_write on public.professions;
create policy professions_admin_write on public.professions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- profession_requests
-- =====================================================================
drop policy if exists profession_requests_select on public.profession_requests;
create policy profession_requests_select on public.profession_requests
  for select to authenticated
  using (requested_by = public.current_profile_id() or public.is_admin());

drop policy if exists profession_requests_insert on public.profession_requests;
create policy profession_requests_insert on public.profession_requests
  for insert to authenticated
  with check (requested_by = public.current_profile_id());

drop policy if exists profession_requests_admin_update on public.profession_requests;
create policy profession_requests_admin_update on public.profession_requests
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- professional_profiles
-- =====================================================================
drop policy if exists professional_profiles_select on public.professional_profiles;
create policy professional_profiles_select on public.professional_profiles
  for select to anon, authenticated
  using (
    (status = 'active' and deleted_at is null)
    or profile_id = public.current_profile_id()
    or public.is_admin()
  );

drop policy if exists professional_profiles_insert on public.professional_profiles;
create policy professional_profiles_insert on public.professional_profiles
  for insert to authenticated
  with check (profile_id = public.current_profile_id());

drop policy if exists professional_profiles_update on public.professional_profiles;
create policy professional_profiles_update on public.professional_profiles
  for update to authenticated
  using (profile_id = public.current_profile_id() or public.is_admin())
  with check (profile_id = public.current_profile_id() or public.is_admin());

-- שדות שרק מנהל רשאי לשנות
revoke update (is_verified, verified_at, phone_verified) on public.professional_profiles from authenticated;

drop policy if exists professional_profiles_delete on public.professional_profiles;
create policy professional_profiles_delete on public.professional_profiles
  for delete to authenticated
  using (profile_id = public.current_profile_id() or public.is_admin());

-- =====================================================================
-- professional_contact_details – טלפון וכתובת סטודיו
-- =====================================================================
drop policy if exists contact_details_select on public.professional_contact_details;
create policy contact_details_select on public.professional_contact_details
  for select to authenticated
  using (
    public.owns_professional(professional_id)
    or public.is_admin()
    or exists (
      select 1 from public.bookings b
      where b.professional_id = professional_contact_details.professional_id
        and b.client_id = public.current_profile_id()
        and b.status in ('confirmed', 'on_the_way', 'arrived', 'in_progress', 'completed')
    )
  );

drop policy if exists contact_details_write on public.professional_contact_details;
create policy contact_details_write on public.professional_contact_details
  for all to authenticated
  using (public.owns_professional(professional_id) or public.is_admin())
  with check (public.owns_professional(professional_id) or public.is_admin());

-- =====================================================================
-- טבלאות בנות של פרופיל מקצועי
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'professional_professions', 'professional_services', 'service_areas',
    'professional_availability', 'unavailable_dates'
  ] loop
    execute format($p$
      drop policy if exists %1$s_select on public.%1$s;
      create policy %1$s_select on public.%1$s
        for select to anon, authenticated
        using (public.professional_is_public(professional_id)
               or public.owns_professional(professional_id)
               or public.is_admin());

      drop policy if exists %1$s_write on public.%1$s;
      create policy %1$s_write on public.%1$s
        for all to authenticated
        using (public.owns_professional(professional_id) or public.is_admin())
        with check (public.owns_professional(professional_id) or public.is_admin());
    $p$, t);
  end loop;
end $$;

-- =====================================================================
-- professional_verifications – מסמכים אישיים
-- =====================================================================
drop policy if exists verifications_select on public.professional_verifications;
create policy verifications_select on public.professional_verifications
  for select to authenticated
  using (public.owns_professional(professional_id) or public.is_admin());

drop policy if exists verifications_insert on public.professional_verifications;
create policy verifications_insert on public.professional_verifications
  for insert to authenticated
  with check (public.owns_professional(professional_id));

drop policy if exists verifications_admin_update on public.professional_verifications;
create policy verifications_admin_update on public.professional_verifications
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- follows
-- =====================================================================
drop policy if exists follows_select on public.follows;
create policy follows_select on public.follows
  for select to anon, authenticated using (true);

drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows
  for insert to authenticated
  with check (
    follower_id = public.current_profile_id()
    and not public.is_blocked_between(follower_id, following_id)
  );

drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows
  for delete to authenticated
  using (follower_id = public.current_profile_id());

-- =====================================================================
-- blocked_users
-- =====================================================================
drop policy if exists blocked_users_select on public.blocked_users;
create policy blocked_users_select on public.blocked_users
  for select to authenticated
  using (blocker_id = public.current_profile_id() or public.is_admin());

drop policy if exists blocked_users_write on public.blocked_users;
create policy blocked_users_write on public.blocked_users
  for all to authenticated
  using (blocker_id = public.current_profile_id())
  with check (blocker_id = public.current_profile_id());

-- =====================================================================
-- professional_posts
-- =====================================================================
drop policy if exists posts_select on public.professional_posts;
create policy posts_select on public.professional_posts
  for select to anon, authenticated
  using (
    (status = 'published' and deleted_at is null and public.professional_is_public(professional_id))
    or author_profile_id = public.current_profile_id()
    or public.is_admin()
  );

drop policy if exists posts_insert on public.professional_posts;
create policy posts_insert on public.professional_posts
  for insert to authenticated
  with check (
    author_profile_id = public.current_profile_id()
    and public.owns_professional(professional_id)
  );

drop policy if exists posts_update on public.professional_posts;
create policy posts_update on public.professional_posts
  for update to authenticated
  using (author_profile_id = public.current_profile_id() or public.is_admin())
  with check (author_profile_id = public.current_profile_id() or public.is_admin());

drop policy if exists posts_delete on public.professional_posts;
create policy posts_delete on public.professional_posts
  for delete to authenticated
  using (author_profile_id = public.current_profile_id() or public.is_admin());

-- =====================================================================
-- post_media
-- =====================================================================
drop policy if exists post_media_select on public.post_media;
create policy post_media_select on public.post_media
  for select to anon, authenticated using (public.can_view_post(post_id));

drop policy if exists post_media_write on public.post_media;
create policy post_media_write on public.post_media
  for all to authenticated
  using (exists (select 1 from public.professional_posts p
                 where p.id = post_media.post_id
                   and (p.author_profile_id = public.current_profile_id() or public.is_admin())))
  with check (exists (select 1 from public.professional_posts p
                      where p.id = post_media.post_id
                        and (p.author_profile_id = public.current_profile_id() or public.is_admin())));

-- =====================================================================
-- post_likes
-- =====================================================================
drop policy if exists post_likes_select on public.post_likes;
create policy post_likes_select on public.post_likes
  for select to anon, authenticated using (public.can_view_post(post_id));

drop policy if exists post_likes_insert on public.post_likes;
create policy post_likes_insert on public.post_likes
  for insert to authenticated
  with check (profile_id = public.current_profile_id() and public.can_view_post(post_id));

drop policy if exists post_likes_delete on public.post_likes;
create policy post_likes_delete on public.post_likes
  for delete to authenticated using (profile_id = public.current_profile_id());

-- =====================================================================
-- post_comments
-- =====================================================================
drop policy if exists post_comments_select on public.post_comments;
create policy post_comments_select on public.post_comments
  for select to anon, authenticated
  using (
    public.can_view_post(post_id)
    and (
      (deleted_at is null and not is_hidden)
      or profile_id = public.current_profile_id()
      or public.is_admin()
    )
  );

drop policy if exists post_comments_insert on public.post_comments;
create policy post_comments_insert on public.post_comments
  for insert to authenticated
  with check (profile_id = public.current_profile_id() and public.can_view_post(post_id));

drop policy if exists post_comments_update on public.post_comments;
create policy post_comments_update on public.post_comments
  for update to authenticated
  using (
    profile_id = public.current_profile_id()
    or public.is_admin()
    or exists (select 1 from public.professional_posts p
               where p.id = post_comments.post_id and p.author_profile_id = public.current_profile_id())
  )
  with check (true);

drop policy if exists post_comments_delete on public.post_comments;
create policy post_comments_delete on public.post_comments
  for delete to authenticated
  using (
    profile_id = public.current_profile_id()
    or public.is_admin()
    or exists (select 1 from public.professional_posts p
               where p.id = post_comments.post_id and p.author_profile_id = public.current_profile_id())
  );

-- =====================================================================
-- שמירות – פרטי לחלוטין
-- =====================================================================
drop policy if exists saved_posts_own on public.saved_posts;
create policy saved_posts_own on public.saved_posts
  for all to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

drop policy if exists saved_professionals_own on public.saved_professionals;
create policy saved_professionals_own on public.saved_professionals
  for all to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

drop policy if exists saved_searches_own on public.saved_searches;
create policy saved_searches_own on public.saved_searches
  for all to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

drop policy if exists search_history_own on public.search_history;
create policy search_history_own on public.search_history
  for all to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

drop policy if exists popular_searches_select on public.popular_searches;
create policy popular_searches_select on public.popular_searches
  for select to anon, authenticated using (true);

-- =====================================================================
-- צפיות – רק בעל הפרופיל רואה את הנתונים
-- =====================================================================
drop policy if exists profile_views_select on public.profile_views;
create policy profile_views_select on public.profile_views
  for select to authenticated
  using (public.owns_professional(professional_id) or public.is_admin());

drop policy if exists post_views_select on public.post_views;
create policy post_views_select on public.post_views
  for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.professional_posts p
               where p.id = post_views.post_id and p.author_profile_id = public.current_profile_id())
  );

-- =====================================================================
-- שיחות והודעות – רק משתתפי השיחה
-- =====================================================================
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select to authenticated
  using (public.is_conversation_member(id) or public.is_admin());

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations
  for insert to authenticated
  with check (created_by = public.current_profile_id());

drop policy if exists conversation_members_select on public.conversation_members;
create policy conversation_members_select on public.conversation_members
  for select to authenticated
  using (public.is_conversation_member(conversation_id) or public.is_admin());

drop policy if exists conversation_members_update on public.conversation_members;
create policy conversation_members_update on public.conversation_members
  for update to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (public.is_conversation_member(conversation_id) or public.is_admin());

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = public.current_profile_id()
    and public.is_conversation_member(conversation_id)
  );

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
  for update to authenticated
  using (sender_id = public.current_profile_id() or public.is_admin())
  with check (sender_id = public.current_profile_id() or public.is_admin());

-- =====================================================================
-- כתובות שירות
-- =====================================================================
drop policy if exists service_addresses_select on public.service_addresses;
create policy service_addresses_select on public.service_addresses
  for select to authenticated using (public.can_view_address(id));

drop policy if exists service_addresses_write on public.service_addresses;
create policy service_addresses_write on public.service_addresses
  for all to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

-- =====================================================================
-- הזמנות
-- =====================================================================
drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings
  for select to authenticated
  using (
    client_id = public.current_profile_id()
    or public.owns_professional(professional_id)
    or public.is_admin()
  );

drop policy if exists bookings_insert on public.bookings;
create policy bookings_insert on public.bookings
  for insert to authenticated
  with check (
    client_id = public.current_profile_id()
    and public.professional_is_public(professional_id)
    and (address_id is null or exists (
      select 1 from public.service_addresses sa
      where sa.id = address_id and sa.profile_id = public.current_profile_id()))
  );

drop policy if exists bookings_update on public.bookings;
create policy bookings_update on public.bookings
  for update to authenticated
  using (
    client_id = public.current_profile_id()
    or public.owns_professional(professional_id)
    or public.is_admin()
  )
  with check (
    client_id = public.current_profile_id()
    or public.owns_professional(professional_id)
    or public.is_admin()
  );

drop policy if exists booking_history_select on public.booking_status_history;
create policy booking_history_select on public.booking_status_history
  for select to authenticated
  using (public.is_booking_party(booking_id) or public.is_admin());

-- =====================================================================
-- סדרות קבועות
-- =====================================================================
drop policy if exists series_select on public.recurring_booking_series;
create policy series_select on public.recurring_booking_series
  for select to authenticated
  using (
    client_id = public.current_profile_id()
    or public.owns_professional(professional_id)
    or public.is_admin()
  );

drop policy if exists series_insert on public.recurring_booking_series;
create policy series_insert on public.recurring_booking_series
  for insert to authenticated
  with check (client_id = public.current_profile_id() and public.professional_is_public(professional_id));

drop policy if exists series_update on public.recurring_booking_series;
create policy series_update on public.recurring_booking_series
  for update to authenticated
  using (client_id = public.current_profile_id() or public.owns_professional(professional_id) or public.is_admin())
  with check (client_id = public.current_profile_id() or public.owns_professional(professional_id) or public.is_admin());

drop policy if exists occurrences_select on public.recurring_booking_occurrences;
create policy occurrences_select on public.recurring_booking_occurrences
  for select to authenticated
  using (exists (
    select 1 from public.recurring_booking_series s
    where s.id = recurring_booking_occurrences.series_id
      and (s.client_id = public.current_profile_id()
           or public.owns_professional(s.professional_id)
           or public.is_admin())
  ));

drop policy if exists occurrences_update on public.recurring_booking_occurrences;
create policy occurrences_update on public.recurring_booking_occurrences
  for update to authenticated
  using (exists (
    select 1 from public.recurring_booking_series s
    where s.id = recurring_booking_occurrences.series_id
      and (s.client_id = public.current_profile_id() or public.owns_professional(s.professional_id))
  ))
  with check (true);

-- =====================================================================
-- לקוחות קבועים – הערות פרטיות של בעל המקצוע
-- =====================================================================
drop policy if exists customer_notes_own on public.customer_notes;
create policy customer_notes_own on public.customer_notes
  for all to authenticated
  using (public.owns_professional(professional_id))
  with check (public.owns_professional(professional_id));

-- =====================================================================
-- ביקורות
-- =====================================================================
drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews
  for select to anon, authenticated
  using (
    (deleted_at is null and not is_hidden and public.professional_is_public(professional_id))
    or client_id = public.current_profile_id()
    or public.owns_professional(professional_id)
    or public.is_admin()
  );

drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews
  for insert to authenticated
  with check (
    client_id = public.current_profile_id()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.client_id = public.current_profile_id()
        and b.status = 'completed'
    )
  );

drop policy if exists reviews_update on public.reviews;
create policy reviews_update on public.reviews
  for update to authenticated
  using (client_id = public.current_profile_id() or public.is_admin())
  with check (client_id = public.current_profile_id() or public.is_admin());

drop policy if exists review_replies_select on public.review_replies;
create policy review_replies_select on public.review_replies
  for select to anon, authenticated using (deleted_at is null or public.is_admin());

drop policy if exists review_replies_write on public.review_replies;
create policy review_replies_write on public.review_replies
  for all to authenticated
  using (public.owns_professional(professional_id) or public.is_admin())
  with check (public.owns_professional(professional_id) or public.is_admin());

-- =====================================================================
-- התראות
-- =====================================================================
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated using (profile_id = public.current_profile_id());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete to authenticated using (profile_id = public.current_profile_id());

-- =====================================================================
-- דיווחים
-- =====================================================================
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated
  using (reporter_id = public.current_profile_id() or public.is_admin());

drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert to authenticated
  with check (reporter_id = public.current_profile_id());

drop policy if exists reports_admin_update on public.reports;
create policy reports_admin_update on public.reports
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- מנויי Push
-- =====================================================================
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

-- =====================================================================
-- הרשאות הרצה לפונקציות
-- =====================================================================
revoke execute on all functions in schema public from public;

grant execute on function
  public.current_profile_id(),
  public.normalize_text(text),
  public.normalize_profession_name(text),
  public.haversine_km(double precision, double precision, double precision, double precision),
  public.search_professionals(text, uuid[], uuid, integer, numeric, numeric, numeric, integer,
    boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, integer, integer),
  public.search_suggestions(text, integer),
  public.feed_posts(text, uuid, integer, integer),
  public.similar_professionals(uuid, integer),
  public.rating_breakdown(uuid),
  public.professional_readiness(uuid),
  public.check_booking_slot(uuid, timestamptz, integer, integer, uuid),
  public.available_slots(uuid, date, integer, integer, integer),
  public.preview_series_dates(date, smallint, time, public.recurrence_frequency, integer, date, integer),
  public.is_conversation_member(uuid, uuid),
  public.professional_is_public(uuid),
  public.owns_professional(uuid, uuid),
  public.can_view_post(uuid),
  public.can_view_address(uuid),
  public.is_booking_party(uuid),
  public.is_blocked_between(uuid, uuid),
  public.is_admin(uuid),
  public.display_name(uuid)
to anon, authenticated;

grant execute on function
  public.get_or_create_direct_conversation(uuid),
  public.record_profile_view(uuid),
  public.record_post_view(uuid),
  public.log_search(text, integer),
  public.generate_series_occurrences(uuid),
  public.materialize_series_bookings(uuid),
  public.admin_stats(),
  public.refresh_response_time(uuid)
to authenticated;

grant execute on all functions in schema public to service_role;
