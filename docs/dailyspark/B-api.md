# נספח B — חוזי API

**בסיס:** `https://api.dailyspark.app/v1`
**אימות:** `Authorization: Bearer <JWT>` · אורח מקבל JWT אנונימי בהתקנה
**כותרות חובה:** `X-Device-Id` · `X-App-Version` · `X-Timezone` · `Accept-Language`
**פורמט:** JSON · תאריכים ISO‑8601 · תאריכים לוגיים `YYYY-MM-DD` באזור הזמן של המשתמש

---

## B.1 הניצוץ היומי

### `GET /today`
מחזיר את הניצוץ של היום הלוגי. אידמפוטנטי — קריאות חוזרות מחזירות אותו פריט.

```jsonc
// 200 OK
{
  "userSparkId": "usp_01J8X...",
  "localDate": "2026-08-11",
  "spark": {
    "id": "spk_7f3a9c",
    "type": "action",
    "category": "movement",
    "size": "micro",
    "timeBudgetSeconds": 240,
    "title": "ארבע דקות בחוץ",
    "body": "יש לך רווח קצר לפני הפגישה הבאה. הוא שווה יותר בחוץ מאשר בסלאק.",
    "action": "צא החוצה ל-4 דקות. בלי אוזניות, בלי טלפון ביד.",
    "expansion": "…",
    "easierVariant": "…"
  },
  "whyThis": "כי סימנת 'יותר תנועה', והיומן שלך צפוף היום.",
  "status": "delivered",
  "isSaved": false,
  "rerollsRemaining": 1,
  "streak": { "current": 12, "longest": 19, "freezesAvailable": 1 },
  "nextSparkAt": "2026-08-12T00:00:00+03:00"
}
```

| שגיאה | קוד | טיפול בלקוח |
|-------|-----|--------------|
| `SPARK_NOT_READY` | 202 | הצג ניצוץ מהקאש; נסה שוב בעוד 30 שניות |
| `UNAUTHORIZED` | 401 | רענון טוקן → אורח חדש אם נכשל |
| `RATE_LIMITED` | 429 | backoff אקספוננציאלי |

**קאשינג:** `Cache-Control: private, max-age=300` · תמיכה ב‑`ETag`.

### `POST /sparks/{userSparkId}/feedback`
```jsonc
// Request
{ "signal": "completed",        // completed | deferred | rejected | saved | shared | expanded | timer_used
  "rejectReason": null,          // irrelevant | cliche | too_much | wrong_tone
  "dwellMs": 9400,
  "clientTs": "2026-08-11T08:44:12+03:00" }

// 200 OK
{ "accepted": true,
  "streak": { "current": 13, "changed": true },
  "milestone": null }            // או { "type": "days", "value": 30 }
```
**אידמפוטנטיות:** כותרת `Idempotency-Key` חובה. שליחה חוזרת של אותו מפתח מחזירה את התוצאה המקורית.
**Offline:** הלקוח מתייג בתור ושולח `clientTs`; השרת מקבל אירועים עד 72 שעות אחורה.

### `POST /sparks/{userSparkId}/reroll`
```jsonc
// 200 OK — ניצוץ חלופי באותה מבנה כמו /today
{ "userSparkId": "usp_...", "spark": {...}, "rerollsRemaining": 0 }
// 402 Payment Required
{ "error": "REROLL_LIMIT", "upgradeTo": "pro", "resetsAt": "2026-08-12T00:00:00+03:00" }
```

### `POST /sparks/{userSparkId}/note`
```jsonc
{ "note": "עשיתי את זה בדרך לעבודה. היה טוב." }
```
ההערה מוצפנת בשרת. **אינה** נשלחת למודלים אלא אם `ai_context_optin.notes = true`.

---

## B.2 מצב רגשי

### `POST /mood`
```jsonc
// Request
{ "localDate": "2026-08-11", "mood": "overloaded", "energy": 2 }

// 200 OK — אם הניצוץ טרם נפתח, הוא מותאם מחדש מיידית
{ "accepted": true, "sparkAdjusted": true, "newSize": "micro" }
```

---

## B.3 ספר הניצוצות

### `GET /history`
| פרמטר | ברירת מחדל | הערות |
|-------|-------------|-------|
| `cursor` | — | Cursor pagination (base64 של `local_date,id`) |
| `limit` | 30 | מקסימום 100 |
| `status` | הכל | `completed` \| `deferred` \| `rejected` |
| `category` | הכל | |
| `from` / `to` | — | טווח תאריכים |
| `savedOnly` | false | |

```jsonc
{ "items": [ { "userSparkId": "...", "localDate": "2026-08-10",
               "title": "...", "category": "focus", "status": "completed",
               "isSaved": true } ],
  "nextCursor": "eyJk...",
  "lockedBefore": "2026-07-12"   // Free: פריטים לפני התאריך נעולים
}
```

