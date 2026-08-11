-- =====================================================================
-- DailySpark · Data Model (PostgreSQL 16 + pgvector)
-- נספח A למסמך האפיון
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
CREATE TYPE spark_type      AS ENUM ('quote', 'action', 'tip');
CREATE TYPE spark_size      AS ENUM ('micro', 'standard', 'stretch');
CREATE TYPE spark_status    AS ENUM ('draft', 'in_review', 'approved', 'retired', 'blocked');
CREATE TYPE spark_source    AS ENUM ('curated', 'generated', 'creator', 'user_request');
CREATE TYPE tone            AS ENUM ('gentle', 'direct', 'humorous', 'stoic', 'practical');
CREATE TYPE mood            AS ENUM ('energized', 'calm', 'busy', 'tired', 'overloaded', 'flat');
CREATE TYPE delivery_status AS ENUM ('scheduled', 'delivered', 'opened', 'completed',
                                     'deferred', 'rejected', 'missed');
CREATE TYPE tier            AS ENUM ('free', 'plus', 'pro');

-- ---------------------------------------------------------------------
-- USERS & PROFILE
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email              citext UNIQUE,
  auth_provider      text,                       -- apple | google | email | guest
  locale             text        NOT NULL DEFAULT 'he-IL',
  timezone           text        NOT NULL DEFAULT 'Asia/Jerusalem',
  country_code       char(2),
  tier               tier        NOT NULL DEFAULT 'free',
  is_guest           boolean     NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_active_at     timestamptz,
  deleted_at         timestamptz                  -- soft delete → purge job אחרי 30 יום
);

