# ADR-0013 — Quiz Edit Lock + Duplicate Workflow

**Status:** Amended
**Date:** 2026-05-06
**Amended:** 2026-05-12 — admins may explicitly override the edit lock after
acknowledging that existing game results can be affected.
**Supersedes:** the score-edit guard / rescore flow described in
  ADR-0006 §"Update 2026-05-04 — unified scoring contract".

---

## Context

Until now `quizzes` and `questions` simultaneously played two roles: the
**template** an admin edits, and the **historical record** that already
ran sessions point at via `sessions.quiz_id` + `answers.question_id`.
Editing a template after a session ran retroactively changed the meaning
of stored answers and the participants' scores.

To paper over that, we shipped a multi-piece guard: `409 SCORES_LOCKED`
on score-affecting fields, `?force=1` to override, `requiresRescore` in
the response, and a separate `POST /api/admin/sessions/[id]/rescore`
endpoint backed by a `rescore_session` PL/pgSQL RPC. That mechanism was
correct in the narrow technical sense and confusing in every other way:
admins could not tell which fields would lock, "force edit" felt
unsafe, and the rescore step was easy to forget.

The default product model is the one used by Google Forms / Kahoot /
Quizizz: **once a quiz has run, duplicate before iterating.** The
duplicate is a fresh editable template with no historical baggage; the
original keeps its results intact.

As of 2026-05-12, customer feedback requires a deliberate override for
test runs and exceptional admin workflows. The default remains locked,
but admins can acknowledge a warning and edit anyway.

## Decision

### 1. Edit-lock rule

A quiz is **read-only by default** as soon as
`count(sessions WHERE quiz_id = X) > 0`.
Status of those sessions is irrelevant — `draft`, `scheduled`, `live`,
`paused`, `ended`, archived or not, all count.

This is enforced in two places:

- **Server-side** by `assertQuizEditable` (`src/lib/admin/quiz-lock.ts`),
  invoked at the top of every mutating admin route:
  - `PUT  /api/admin/quizzes/[id]`
  - `POST /api/admin/quizzes/[id]/questions`
  - `PUT  /api/admin/quizzes/[id]/questions/[questionId]`
  - `DELETE /api/admin/quizzes/[id]/questions/[questionId]`
  - `POST /api/admin/quizzes/[id]/questions/reorder`

  On a locked quiz without an explicit override, the helper replies
  `409 QUIZ_LOCKED` with `{ error, message, sessionCount }`.

- **Client-side** by the editor: `GET /api/admin/quizzes/[id]` now
  returns `hasAnySession: boolean`. When true, every input/control in
  the quiz editor starts disabled, the autosave loops are gated off, the
  launch button is disabled, and a banner with "שכפל לעריכה" and
  "עריכה בכל זאת" CTAs is shown above the editor.

### 2. Explicit admin override

Clicking "עריכה בכל זאת" shows a browser confirmation explaining that
editing quiz questions can affect existing game results. If the admin
confirms, the editor re-enables inputs and autosave. Mutating requests
sent from that unlocked editor include the `x-bsy-locked-quiz-edit: true`
header.

The header is intentionally not sent by default from the API client. A
direct or stale write without the override remains blocked by
`QUIZ_LOCKED`.

### 3. Duplicate

`POST /api/admin/quizzes/[id]/duplicate` (admin-only) deep-copies a quiz:

- New row in `quizzes` — `owner_id = current admin`,
  `title = "עותק של <source.title>"`, `archived_at = null`. All other
  metadata (`brand_id`, `default_game_mode`, `join_fields`,
  `custom_logo*`) is copied verbatim.
- All rows from `questions` are copied 1:1 with new ids and the same
  `ordinal` order.
- Storage objects (image / video URLs) are **shared** with the source —
  ADR-0010 stores public, immutable URLs, so duplicating does not need
  to clone files.

Duplicate is available for any quiz, including archived ones. The
result is always active so the admin can iterate immediately.

### 4. Archive vs duplicate

| Operation | Effect | Editable result? |
|---|---|---|
| Archive (`DELETE /…/[id]`) | Sets `archived_at = now()` | No by default (lock follows session count, not archive flag) |
| Unarchive (`POST /…/[id]/unarchive`) | Sets `archived_at = null` | No by default (lock follows session count, not archive flag) |
| Duplicate (`POST /…/[id]/duplicate`) | New quiz row, owner = caller | Yes (new quiz has zero sessions) |
| Override ("עריכה בכל זאת") | Existing quiz remains the same row | Yes, after admin confirmation |

The two flags are orthogonal. Archive is the "hide from list" knob;
duplicate is the "make me a copy I can edit" knob.

## Consequences

### Removed

- `app/api/admin/sessions/[id]/rescore/route.ts` (entire route).
- `rescore_session` Postgres function — dropped via
  `supabase/migrations/20260506200000_drop_rescore_session_rpc.sql`.
- All score-edit guard logic in `app/api/admin/quizzes/[id]/questions/[questionId]/route.ts`:
  `SCORES_LOCKED`, `requiresRescore`, `?force=1`,
  `detectScoreAffectingChanges`, `mapGeoScoreChanged`,
  `AdminQuestionScoresLockedBody`.
- Constants and helpers in `src/lib/admin/lifecycle-copy.ts`:
  `SESSION_RESCORE_CONFIRM`, `ADMIN_QUESTION_SCORES_LOCKED_MESSAGE`,
  `formatRescoreSummary`.
- API client surface: `rescoreAdminSession`, `force` option on
  `updateAdminQuestion`, `requiresRescore` on
  `AdminQuestionUpsertResponse`, `AdminSessionRescoreResponse`.
- `RESCORABLE_STATUSES` and the "חשב מחדש" button in the admin sessions
  screen.
- `tests/unit/api/admin-question-update-map-lock.test.ts`.

### Added

- `src/lib/admin/quiz-lock.ts` — `assertQuizEditable` + `QUIZ_LOCKED_MESSAGE`.
- `src/lib/admin/quiz-edit-override.ts` — shared override header helper.
- `app/api/admin/quizzes/[id]/duplicate/route.ts`.
- `hasAnySession: boolean` on `AdminQuizDetail`.
- Read-only mode in the quiz editor and `QuestionEditor.tsx`, warning
  banner, duplicate CTA, and explicit "edit anyway" CTA.

### Migration & data

No application data changes — the rule is purely an authoring-time
constraint on top of the existing schema. The 2026-05-12 override change
does not require a migration.

## Verification

- Unit tests: `tests/unit/api/admin-quiz-duplicate.test.ts` and
  `tests/unit/api/admin-quiz-lock.test.ts`.
- Manual: editing a quiz that has a session shows the banner and the
  inputs are disabled; clicking שכפל creates a new quiz that opens in
  the editor, fully editable; clicking עריכה בכל זאת asks for
  confirmation and then re-enables editing on the existing quiz.
- DB: after `pnpm supabase db reset --local`,
  `select proname from pg_proc where proname = 'rescore_session';`
  returns zero rows.