### `GET /history/heatmap?year=2026`
```jsonc
{ "days": { "2026-08-10": 2, "2026-08-11": 1 },  // 0=לא נמסר 1=נמסר 2=בוצע
  "totals": { "delivered": 214, "completed": 121, "longestStreak": 19 } }
```

### `GET /history/search?q=...`  `Plus`
חיפוש היברידי: טקסט מלא (`pg_trgm`) + סמנטי (embedding של השאילתה).

---

## B.4 פרופיל והתאמה אישית

| שיטה | נתיב | תיאור |
|------|------|-------|
| `GET` | `/profile` | פרופיל מלא + מטרות + תחומים + הרגלים |
| `PATCH` | `/profile` | עדכון חלקי (טון, תקציב זמן, נושאים חסומים, opt‑ins) |
| `POST` / `PATCH` / `DELETE` | `/goals[/{id}]` | ניהול מטרות |
| `PUT` | `/interests` | החלפת מפת התחומים במלואה |
| `POST` / `PATCH` / `DELETE` | `/habits[/{id}]` | ניהול הרגלים |

```jsonc
// PATCH /profile — 200 OK
{ "updated": true,
  "effectiveFrom": "2026-08-12",
  "message": "הניצוץ של מחר כבר יביא את זה בחשבון." }
```

### `POST /profile/preview`
תצוגה מקדימה חיה של ניצוץ בטון נבחר (למסך S5d). לא נשמר, לא משפיע על המנוע.

---

## B.5 תובנות ומסעות

```
GET  /insights/weekly?week=2026-W32        → תובנה שבועית + נתוני גרפים
POST /insights/weekly/{id}/apply           → החלת פעולת הכוונון המוצעת
GET  /journeys                              → ספריית מסעות
POST /journeys/{slug}/start                 → התחלת מסע
POST /user-journeys/{id}/pause | /resume    → השהיה/חידוש
```

```jsonc
// GET /insights/weekly
{ "week": "2026-W32",
  "narrative": "ביצעת 4 מתוך 7. שלושתם לפני 10:00…",
  "byWeekday":  [1,1,0,1,0,0,1],
  "byHour":     { "07": 1, "08": 2, "09": 1 },
  "topCategories": [ {"key":"movement","rate":0.71}, {"key":"focus","rate":0.45} ],
  "suggestedAction": { "type": "shift_send_time", "label": "העבר את ההתראה ל-08:40",
                       "payload": { "hour": 8, "minute": 40 } },
  "hasEnoughData": true }
```

---

## B.6 התראות

```
POST   /devices                    → רישום push token
DELETE /devices/{id}               → הסרה
GET    /notifications/prefs        → העדפות
PATCH  /notifications/prefs        → עדכון (כולל ladderLevel)
POST   /notifications/test         → התראת בדיקה (rate limit: 3/יום)
```

**Webhook נכנס — פעולה מהירה מההתראה:**
`POST /notifications/action` עם `{ "notificationId": "...", "action": "done" }` —
מאפשר סימון ביצוע ללא פתיחת האפליקציה.

---

## B.7 מנוי

```
GET  /subscription                 → מצב נוכחי
POST /subscription/sync            → סנכרון מ-RevenueCat אחרי רכישה
POST /webhooks/revenuecat          → webhook (חתום, לא נגיש ללקוח)
```

---

## B.8 נתונים ופרטיות

```
POST /account/export               → מייצר יצוא (JSON+CSV), 202 + jobId
GET  /account/export/{jobId}       → קישור חתום לקובץ (תוקף 24 שעות)
DELETE /account                    → מחיקה: soft delete מיידי, purge אחרי 30 יום
POST /content-reports              → דיווח על ניצוץ
```

---

## B.9 מוסכמות רוחביות

**מבנה שגיאה אחיד:**
```jsonc
{ "error": { "code": "REROLL_LIMIT",
             "message": "הגעת למכסת ההחלפות היומית.",
             "retryable": false,
             "meta": { "resetsAt": "2026-08-12T00:00:00+03:00" } } }
```

**Rate limits:**
| נתיב | מגבלה |
|------|--------|
| `GET /today` | 60/שעה למשתמש |
| `POST /*/feedback` | 120/שעה |
| `POST /*/reroll` | לפי שכבה + 10/שעה קשיח |
| `POST /profile/preview` | 20/שעה |
| `POST /account/export` | 3/יום |

**Versioning:** נתיב `/v1`. שינויים שוברים → `/v2` עם 6 חודשי חפיפה.
**Idempotency:** חובה בכל `POST` שמשנה מצב.
**סנכרון offline:** `POST /sync/batch` מקבל עד 200 אירועים בתור, ממוינים לפי `clientTs`.
