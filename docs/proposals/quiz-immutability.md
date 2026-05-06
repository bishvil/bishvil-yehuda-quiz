# Proposal — Quiz Immutability + Duplicate

> Status: proposed (not yet implemented)
> Owner: TBD
> Related: ADR-0006 (answer policy), ADR-0009 (host pre-start cancellation), ADR-0010 (storage policy)

## הרעיון

**Decision:** חידון שכבר נוצר ממנו ולו סשן אחד (בכל סטטוס:
`scheduled` / `live` / `paused` / `ended` / `draft`) הופך ל־**immutable**.
כדי לערוך — משכפלים את החידון לעותק חדש ונקי.

**Why:** ניקוי ארכיטקטוני. מסיר את כל מנגנון guard הציון, ה־rescore,
ו־force-edit — כי הקונפליקט בין "תבנית עריכה" ל"מקור אמת היסטורי"
פשוט לא קיים יותר. מודל מוצר נפוץ ובדוק (Google Forms, Kahoot, Quizizz).

## What's removed

- `SCORES_LOCKED` + `?force=1` + `requiresRescore` + `detectScoreAffectingChanges`
  ב־`app/api/admin/quizzes/[id]/questions/[questionId]/route.ts`.
- `mapGeoScoreChanged` (אותו קובץ).
- `POST /api/admin/sessions/[id]/rescore` (אם קיים).
- `ADMIN_QUESTION_SCORES_LOCKED_MESSAGE`, `SESSION_RESCORE_CONFIRM`,
  `formatRescoreSummary` ב־`src/lib/admin/lifecycle-copy.ts`.
- UI של "אלץ עריכה" / "חשב מחדש" באדמין (editor + sessions surface).

## What's added

- `POST /api/admin/quizzes/[id]/duplicate` — עותק עמוק של `quizzes` + `questions`,
  `owner_id` = current admin, `title` = `"עותק של <X>"`. שאר ברירות מחדל.
- בדיקה `quiz.hasAnySession` ב־loader של ה־editor (קיים `sessions.quiz_id`).
- מצב read-only ב־editor כש־`hasAnySession === true`: השדות `disabled`,
  באנר הסבר, CTA "שכפל".
- כפתור "שכפל" ב־`/admin/quizzes` (list) וב־editor.

## Edge cases לבדוק במהלך התכנון

- **FK של `answers.question_id`** — `ON DELETE` חייב להיות `RESTRICT`
  (או cascade שלא ימחק תשובות) כדי שמחיקת quiz לא תפוצץ היסטוריה.
  בפועל ה־read-only ימנע מחיקה, אבל כדאי לוודא ב־DB.
- **Storage policy (ADR-0010)** — שכפול חידון עם תמונות/וידאו: הקבצים
  shared (immutable URLs), לא צריך לשכפל ב־storage.
- **ADR-0006 §"score-edit guard" + ADR-0009** — לעדכן או למחוק. ADR חדש
  (ADR-0013) שמתאר את החלטת ה־immutability.
- **DB migration** — סביר שלא נדרש; ההחלטה היא בשכבת האפליקציה.
- **`archived_at` vs duplicate** — משלימים: archive = "אל תוצג ברשימה",
  duplicate = "צור עותק זמין לעריכה". להגדיר במפורש ב־ADR-0013.

## Prompt לסשן חדש (plan mode)

להדביק כפי שהוא בסשן חדש של Claude Code:

```
אני רוצה לעבוד במצב plan. אל תכתוב קוד עד שאאשר.

הקשר: הפרויקט הוא Bishvil Yehuda — Next.js 16 + Supabase quiz, עם quizzes (תבנית) ו־sessions (משחק שמופעל מתבנית). היום שני המודלים חולקים את אותה טבלת `questions`, ולכן עריכת תבנית אחרי שמשחק רץ עלולה להזיז ציונים היסטוריים. כדי למנוע את זה קיים מנגנון guard מורכב (`SCORES_LOCKED` + `?force=1` + rescore endpoint + UI של "אלץ עריכה / חשב מחדש").

ההחלטה החדשה:
- חידון שיש לו ולו סשן אחד (בכל סטטוס: scheduled/live/paused/ended/draft) הופך ל־immutable. ה־editor עובר ל־read-only ומציג CTA "שכפל".
- מוסיפים `POST /api/admin/quizzes/[id]/duplicate` שיוצר עותק עמוק של quiz + questions (owner_id = current admin, title = "עותק של <X>"). קבצי storage נשארים shared (immutable URLs).
- מסירים את כל מנגנון ה־guard/rescore/force-edit מהאדמין ומה־API.
- כותבים ADR-0013 (או מעדכנים ADR-0006) שמסביר את העיקרון "Quizzes are immutable once they have games. Duplicate to iterate."

המשימה שלך:
1. Phase 1 — לחקור את הקוד עם 1-3 Explore agents במקביל. למפות את כל הקריאות שצריך להסיר (SCORES_LOCKED, detectScoreAffectingChanges, mapGeoScoreChanged, requiresRescore, ?force=1, rescore route אם קיים, ADMIN_QUESTION_SCORES_LOCKED_MESSAGE, SESSION_RESCORE_CONFIRM, formatRescoreSummary, UI של "אלץ עריכה" / "חשב מחדש"). למפות את ה־loader של ה־editor כדי להבין איך לחשוף `hasAnySession`. לבדוק את FK ל־`answers.question_id` ב־`supabase/migrations/`.
2. Phase 2 — להציע design (Plan agent): endpoint duplicate, שינוי ה־loader, מצב read-only ב־editor, CTA "שכפל" ב־list וב־editor, מחיקת קוד מיותר, מיגרציה אם נדרשת.
3. Phase 3 — לשאול אותי שאלות חדות אם יש: למשל האם read-only חל גם על שדות לא־ציוניים (prompt/options/imagery) — ההנחה שלי: כן, על הכל; כדי לערוך — שכפל.
4. Phase 4 — לכתוב פלן יסודי וברור לקובץ הפלן (Context, רשימת קבצים שנמחקים, רשימת קבצים שנוספים/משתנים, ADR-0013 outline, verification plan כולל בדיקות יחידה ל־duplicate ול־read-only enforcement).
5. Phase 5 — ExitPlanMode.

קרא קודם:
- CLAUDE.md (שורש הריפו)
- docs/decisions/ADR-0006-answer-policy.md
- docs/decisions/ADR-0009-host-pre-start-cancellation.md
- docs/decisions/ADR-0010-storage-policy.md
- app/api/admin/quizzes/[id]/questions/[questionId]/route.ts
- src/lib/admin/lifecycle-copy.ts
- src/db/schema/answers.ts ו־questions.ts ו־sessions.ts

ערכי התנהגות: אל תוסיף backwards-compat hacks, אל תשאיר dead code עם הערות "removed", אל תבנה אבסטרקציות מיותרות. שמור את הפלן תמציתי וניתן לבצוע.
```
