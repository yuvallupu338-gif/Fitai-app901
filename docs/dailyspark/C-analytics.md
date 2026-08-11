# נספח C — טקסונומיית אירועים ואנליטיקה

**מוסכמה:** `object_action` בלשון עבר · snake_case · מאפיינים בלי PII.
**מאפיינים גלובליים בכל אירוע:** `user_id_hash` · `tier` · `locale` · `platform` ·
`app_version` · `days_since_install` · `experiment_variants[]` · `local_hour` · `weekday`.

---

## C.1 מחזור חיים

| אירוע | מאפייני מפתח | למה חשוב |
|-------|---------------|-----------|
| `app_installed` | `source`, `campaign` | ייחוס |
| `app_opened` | `entry_point` (icon\|notification\|widget\|deeplink) | מקורות פתיחה |
| `session_ended` | `duration_ms`, `screens_viewed` | **guardrail** — עלייה = הפכנו לפיד |
| `account_created` | `provider`, `was_guest`, `days_as_guest` | חיכוך הרשמה |

## C.2 אונבורדינג

| אירוע | מאפיינים |
|-------|-----------|
| `onboarding_started` | — |
| `onboarding_step_completed` | `step` (1‑5), `skipped`, `time_on_step_ms` |
| `onboarding_goals_selected` | `count`, `keys[]`, `has_custom` |
| `onboarding_interests_selected` | `count`, `keys[]` |
| `onboarding_completed` | `total_duration_ms`, `steps_skipped` |
| `onboarding_abandoned` | `last_step` ← **המדד הכי חשוב לאופטימיזציה** |
| `first_spark_shown` | `time_from_install_ms` ← יעד: חציון < 75,000 |

## C.3 לולאת הניצוץ (הליבה)

| אירוע | מאפיינים |
|-------|-----------|
| `spark_delivered` | `spark_id`, `type`, `category`, `size`, `rank_score`, `was_framed`, `source` |
| `spark_viewed` | `entry_point`, `seconds_since_delivery` |
| `spark_expanded` | `dwell_before_ms` |
| `spark_completed` | `dwell_ms`, `used_timer`, `mood`, `energy`, `time_of_day` |
| `spark_deferred` | `dwell_ms` |
| `spark_rejected` | `reason`, `dwell_ms` |
| `spark_rerolled` | `rerolls_used_today`, `rejected_spark_id` |
| `spark_saved` / `spark_shared` | `collection_id` / `channel` |
| `spark_note_added` | `char_count` (לא התוכן) |
| `spark_missed` | `hours_since_delivery` |
| `mood_logged` | `mood`, `energy`, `skipped` |

**מדד נגזר — WAS:** `count(spark_completed) / active_users` בחלון שבועי. מוגדר כ‑insight קבוע ב‑PostHog.

## C.4 התראות

| אירוע | מאפיינים |
|-------|-----------|
| `notification_permission_prompted` | `attempt`, `context` |
| `notification_permission_result` | `granted`, `attempt` |
| `notification_scheduled` | `type`, `slot`, `chosen_by` (user\|bandit) |
| `notification_sent` | `type`, `slot` |
| `notification_suppressed` | `type`, `reason` (quiet\|budget\|dnd\|ladder) |
| `notification_opened` | `type`, `latency_ms` |
| `notification_action_taken` | `type`, `action` (done\|later) ← ללא פתיחת אפליקציה |
| `notification_ladder_changed` | `from`, `to`, `automatic` |
| `notification_disabled` | `via` (app\|os) |

**מדד ראשי לערוץ — Acted‑per‑Sent:** `spark_completed` המיוחסים / `notification_sent`.

## C.5 מונטיזציה

| אירוע | מאפיינים |
|-------|-----------|
| `paywall_viewed` | `trigger`, `days_since_install`, `sparks_completed_to_date` |
| `paywall_plan_selected` | `plan`, `period` |
| `paywall_dismissed` | `seconds_on_screen`, `scrolled_to_faq` |
| `trial_started` | `plan`, `trigger` |
| `trial_reminder_sent` | `days_left` |
| `subscription_started` | `plan`, `period`, `price_local`, `currency`, `from_trial` |
| `subscription_canceled` | `days_active`, `reason_selected` |
| `subscription_renewed` / `refund_issued` | `period_number` / `days_since_purchase` |

