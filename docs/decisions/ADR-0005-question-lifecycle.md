# ADR-0005 — Question Lifecycle

**Status:** Accepted
**Date:** 2026-04-30
**Deciders:** Wave 1 design agent

---

## Context

Each question in a session passes through a sequence of states from "not yet active" to "revealed". The lifecycle governs:
- When answers can be accepted
- When the timer expires
- When correct answers are revealed to participants
- What happens when timers, cron jobs, or network calls are delayed

The behavior differs between **sync mode** (host advances all participants together) and **async mode** (each participant progresses independently). The reveal behavior in particular is **not** symmetric — getting this wrong leaks correct-answer information in sync classrooms.

Cross-references:
- Session and participant states: **ADR-0004**
- Answer submission rules: **ADR-0006**
- Async vs sync model: **ADR-0007**
- Cache privacy around question state: **ADR-0008**

---

## Decision

### 1. Question States

```
idle ──► presenting ──► answering ──► locked ──► revealed ──► (next question or end)
```

| State | Meaning |
|---|---|
| `idle` | Question exists but has not been activated for this session. |
| `presenting` | Question is visible to participants but the answer input is not yet open. Host is reading the question aloud (optional warm-up). |
| `answering` | Timer is running. Participants can submit answers. `started_at` and `deadline_at` are set. |
| `locked` | `deadline_at` has passed. No new answers accepted. Participants who did not answer get score = 0. Correct answer not yet visible to participants. |
| `revealed` | Correct answer is now visible to all participants. In sync: host triggered reveal. In async: automatic on lock. |

**Note:** `presenting` is optional. The host may skip directly from `idle` to `answering`. If the product decides to remove the warm-up state, the schema should still support it as `presenting_at IS NULL` (question started immediately).

### 2. Server Timestamp Fields

Every question activation record stores:

```
question_session_state:
  session_id          uuid
  question_id         uuid (FK to quiz.questions)
  question_index      int  -- ordinal position in this session run
  status              enum ('idle','presenting','answering','locked','revealed')
  started_at          timestamptz  -- set when status → answering
  deadline_at         timestamptz  -- started_at + question.time_seconds (server arithmetic)
  revealed_at         timestamptz  -- set when status → revealed
  presenting_at       timestamptz  -- set when status → presenting (nullable)
```

**Authority rule:** `deadline_at` is computed by the server using the server clock at the moment the host starts the question. The client clock is never trusted for deadline enforcement.

Time remaining for display:
```
time_remaining = max(0, deadline_at - server_snapshot_timestamp)
```
The server includes `server_now` in every question-state payload so the client can compute remaining time without trusting its own clock. The client uses this only for display (the countdown animation) — not for deciding whether to allow submission.

### 3. Transition Details

#### 3.1 `idle → answering` (or `idle → presenting`)

**Actor:** host (sync) or system on participant first-fetch (async)

**Sync:** Host taps "start question". Server:
1. Locks the session row (`SELECT ... FOR UPDATE`).
2. Sets `started_at = now()`, `deadline_at = now() + question.time_seconds`.
3. Sets `status = 'answering'`.
4. Broadcasts via Supabase Realtime to all subscribed participants.

**Async:** When a participant fetches their next question (GET `/participant/session/[pin]/question`), the server checks if a `question_session_state` row exists for `(session_id, question_id, participant_id)`:
- If not: creates one with `started_at = now()`, `deadline_at = now() + question.time_seconds`.
- If yes: returns the existing row.

This means in async mode each participant has their own `started_at` / `deadline_at` per question. See ADR-0007 for the `participant_question_progress` table.

#### 3.2 `answering → locked` (deadline expiry)

**Actor:** system (cron or lazy expiry)

**Cron path:** A Vercel Cron job runs every minute (`* * * * *`) and updates all `answering` questions where `now() > deadline_at` to `locked`. Vercel Cron minimum resolution is 1 minute. The cron job uses the `CRON_SECRET` env var for authorization.

**Lazy expiry path (critical — see ADR-0004 §4.3):**
Any server-side handler that reads question state MUST check:
```
if status == 'answering' AND now() > deadline_at:
    UPDATE status = 'locked'
    RETURN locked state
```
This means cron failure never causes incorrect scoring. The next request that touches the question self-heals the state.

#### 3.3 `locked → revealed`

**This is the critical split between sync and async.**

