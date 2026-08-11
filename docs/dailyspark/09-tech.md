# 9. ארכיטקטורה וטכנולוגיות

---

## 9.1 תרשים מערכת

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT (React Native / Expo)               │
│  UI: RN 0.8x · Reanimated 3 · Skia · Expo Router                 │
│  State: Zustand (UI) + TanStack Query (server)                   │
│  Local: op-sqlite (WatermelonDB) + MMKV · Offline-first          │
│  Widgets: WidgetKit (Swift) · Glance (Kotlin)                    │
└────────────────────────┬─────────────────────────────────────────┘
                         │ HTTPS / JSON · JWT
┌────────────────────────▼─────────────────────────────────────────┐
│                    API GATEWAY (Fastify / Node 22, TS)            │
│  Auth · Rate limit · Zod validation · OpenAPI                    │
└──┬──────────────┬─────────────────┬──────────────┬───────────────┘
   │              │                 │              │
┌──▼───────┐ ┌────▼──────┐ ┌────────▼───────┐ ┌───▼────────────┐
│ Spark    │ │ Profile   │ │ Notification   │ │ Billing        │
│ Service  │ │ Service   │ │ Service        │ │ (RevenueCat)   │
└──┬───────┘ └────┬──────┘ └────────┬───────┘ └────────────────┘
   │              │                 │
┌──▼──────────────▼─────────────────▼──────────────────────────────┐
│  DATA LAYER                                                       │
│  PostgreSQL 16 + pgvector   │ Redis (cache, queues)               │
│  S3/R2 (media, exports)     │ ClickHouse (analytics, v2)          │
└──────────────────────────────────────────────────────────────────┘
   │
┌──▼───────────────────────────────────────────────────────────────┐
│  ASYNC WORKERS (BullMQ)                                           │
│  daily-spark-job (03:00 per TZ) · framing-worker · safety-worker  │
│  library-generation (weekly) · insights-worker · embedding-worker │
└──┬───────────────────────────────────────────────────────────────┘
   │