CREATE TABLE profiles (
  user_id            uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name       text,
  preferred_tone     tone        NOT NULL DEFAULT 'practical',
  time_budget_min    smallint    NOT NULL DEFAULT 5    CHECK (time_budget_min IN (1, 5, 15)),
  typical_energy     smallint    NOT NULL DEFAULT 3    CHECK (typical_energy BETWEEN 1 AND 5),
  blocked_topics     text[]      NOT NULL DEFAULT '{}',
  ai_context_optin   jsonb       NOT NULL DEFAULT '{"calendar":false,"health":false,"weather":false,"notes":false}',
  onboarding_segment smallint,                          -- 0..11 · צנטרואיד cold-start
  -- וקטור מצב המשתמש (384d): taxonomy(128) ‖ behavior(192) ‖ context(64)
  state_vector       vector(384),
  vector_updated_at  timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE goals (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label         text NOT NULL,
  taxonomy_key  text,                    -- NULL אם מטרה חופשית
  embedding     vector(384),
  rank          smallint NOT NULL DEFAULT 0,
  active        boolean  NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON goals (user_id) WHERE active;

CREATE TABLE interests (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_key    text NOT NULL,
  weight       smallint NOT NULL DEFAULT 1 CHECK (weight IN (0, 1, 2)),  -- לא | מעניין | חשוב לי
  PRIMARY KEY (user_id, topic_key)
);

CREATE TABLE habits (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label        text NOT NULL,
  taxonomy_key text,
  cadence      text NOT NULL DEFAULT 'daily',   -- daily | 3x_week | weekly
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- SPARK LIBRARY
-- ---------------------------------------------------------------------
CREATE TABLE sparks (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type                spark_type   NOT NULL,
  category            text         NOT NULL,
  topics              text[]       NOT NULL DEFAULT '{}',
  size                spark_size   NOT NULL,
  time_budget_seconds int          NOT NULL CHECK (time_budget_seconds BETWEEN 30 AND 1800),
  energy_level        smallint     NOT NULL CHECK (energy_level BETWEEN 1 AND 5),
  mood_safe_for       mood[]       NOT NULL DEFAULT '{}',   -- מצבים שבהם מותר להגיש
  tone                tone         NOT NULL,
  locale              text         NOT NULL DEFAULT 'he-IL',

  title               text NOT NULL CHECK (char_length(title)  <= 42),
  body                text NOT NULL CHECK (char_length(body)   <= 220),
  action              text NOT NULL CHECK (char_length(action) <= 90),
  expansion           text,
  easier_variant      text,
  attribution         text,                                  -- מקור/יוצר אם רלוונטי

  embedding           vector(384),
  source              spark_source NOT NULL DEFAULT 'curated',
  creator_id          uuid,
  status              spark_status NOT NULL DEFAULT 'draft',
  quality_scores      jsonb        NOT NULL DEFAULT '{}',    -- actionability/specificity/novelty/safety
  safety_flags        text[]       NOT NULL DEFAULT '{}',
  prompt_version      text,
  model_used          text,

  delivered_count     bigint NOT NULL DEFAULT 0,
  completed_count     bigint NOT NULL DEFAULT 0,
  rejected_count      bigint NOT NULL DEFAULT 0,

  created_at          timestamptz NOT NULL DEFAULT now(),
  approved_at         timestamptz,
  retired_at          timestamptz
);

-- אינדקס ANN לאחזור סמנטי
CREATE INDEX sparks_embedding_hnsw ON sparks
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX sparks_filter_idx ON sparks (locale, status, size, energy_level);
CREATE INDEX sparks_topics_gin ON sparks USING gin (topics);
CREATE INDEX sparks_title_trgm ON sparks USING gin (title gin_trgm_ops);

-- ---------------------------------------------------------------------
-- DELIVERIES  (ניצוץ שנמסר למשתמש ספציפי)
-- ---------------------------------------------------------------------
CREATE TABLE user_sparks (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           uuid NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  spark_id          uuid NOT NULL REFERENCES sparks(id),
  local_date        date NOT NULL,                    -- היום הלוגי באזור הזמן של המשתמש

  -- הגרסה שנמסרה בפועל (אחרי שכבת הניסוח האישי)
  framed_title      text,
  framed_body       text,
  framed_action     text,
  why_this          text,
  framing_model     text,
  framing_tokens    int,

  -- הקשר בזמן המסירה — לניתוח ולאימון
  context_snapshot  jsonb NOT NULL DEFAULT '{}',      -- mood, energy, weekday, calendar_density...
  rank_score        real,
  rank_explain      jsonb,                            -- פירוק רכיבי הציון · מזין את "למה קיבלת את זה"

  status            delivery_status NOT NULL DEFAULT 'scheduled',
  scheduled_for     timestamptz,
  delivered_at      timestamptz,
  opened_at         timestamptz,
  responded_at      timestamptz,
  reject_reason     text,                             -- irrelevant | cliche | too_much | wrong_tone
  dwell_ms          int,
  is_saved          boolean NOT NULL DEFAULT false,
  user_note         bytea,                            -- pgp_sym_encrypt — לא נשלח למודל כברירת מחדל
  reward            real,                             -- התגמול המחושב (5.2.2)

  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, local_date)                        -- ניצוץ אחד ליום. זו הליבה.
);
CREATE INDEX ON user_sparks (user_id, local_date DESC);
CREATE INDEX ON user_sparks (user_id, spark_id);
CREATE INDEX ON user_sparks (status, scheduled_for) WHERE status = 'scheduled';

-- ---------------------------------------------------------------------
-- FEEDBACK & MOOD
-- ---------------------------------------------------------------------
CREATE TABLE interactions (
  id             bigserial PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_spark_id  uuid REFERENCES user_sparks(id) ON DELETE CASCADE,
  signal         text NOT NULL,        -- completed|saved|shared|expanded|dwell|timer_used|
                                       -- deferred|rerolled|rejected|ignored|note_added
  value          real NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON interactions (user_id, created_at DESC);

CREATE TABLE mood_checkins (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date  date NOT NULL,
  mood        mood     NOT NULL,
  energy      smallint NOT NULL CHECK (energy BETWEEN 1 AND 5),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, local_date)
);

-- ---------------------------------------------------------------------
-- BANDIT STATE  (פוסטריור לכל משתמש)
-- ---------------------------------------------------------------------
CREATE TABLE bandit_state (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mu            real[]  NOT NULL,      -- ממוצע פוסטריור
  sigma_diag    real[]  NOT NULL,      -- אלכסון מטריצת השונות (קירוב יעיל)
  updates       int     NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE send_time_bandit (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot        smallint NOT NULL,       -- 0..5 → 06:30 / 07:30 / 08:30 / 12:30 / 17:30 / 20:30
  alpha       real NOT NULL DEFAULT 1, -- Beta prior
  beta        real NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, slot)
);

-- ---------------------------------------------------------------------
-- STREAKS & COLLECTIONS
-- ---------------------------------------------------------------------
CREATE TABLE streaks (
  user_id            uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_length     int  NOT NULL DEFAULT 0,
  longest_length     int  NOT NULL DEFAULT 0,
  last_activity_date date,
  freezes_available  smallint NOT NULL DEFAULT 2,
  freezes_used_month smallint NOT NULL DEFAULT 0,
  freeze_reset_at    date
);

CREATE TABLE collections (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE collection_items (
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  user_spark_id uuid NOT NULL REFERENCES user_sparks(id) ON DELETE CASCADE,
  added_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, user_spark_id)
);

-- ---------------------------------------------------------------------
-- JOURNEYS
-- ---------------------------------------------------------------------
CREATE TABLE journeys (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          text UNIQUE NOT NULL,
  title         text NOT NULL,
  description   text,
  days          smallint NOT NULL,
  category      text NOT NULL,
  effort        smallint NOT NULL CHECK (effort BETWEEN 1 AND 3),
  required_tier tier NOT NULL DEFAULT 'pro',
  locale        text NOT NULL DEFAULT 'he-IL'
);

CREATE TABLE journey_steps (
  journey_id uuid NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  day_index  smallint NOT NULL,
  spark_id   uuid NOT NULL REFERENCES sparks(id),
  is_optional boolean NOT NULL DEFAULT false,
  PRIMARY KEY (journey_id, day_index)
);

CREATE TABLE user_journeys (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  journey_id    uuid NOT NULL REFERENCES journeys(id),
  current_day   smallint NOT NULL DEFAULT 1,
  state         text NOT NULL DEFAULT 'active',   -- active | paused | completed | abandoned
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);

-- ---------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------
CREATE TABLE devices (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  push_token    text NOT NULL,
  platform      text NOT NULL,          -- ios | android
  app_version   text,
  os_version    text,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (push_token)
);

CREATE TABLE notification_prefs (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled_types    text[]   NOT NULL DEFAULT ARRAY['N1','N3','N4','N5','N8','N10'],
  ladder_level     smallint NOT NULL DEFAULT 0,   -- 0=יומי … 5=כבוי
  quiet_start      time     NOT NULL DEFAULT '22:00',
  quiet_end        time     NOT NULL DEFAULT '07:00',
  preferred_hour   smallint,                       -- NULL = תן ל-AI לבחור
  weekly_budget    smallint NOT NULL DEFAULT 7
);

CREATE TABLE notification_log (
  id             bigserial PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type           text NOT NULL,          -- N1..N10
  user_spark_id  uuid REFERENCES user_sparks(id),
  scheduled_for  timestamptz NOT NULL,
  sent_at        timestamptz,
  opened_at      timestamptz,
  action_taken   text,                   -- done | later | opened | dismissed
  slot           smallint,
  suppressed_reason text                 -- quiet_hours | budget | dnd | ladder
);
CREATE INDEX ON notification_log (user_id, sent_at DESC);

-- ---------------------------------------------------------------------
-- BILLING · MODERATION · EXPERIMENTS
-- ---------------------------------------------------------------------
CREATE TABLE subscriptions (
  user_id            uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rc_customer_id     text,                    -- RevenueCat
  tier               tier NOT NULL DEFAULT 'free',
  product_id         text,
  period             text,                    -- monthly | annual | lifetime
  status             text,                    -- trialing | active | grace | expired | canceled
  trial_ends_at      timestamptz,
  renews_at          timestamptz,
  canceled_at        timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE content_reports (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  spark_id      uuid REFERENCES sparks(id),
  user_spark_id uuid REFERENCES user_sparks(id),
  reason        text NOT NULL,
  detail        text,
  status        text NOT NULL DEFAULT 'open',  -- open | reviewed | actioned | dismissed
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE experiment_assignments (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  experiment  text NOT NULL,
  variant     text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, experiment)
);

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY — משתמש רואה רק את שורותיו
-- ---------------------------------------------------------------------
ALTER TABLE user_sparks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE mood_checkins    ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;

CREATE POLICY own_rows ON user_sparks
  USING (user_id = current_setting('app.user_id', true)::uuid);
-- (מדיניות מקבילה לכל טבלה עם user_id)

-- ---------------------------------------------------------------------
-- VIEWS לאנליטיקה
-- ---------------------------------------------------------------------
CREATE VIEW v_weekly_acted_sparks AS
SELECT user_id,
       date_trunc('week', local_date) AS week,
       count(*) FILTER (WHERE status = 'completed') AS acted_sparks,
       count(*)                                     AS delivered
FROM user_sparks
GROUP BY 1, 2;

CREATE VIEW v_spark_performance AS
SELECT s.id, s.title, s.category, s.size,
       s.delivered_count,
       round(s.completed_count::numeric / NULLIF(s.delivered_count, 0), 3) AS completion_rate,
       round(s.rejected_count::numeric  / NULLIF(s.delivered_count, 0), 3) AS rejection_rate,
       (s.quality_scores->>'actionability')::real AS actionability
FROM sparks s
WHERE s.status = 'approved';
