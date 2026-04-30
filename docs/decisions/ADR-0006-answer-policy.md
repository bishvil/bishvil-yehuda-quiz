# ADR-0006 — Answer Submission and Scoring Policy

**Status:** Accepted
**Date:** 2026-04-30
**Deciders:** Wave 1 design agent

---

## Context

Answer submission is the highest-stakes write in the system. Getting the policy wrong causes: duplicate scores, information leaks (client-side correct-answer computation), scoring disputes, or unfair timing advantages.

This ADR pins the rules for: when an answer is accepted, what constitutes a "first answer", how duplicates are handled, how the score is computed, and what storage guarantees are required.

Cross-references:
- Question deadline and lock state: **ADR-0005**
- Session/participant state: **ADR-0004**
- Sync vs async behaviour: **ADR-0007**
- What the server returns vs what is cached: **ADR-0008**

---

## Decision

### 1. Client-Side Editing vs Server-Side Persistence

**Client UI is freely editable until the participant explicitly taps "שליחת תשובה".**

The participant can toggle selected options as many times as they want before submitting. This is a pure client-side state — no server calls are made during selection. This matches the prototype (`selected` state is local to `ParticipantSurface`).

**The server persists exactly one answer record per `(session_id, question_id, participant_id)`.**

This record is written at the moment the participant taps Submit and the HTTP POST reaches the server. Once written, it cannot be changed.

### 2. First Valid Submit Wins

**Policy: first valid submit wins. No editing after submission.**

"First valid" means:
1. The request reaches the server while `question.status == 'answering'` AND `now() <= question.deadline_at`.
2. The participant does not already have an answer row for this `(session_id, question_id)`.
3. The payload is structurally valid (non-empty `selected` for choice questions, `{x, y}` for map).

If both 2 and 3 are true, the answer is persisted and scored immediately.

### 3. Late Answer Behavior

**Definition:** An answer that arrives after `question.deadline_at`.

Server check (authoritative):
```sql
-- pseudo
IF now() > question.deadline_at OR question.status IN ('locked','revealed') THEN
  RETURN error code LATE_SUBMISSION, HTTP 409
END
```

- The response body includes: `{ error: 'LATE_SUBMISSION', deadline_at, submitted_at }`.
- No score is awarded.
- No answer row is written.
- The client must handle this gracefully: show "הגעתם מאוחר מדי" UI state.

**Important:** the lazy expiry rule from ADR-0005 means the server will lock the question before rejecting — the question transitions to `locked` as a side-effect of this check, even if cron hasn't run.

### 4. Duplicate Submission (Same Participant, Same Question)

A duplicate occurs when a participant submits the same `(session_id, question_id, participant_id)` combination a second time.

**Rule: idempotent. Return the existing answer record without error.**

Implementation: use `INSERT ... ON CONFLICT (session_id, question_id, participant_id) DO NOTHING RETURNING *`. If `RETURNING` returns no row (conflict), do a `SELECT` to return the existing row.

Response to duplicate:
```json
{
  "status": "already_submitted",
  "answer": { ...existing answer record... }
}
```
HTTP 200, not 409. The client should treat this the same as a fresh submission.

**Why idempotent rather than error?** Network retries. A participant's HTTP POST may time out on the client side and be retried. If the first attempt succeeded server-side, a retry must not cause a double-score or an error that breaks the client flow.

### 5. Scoring Authority

**All scoring is server-side. Clients never compute the authoritative score.**

The prototype computes score client-side (`handleReveal` in `participant.jsx`). This is acceptable for a demo but not for production — the client cannot be trusted and the score would not persist across reconnects.

**Server scoring algorithm (from prototype, canonicalized):**

For choice questions (single, multi, truefalse, image):
```
is_correct = (submitted_option_set == correct_option_set)
time_bonus  = is_correct ? floor((deadline_at - submitted_at) / question.time_seconds * 500) : 0
score       = is_correct ? 1000 + time_bonus : 0
```

For map questions:
```
distance    = sqrt((pin.x - target.x)^2 + (pin.y - target.y)^2)  -- in % units
is_correct  = distance <= question.tolerance
time_bonus  = is_correct ? floor((deadline_at - submitted_at) / question.time_seconds * 500) : 0
score       = is_correct ? 1000 + time_bonus : 0
```

`submitted_at` is the server-side timestamp at the moment the answer row is inserted — NOT the client-reported time. This prevents clock manipulation.

`deadline_at` is per-question in async mode (per-participant) and shared in sync mode. See ADR-0007.

**Maximum score per question:** 1500 (1000 base + 500 time bonus). Maximum per question configured in admin: default 1500, override possible (admin `points` field in prototype).

**Streak:** tracked in the session. Consecutive correct answers add a display-only streak badge. Streak does NOT currently modify the score (the prototype adds no streak bonus to the persisted score).