## C.6 פיצ׳רים

`history_viewed` · `history_searched` (`result_count`, `is_semantic`) · `heatmap_viewed` ·
`collection_created` · `insight_viewed` (`week`) · `insight_action_applied` (`action_type`) ·
`journey_started` / `journey_step_completed` / `journey_paused` ·
`profile_updated` (`fields[]`) · `widget_added` (`size`) · `export_requested` · `content_reported` (`reason`)

## C.7 איכות ומערכת

| אירוע | מאפיינים |
|-------|-----------|
| `spark_generation_failed` | `stage` (retrieval\|ranking\|framing\|safety), `fallback_used` |
| `safety_gate_blocked` | `check`, `spark_id` ← **ניטור יומי חובה** |
| `api_error` | `endpoint`, `status`, `retryable` |
| `offline_mode_entered` | `duration_ms` |
| `sync_conflict_resolved` | `strategy` |

---

## C.8 לוחות מחוונים

**1 · לוח יומי (Health)** — DAU/WAU/MAU · WAS · Completion Rate · crash‑free ·
p95 של `GET /today` · `safety_gate_blocked` · עלות AI ליום

**2 · לוח שימור** — עקומות retention לפי קוהורטה · retention לפי סגמנט אונבורדינג ·
מפת נשירה (באיזה יום ובאיזה מסך) · השפעת סוג התראה על D7

**3 · לוח תוכן** — Top/Bottom 20 ניצוצות לפי completion · rejection rate לפי קטגוריה ·
ציון חדשנות · פערים בטקסונומיה · ביצועי ניצוצות generative מול curated

**4 · לוח מונטיזציה** — משפך מלא · המרה לפי טריגר Paywall · trial→paid ·
churn לפי קוהורטה · LTV לפי ערוץ רכישה · ARPU לפי מדינה

**5 · לוח ניסויים** — ניסויים פעילים · מובהקות · **guardrails** (opt‑out, uninstall,
rejection rate, session duration) עם עצירה אוטומטית

---

## C.9 מסגרת ניסויים

**כללים:**
- הקצאה יציבה לפי `hash(user_id + experiment_slug)` — משתמש נשאר בזרוע לאורך כל הניסוי.
- מדד ראשי מוצהר **מראש**; משך מינימלי 14 יום (למניעת אפקט חידוש).
- מדדי guardrail נבדקים אוטומטית מדי יום; חריגה של 20% יחסית → עצירה והתראה.
- ניתוח sequential (mSPRT) כדי לא "להציץ" ולהסיק מוקדם מדי.
- ניסויים על מודלים ופרומפטים מנוהלים דרך feature flags עם פריסה הדרגתית 5% → 25% → 100%.

**גדלי מדגם מינימליים (power 0.8, α 0.05):**
| מדד | Baseline | אפקט מזוהה מינימלי | N לזרוע |
|-----|----------|---------------------|---------|
| Spark Completion | 42% | +3pp | ~4,200 |
| D7 Retention | 28% | +3pp | ~3,600 |
| Trial Start | 12% | +2pp | ~4,000 |
| Notification Open | 41% | +4pp | ~2,400 |

---

## C.10 פרטיות באנליטיקה

- אין PII באירועים. `user_id_hash` = HMAC עם מפתח מסתובב.
- תוכן חופשי (מטרות אישיות, הערות) **לעולם** לא נשלח כמאפיין — רק `char_count` או `has_custom`.
- ATT (iOS): כברירת מחדל אנחנו **לא** מבקשים — אין לנו tracking בין‑אפליקציות.
- שמירת אירועים גולמיים 14 חודשים → אגרגציה בלבד.
- Opt‑out מלא מאנליטיקה בהגדרות; המוצר עובד במלואו גם בלעדיה.