┌──▼───────────────────────────────────────────────────────────────┐
│  AI LAYER — Claude API (Anthropic)                                │
│  claude-haiku-4-5  → framing (ריצה יומית, prompt caching)         │
│  claude-sonnet-5   → insights, generative sparks, Pro tier        │
│  claude-opus-5     → library generation, judge (batch)            │
│  Embeddings: Voyage / OpenAI text-embedding-3-small (384d)        │
└──────────────────────────────────────────────────────────────────┘
```

---

## 9.2 צד לקוח

| רכיב | בחירה | נימוק |
|------|-------|-------|
| **פריימוורק** | **React Native + Expo (SDK 54+)** | קוד אחד ל‑iOS/Android · EAS Build/Update · תמיכת RTL בוגרת · Config Plugins לווידג'טים |
| **שפה** | TypeScript (strict) | חובה למוצר עם חוזי נתונים מורכבים |
| **ניווט** | Expo Router (file‑based) | Deep links מובנים, טיפוסים אוטומטיים |
| **אנימציה** | Reanimated 3 + Gesture Handler | 60/120fps ב‑UI thread |
| **גרפיקה** | React Native Skia | חלקיקי הניצוץ, כרטיס השיתוף, לוח החום |
| **State (UI)** | Zustand | קל, ללא boilerplate |
| **State (שרת)** | TanStack Query + persister | קאש, retry, offline mutations |
| **DB מקומי** | op-sqlite + Drizzle | היסטוריה של שנים, חיפוש מקומי, קריאה סינכרונית |
| **KV מהיר** | MMKV | דגלים, פרופיל, קאש הניצוץ |
| **טפסים** | React Hook Form + Zod | ולידציה משותפת עם השרת |
| **i18n** | i18next + `expo-localization` | עברית/אנגלית, RTL, פלורליזציה |
| **Push** | `expo-notifications` → FCM/APNs | פעולות התראה, ערוצים |
| **תשלומים** | **RevenueCat** | ניהול מנויים חוצה‑פלטפורמות, ניסויי תמחור, webhooks |
| **בדיקות** | Jest + RNTL + Maestro (E2E) | Maestro פשוט משמעותית מ‑Detox |

**למה לא Flutter:** RN מנצח כאן בגלל בשלות RTL בעברית, מערכת הווידג'טים המקורית,
ו‑OTA updates (EAS Update) — קריטי למוצר תוכן שמתעדכן תדיר.

**למה לא Native כפול:** צוות קטן, 10 שבועות ל‑MVP, UI לא כבד גרפית. Native רק לווידג'טים ולשעון.

---

## 9.3 צד שרת

| רכיב | בחירה | נימוק |
|------|-------|-------|
| **Runtime** | Node.js 22 + TypeScript | שיתוף טיפוסים עם הלקוח |
| **Framework** | **Fastify** | מהיר, סכמות JSON מובנות, plugin system נקי |
| **ORM** | Drizzle ORM | SQL‑first, טיפוסים מלאים, migrations שקופות |
| **תורים** | BullMQ (Redis) | jobs מתוזמנים לפי אזור זמן, retry, DLQ |
| **ולידציה** | Zod (משותף עם הלקוח) | מקור אמת יחיד לחוזים |
| **אימות** | Supabase Auth / Clerk | Sign in with Apple חובה ב‑App Store |
| **תיעוד API** | OpenAPI 3.1 אוטומטי מ‑Zod | |

### מסלול מהיר ל‑MVP
**Supabase** (Postgres + Auth + Storage + Edge Functions) לחודשים 1–6 —
מקצר משמעותית זמן פיתוח. `pgvector` נתמך מובנה.
**מסלול יציאה מתוכנן:** Postgres נשאר; מוציאים רק Auth ו‑Functions כשה‑scale מצדיק.

### פריסה
- **Fly.io** (multi‑region, קרוב למשתמשים) או **Railway** ל‑MVP.
- Docker + GitHub Actions → deploy אוטומטי מ‑`main`.
- Cloudflare R2 לאחסון + CDN (יצוא PDF, כרטיסי שיתוף).

---

## 9.4 בסיס נתונים

**PostgreSQL 16** — הבחירה הנכונה כי היא נותנת בכלי אחד:
נתונים יחסיים · חיפוש וקטורי (`pgvector`) · JSONB לפרופילים · חיפוש טקסט מלא · אנליטיקה בסיסית.

| הרחבה | שימוש |
|-------|-------|
| `pgvector` | HNSW index על embeddings של ניצוצות (384d) |
| `pg_trgm` | חיפוש טקסט עמיד לשגיאות כתיב בעברית |
| `pg_cron` | תזמון jobs יומיים |
| `pgcrypto` | הצפנת הערות אישיות |

**Redis:** קאש ניצוץ יומי · תורי BullMQ · rate limiting · דגלי פיצ'רים.
**ClickHouse (v2):** אירועי אנליטיקה בקנה מידה — כשעוברים 50M אירועים/חודש.

**סכמה מלאה:** ראה [`A-data-model.sql`](A-data-model.sql).

---

## 9.5 שכבת ה‑AI

| שימוש | מודל | נימוק |
|-------|------|-------|
| ניסוח אישי יומי | `claude-haiku-4-5-20251001` | מהיר וזול; מספיק לניסוח מחדש בכללים ברורים |
| תובנות שבועיות | `claude-sonnet-5` | דורש הסקה על נתונים והבנת דפוסים |
| ניצוצות generative (Pro) | `claude-sonnet-5` | איכות יצירה גבוהה בזמן סביר |
| יצירת ספרייה (batch) | `claude-opus-5` | האיכות הגבוהה ביותר; רץ אחת לשבוע, עלות מבוזרת |
| שופט איכות | `claude-opus-5` (batch) | הערכה מדויקת מול רובריקה |
| מסווג בטיחות | מסווג ייעודי + חוקים + `claude-haiku-4-5` | שכבות הגנה מרובות |

**טכניקות חובה:**
- **Prompt Caching** על ה‑system prompt (~85% חיסכון בטוקני קלט).
- **Structured Outputs / Tool use** לאכיפת סכמת JSON — לא פרסינג של טקסט חופשי.
- **Batch API** ליצירת ספרייה ולהערכות — 50% הנחה.
- **Fallback ניהולי:** timeout של 4 שניות → נפילה לניצוץ הבסיסי ללא ניסוח.

**Embeddings:** `text-embedding-3-small` (384 מימדים) או Voyage — מספיק ל‑retrieval סמנטי, זול, מהיר.

---

## 9.6 תשתית תומכת

| תחום | כלי |
|------|-----|
| **אנליטיקה** | PostHog (self‑hosted או cloud) — אירועים, funnels, cohorts, feature flags, A/B |
| **ניטור שגיאות** | Sentry (RN + Node) עם source maps |
| **Observability** | OpenTelemetry → Grafana Cloud (traces, metrics, logs) |
| **דגלי פיצ'רים** | PostHog Flags — פריסה הדרגתית של מודלים ופרומפטים |
| **CI/CD** | GitHub Actions + EAS Build/Submit/Update |
| **Crash‑free target** | ≥ 99.5% sessions |
| **Secrets** | Doppler / GitHub OIDC — אף פעם לא בקוד |
| **תמיכה** | Intercom או Crisp + מרכז עזרה |
| **ASO** | AppTweak / Sensor Tower |

---

## 9.7 אבטחה

| נושא | יישום |
|------|-------|
| תעבורה | TLS 1.3, HSTS, certificate pinning בלקוח |
| מנוחה | הצפנת דיסק; שדות רגישים (הערות) ב‑`pgcrypto` |
| אימות | JWT קצר‑חיים (15 דק') + refresh token מסתובב |
| הרשאות | Row Level Security ב‑Postgres — משתמש רואה רק את שורותיו |
| Rate limiting | לכל IP ולכל משתמש; קפדני על נתיבי AI |
| קלט | ולידציית Zod בשני הצדדים; אסקייפ בכל פלט |
| Prompt injection | קלט משתמש (מטרה חופשית, הערה) עובר סניטציה + מובלע כ‑data, לא כהוראות; פלט LLM מאומת מול סכמה |
| תלויות | Dependabot + `npm audit` ב‑CI |
| מובייל | ללא סודות בקוד הלקוח; זיהוי jailbreak/root לנתיבי חיוב |
| Pen test | לפני השקה ציבורית ואחת לשנה |

---

## 9.8 ביצועים — תקציבים

| מדד | יעד |
|-----|-----|
| Cold start → ניצוץ מוצג | < 1.2 שניות |
| Warm start | < 400ms |
| `GET /v1/today` (p95) | < 180ms |
| גודל אפליקציה (Android) | < 32MB |
| שימוש בסוללה (יומי) | < 0.4% |
| שימוש ברשת (יומי) | < 120KB |
| Frame rate | 60fps (120 במכשירים תומכים) |
| Crash‑free sessions | ≥ 99.5% |

---

## 9.9 עלויות תשתית משוערות

| רכיב | 10K MAU | 100K MAU |
|------|---------|----------|
| מחשוב (Fly.io) | $85 | $520 |
| Postgres מנוהל | $60 | $340 |
| Redis | $25 | $110 |
| אחסון + CDN (R2) | $12 | $95 |
| Claude API | $190 | $1,750 |
| Embeddings | $8 | $65 |
| PostHog | $0 (free tier) | $340 |
| Sentry | $29 | $180 |
| RevenueCat | 1% מההכנסה מעל $2.5K MTR | ~$420 |
| **סה"כ/חודש** | **≈ $409** | **≈ $3,820** |
| **לכל MAU** | **$0.041** | **$0.038** |

---

## 9.10 מבנה הריפו (Monorepo)

```
dailyspark/
├── apps/
│   ├── mobile/           # Expo · React Native
│   ├── api/              # Fastify
│   ├── workers/          # BullMQ jobs
│   └── admin/            # Next.js — CMS תוכן, ביקורת, דשבורדים
├── packages/
│   ├── contracts/        # סכמות Zod + טיפוסים משותפים
│   ├── ui/               # ספריית רכיבים
│   ├── ai/               # פרומפטים, סכמות, לקוחות מודל
│   ├── db/               # Drizzle schema + migrations
│   └── analytics/        # טקסונומיית אירועים מוקלדת
├── content/
│   ├── library/          # ניצוצות בקרה (YAML/JSON)
│   └── prompts/          # פרומפטים בגרסאות (versioned)
└── docs/
```

**Turborepo + pnpm** לניהול, עם `contracts` כמקור אמת יחיד לטיפוסים בין לקוח לשרת.