**Sync mode:**
- Reveal is ONLY triggered by the host clicking "חשיפת התשובה ←".
- A participant who submits does NOT see the correct answer until the host reveals.
- Between `locked` and `revealed`, participants see a "waiting for reveal" state.
- This prevents fast answerers from signaling correct answers to slow ones.

**Async mode:**
- Reveal is automatic. As soon as a question transitions to `locked` (either by cron or lazy expiry on the participant's own deadline), the participant immediately sees the correct answer and explanation.
- There is no waiting state in async mode.
- Implementation: async mode sets `auto_reveal = true` on the session; the lock→reveal transition is a single atomic operation in the deadline-expiry path.

#### 3.4 `revealed → next question`

**Sync:** Host taps "לתחנה הבאה". Server advances `session.current_question_id` to the next question and sets the new question `idle`.

**Async:** Participant taps "לתחנה הבאה". Server records the participant's progression (via `participant_question_progress`) to the next question. The participant's question state machine advances; other participants are not affected.

#### 3.5 Last question → session ends

**Sync:** After the last question is revealed and the host taps next, the session transitions to `ended` (ADR-0004).

**Async:** When a participant's `participant_question_progress` shows all questions `revealed`, that participant's state transitions to `completed`. The session itself transitions to `ended` only when all participants are `completed` OR an admin/timeout ends it.

### 4. What Happens When Cron / Realtime / Polling Is Delayed

| Scenario | Impact | Resolution |
|---|---|---|
| Cron misses a deadline | Questions stay in `answering` past `deadline_at` | Lazy expiry on next request self-heals. No double-scoring. |
| Realtime broadcast drops (participant never gets timer-end notification) | Participant UI shows stale timer | Participant polls `/question-state` every N seconds as fallback. On poll, receives `locked` state. |
| Host loses connection during `answering` | Timer keeps running server-side (server holds `deadline_at`) | ADR-0004 §4.1 host disconnect recovery. |
| Participant polls `answering` after `deadline_at` | Lazy expiry fires, returns `locked` | Client receives `locked`, disables submit button. |
| Two concurrent requests both try to lock the same question | Database row-level lock prevents double-transition | First transaction wins, second reads already-locked state. |
| Session ends while question is `answering` | Session `ended` transition also locks all active questions | Query: `UPDATE question_session_state SET status='locked' WHERE session_id=? AND status='answering'` as part of the session-end transaction. |

### 5. Polling Interval (Participant)

The participant client subscribes to Supabase Realtime for question-state changes. As a fallback (dropped subscription), it polls every **5 seconds**. This means a participant could be up to 5 seconds late seeing `locked` or `revealed` — acceptable given quiz cadence (15–30s questions).

### 6. Timer Display on Client

```
// Participant receives from server:
{ status, deadline_at, server_now, ... }

// Client countdown:
const remaining = Math.max(0, new Date(deadline_at) - new Date(server_now));
// Animate using remaining milliseconds, starting from question.time_seconds * 1000
```

Client does NOT use `Date.now()` for deadline math. It uses `server_now` from the initial payload as the reference point. This prevents clock skew up to ~500ms in either direction.

---

## Consequences

- `question_session_state` is a required table (columns listed in §2). Used in **sync mode only**. PK: `(session_id, question_id)`.
- In **async mode**, per-participant question timer state lives in `participant_question_progress` (see ADR-0007 §2.2). `question_session_state` is not populated for async sessions.
- Cron job must be configured: `{ path: '/api/cron/expire-questions', schedule: '* * * * *' }` (every minute — Vercel Cron minimum). The `CRON_SECRET` env var guards this route.
- Realtime subscription + 5s polling fallback must be implemented in the participant client component.
- Pre-reveal state (between `locked` and `revealed` in sync) must NOT expose `question.correct` in any participant-facing API response. See ADR-0008.

---

## Open Questions

1. **Presenting state duration:** Is there a configurable warm-up timer, or is it purely manual ("host reads, then taps start")? Currently modelled as manual — `presenting` state has no deadline.
2. **Skip question:** In the prototype, the host can tap "דלג" to skip. Should a skipped question go to `revealed` with no correct-answer reveal, or directly to `ended`-for-that-question (zero score for all)? Proposed: `locked → ended` directly, zero score for all, no explanation shown.
3. **Question re-open:** Can a host re-open a `revealed` question? Proposed: No. Revealed is terminal per run.