### 6. Server-Time Validation

Three timestamps matter for an answer:

| Field | Authority | Where stored |
|---|---|---|
| `question.started_at` | Server (set when question → answering) | `question_session_state.started_at` |
| `question.deadline_at` | Server (`started_at + time_seconds`) | `question_session_state.deadline_at` |
| `answer.submitted_at` | Server (set at INSERT) | `answers.submitted_at` |

**The client never supplies any of these.** Client clocks are used only for display (countdown animation).

Validation check in the answer submission handler:
```
1. Read question_session_state for (session_id, question_id) — lock row FOR UPDATE
2. Lazy-expire if now() > deadline_at (ADR-0005 §3.2)
3. If status != 'answering', reject with LATE_SUBMISSION or QUESTION_NOT_ACTIVE
4. If participant already has answer, return existing (idempotent)
5. INSERT answer with submitted_at = now()
6. Compute score server-side
7. UPDATE participant_scores summary
```

### 7. Answer Storage Guarantees

**Table:** `answers`

Required uniqueness constraint:
```sql
UNIQUE (session_id, question_id, participant_id)
```

Required fields:
```
session_id      uuid
question_id     uuid
participant_id  uuid
submitted_at    timestamptz  NOT NULL DEFAULT now()
selected_ids    text[]       -- for choice questions: ['a','b']
pin_x           numeric      -- for map questions: % from left
pin_y           numeric      -- for map questions: % from top
is_correct      boolean      NOT NULL
time_bonus      int          NOT NULL DEFAULT 0
score           int          NOT NULL DEFAULT 0
```

**Durability:** answers must be committed to the database before the server returns 200 to the participant. Do NOT write to an in-memory queue and return optimistically — the answer could be lost on a crash.

**Idempotency key:** The `UNIQUE` constraint on `(session_id, question_id, participant_id)` serves as the natural idempotency key. No separate idempotency header is required.

**Forfeit-row policy:** Questions that a participant never answered (late joiner forfeiture in sync mode, or session ended before participant reached that question) do **NOT** get an answer row. Absence of a row is the authoritative signal for score = 0 on that question. Do not insert ghost rows with `score = 0` — it makes later analytics queries ambiguous (can't distinguish "skipped" from "answered wrong"). Scoring summary queries must use `LEFT JOIN answers` and `COALESCE(score, 0)`.

### 8. Answer Visibility After Submission (Pre-Reveal)

**In sync mode:**
- After submitting, the participant sees "תשובתך התקבלה — ממתין לחשיפה" (answer received, waiting for reveal).
- The participant does NOT see whether their answer is correct until the host triggers reveal.
- The server response to submit includes: `{ status: 'submitted', submitted_at }` — no `is_correct`, no `correct_ids`.

**In async mode:**
- After submitting, the participant immediately transitions to the revealed state (ADR-0005 §3.3).
- The server response to submit includes: `{ status: 'submitted', submitted_at, is_correct, correct_ids, explanation }`.

This is the critical behavioral difference. Implement it as a mode flag in the question-state response builder, not as separate API endpoints.

---

## Consequences

- `answers` table must have the UNIQUE constraint from §7.
- The `INSERT ... ON CONFLICT DO NOTHING RETURNING *` pattern must be implemented precisely — a bare `ON CONFLICT DO NOTHING` without `RETURNING` loses the idempotent response.
- Score computation lives in a server-side function (`lib/scoring.ts`), not in route handlers directly, to ensure consistency between sync and async paths.
- Participants must not receive `is_correct` or `correct_ids` in the submit response for sync mode — the route handler must branch on `session.game_mode`.
- The `streak` field on `session_participants` is a running counter: increment on correct, reset to 0 on wrong. Updated in the same transaction as the answer insert.

---

## Open Questions

1. **Points override — RESOLVED:** The `questions.points` field (default 1500) overrides the total maximum score for that question. The scoring formula scales proportionally:
   ```
   base      = floor(points * 2/3)          -- awarded for any correct answer
   time_max  = points - base                -- remaining third is the time bonus pool
   time_bonus = is_correct ? floor(time_max * (deadline_at - submitted_at) / time_seconds) : 0
   score      = is_correct ? base + time_bonus : 0
   ```
   At the default of 1500: `base = 1000`, `time_max = 500` — matching the prototype exactly. A question configured to 900 points gives `base = 600`, `time_max = 300`. `lib/scoring.ts` must use `question.points` (not a hardcoded 1500).
2. **Map scoring granularity:** Should distance produce a partial score (closer = more points)? Current decision: binary correct/wrong with time bonus, matching the prototype. Partial distance scoring is a product feature for a later wave.
3. **Multi-correct questions:** For `type == 'multi'`, scoring currently requires exact match (all correct selected, no wrong selected). Should partial credit apply? Current decision: no partial credit — exact match only.
