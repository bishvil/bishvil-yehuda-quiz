# ADR-0007 — Sync vs Async Progression Model

**Status:** Accepted
**Date:** 2026-04-30
**Deciders:** Wave 1 design agent

---

## Context

The quiz platform supports two game modes, toggled by the admin per quiz:

- **Sync (סינכרוני):** A live host controls the pace. All participants are on the same question at the same time. The host starts questions, the host reveals answers.
- **Async (אסינכרוני):** There is no active host. Participants work at their own pace, advancing through questions independently.

The two modes share the same question data and scoring algorithm but differ in:
- Who advances the question
- Where the per-question timer state lives
- When answers are revealed
- Whether `participant_question_progress` is needed
- How resume works

This ADR answers the explicit question from the task: **whether to use `participant_question_progress`**, and defines the complete separation of concerns between the two modes.

Cross-references:
- Session and participant states: **ADR-0004**
- Question lifecycle and timestamps: **ADR-0005**
- Answer submission: **ADR-0006**
- Cache headers: **ADR-0008**

---

## Decision

### 1. Sync Mode

#### 1.1 Session-Level Progression

In sync mode, the session has a single `current_question_id` pointer. All participants are on this question simultaneously.

The session row holds:
```
sessions:
  current_question_id   uuid  FK → questions (nullable when session not live)
```

The host advances the pointer. Participants do not control progression.

#### 1.2 No `participant_question_progress` in Sync Mode

In sync mode, `participant_question_progress` is **NOT used**. A participant's current question is always `session.current_question_id`. Their per-question timer is `question_session_state` (shared, one row per question per session).

Derivable state:
- "Has this participant answered this question?" → `SELECT * FROM answers WHERE session_id=? AND question_id=? AND participant_id=?`
- "What question is this participant on?" → `session.current_question_id`

No additional table needed.

#### 1.3 Sync Participant State on Reconnect

1. Client calls GET `/api/session/[pin]`.
2. Server returns `{ session.status, session.current_question_id, question_session_state for that question }`.
3. Client renders the correct screen: lobby / answering / locked+waiting / revealed / ended.
4. Client subscribes to Realtime for session + question state changes.

Late-joiner in sync: described in ADR-0004 §2. Participant enters at `current_question_id`. Prior questions are forfeited (no answer rows, score = 0).

#### 1.4 How Host-Dependency Is Handled in Sync

If the host disconnects:
- Timer continues server-side (`deadline_at` is fixed at question start).
- Participants remain on the current question.
- After `deadline_at`, cron or lazy expiry locks the question (ADR-0005 §3.2).
- Participants see "locked, waiting for reveal" — the host must reconnect to trigger reveal.
- If the host does not reconnect within `config.host_session_timeout` (30 min), the session auto-pauses (ADR-0004 §4.1).

**Sync always depends on a live host for reveal.** This is intentional — it's a classroom tool.

#### 1.5 Video Gate in Sync

Video questions use the existing `presenting` question status as a
host-controlled media gate:

1. When the host starts a video question, the server writes
   `question_session_state.status = 'presenting'`, sets `presenting_at = now()`,
   and leaves `started_at` / `deadline_at` null.
2. Participants see the video spotlight, but cannot dismiss it themselves.
3. When the host confirms that viewing is complete, the server transitions
   `presenting -> answering`, sets `started_at = now()`, and sets
   `deadline_at = now() + questions.time_seconds`.

This keeps sync-mode fairness intact: all participants begin the answer timer
at the same wall-clock instant. `media_lead_seconds` is not added to the sync
answer deadline because the media gate already happened before `answering`.

---

### 2. Async Mode

#### 2.1 Participant-Level Progression

In async mode, each participant advances independently. There is no host online during the quiz.

#### 2.2 `participant_question_progress` Table — YES, Required

```sql
participant_question_progress (
  session_id        uuid  NOT NULL,
  participant_id    uuid  NOT NULL,
  question_id       uuid  NOT NULL,
  question_index    int   NOT NULL,  -- ordinal position
  status            text  NOT NULL,  -- 'answering' | 'locked' | 'revealed'
  started_at        timestamptz NOT NULL,
  deadline_at       timestamptz NOT NULL,
  revealed_at       timestamptz,

  PRIMARY KEY (session_id, participant_id, question_id)
)
```

This table is **only written in async mode**. In sync mode it is never used.

Why it's needed in async:
- Each participant starts each question at a different wall-clock time.
- `started_at` and `deadline_at` differ per participant per question.
- Without this table, there is nowhere to store the participant's personal timer for question N while they are on question N.

#### 2.3 Async Question Lifecycle

When a participant requests their next question:

1. Server reads `participant_question_progress` for `(session_id, participant_id)` — finds the current `question_index`.
2. If no row exists for this question yet:
   - Creates `participant_question_progress` row: `started_at = now()`, `deadline_at = now() + question.time_seconds`.
   - Returns question state to participant.
3. If row exists: returns current state.

**Advancement:** After the participant's personal question is `revealed` (auto-reveal on lock), they tap "לתחנה הבאה". Server increments `question_index` and the next question row is created on demand (step 2 above).

#### 2.4 Auto-Reveal in Async Mode

Async mode uses `auto_reveal = true` on the session. When a participant's question transitions to `locked` (via lazy expiry or cron), the server immediately also sets it to `revealed` in the same transaction. The participant receives the correct answer and explanation without waiting for a host.

#### 2.5 How Async Avoids Host Dependency (for participant flow)

- No host is needed online. The question lifecycle is entirely driven by:
  1. The participant's own first-fetch (creates timer).
  2. The server deadline expiry (cron or lazy).
  3. The participant's own advancement tap.
- Admin sets up the quiz, publishes the PIN, and participants complete it whenever they log in — even days after the session was created, as long as `session.ended_at` has not passed.
- `session.ended_at` is an optional deadline set by admin. If null, the session stays open until manually ended.

#### 2.6 Async Resume

If a participant leaves mid-quiz and returns:
1. Client calls GET `/api/session/[pin]`.
2. Server reads `participant_question_progress` for this participant.
3. Returns the last active question row.
4. If `now() > deadline_at`: lazy expiry locks and reveals the question. Participant sees "missed this question" and can advance.
5. If `now() <= deadline_at`: participant can still answer. The timer resumes from the remaining time (`deadline_at - now()`).

#### 2.7 Async Host Monitor View (read-only)

Although async mode has no controlling host, a host or admin may still navigate to `/host/[pin]` to observe a running async session. The host dashboard exposes a **read-only live monitor**:

- All control mutations (`/start`, `/end`, `/pause`, `/resume`, `/question/start`, `/question/next`, `/question/reveal`) return HTTP 409 for async sessions. The `loadHostContext()` helper sets `canControl: false` for async sessions; each mutation handler checks this flag as its first guard.
- The host live response (`GET /api/host/[pin]/live`) includes `canControl: false` so the client can hide the control bar.
- **Per-participant progress** is sourced from `participant_question_progress` (the authoritative async progress table defined in §2.2) and surfaced as `participantProgress: HostLiveParticipantProgress[]` in the live response. The UI renders a progress-bar list showing which question each participant is currently on.
- **Live aggregates** (leaderboard, answer counts for the most recently active question per participant) remain available — the host can see how the cohort is progressing in aggregate without controlling them.
- The host-side map guide view (`mapAnswers`) also populates for async sessions, subject to the same reveal-gating contract as sync (ADR-0008 §2): `isCorrect` and `distanceKm` are null until the participant's own question is `revealed` (auto-reveal fires on lock in async per §2.4).

**Consequence for admin-initiated session end:** Because the host cannot end async sessions, the only paths to end an async session are: (a) the admin panel (`DELETE /api/admin/sessions/[id]`), (b) the `session.ended_at` deadline cron, or (c) the session-expiry cron (ADR-0004 §4.1).

---

### 3. Shared Scoring

Both modes use identical scoring (ADR-0006 §5). The only difference:

| | Sync | Async |
|---|---|---|
| `deadline_at` source | Shared `question_session_state.deadline_at` | Per-participant `participant_question_progress.deadline_at` |
| `submitted_at` | Server timestamp at INSERT | Server timestamp at INSERT |
| Score formula | Same | Same |
| Score storage | `answers.score` + `participant_scores` summary | Same |

A `participant_scores` summary table holds the running total per participant per session:
```sql
participant_scores (
  session_id       uuid,
  participant_id   uuid,
  total_score      int  DEFAULT 0,
  correct_count    int  DEFAULT 0,
  last_updated_at  timestamptz,
  PRIMARY KEY (session_id, participant_id)
)
```
Updated in the same transaction as every answer insert.

**Note:** `streak` is **not** in this table. The running streak counter lives on `session_participants.streak` (ADR-0004 §2) — it's per-participant, not a score-summary metric. ADR-0006 §5 references that single column.

---

### 4. Leaderboard

The leaderboard reads from `participant_scores` joined with `session_participants` (for display name).

**Public display name:** `first_name + last_initial + '.'` — e.g., "נועה ל." (matching prototype). Derived at read time from the stored `name` join field. The full name is stored server-side but only the display-safe form is exposed in public payloads (ADR-0008).

In sync mode, the leaderboard is live (Realtime subscription). In async mode, it refreshes on each participant's result screen load (point-in-time).

---

### 5. Mode Switching

The game mode (`sync` / `async`) is set at quiz creation time and fixed for a session once it transitions to `live`. Changing mode mid-session is not supported.

---

## Consequences

- `participant_question_progress` table is required. It must only be populated in async sessions (add a guard in the insert path that checks `session.game_mode`).
- `question_session_state` table (ADR-0005) is required in both modes, but its semantics differ: shared in sync, per-participant in async. The primary key in async mode includes `participant_id`.
- The session row must have `game_mode` column (`'sync' | 'async'`).
- Route handlers must branch on `session.game_mode` for: question-start, answer-reveal, participant next-question.
- In async mode, the host dashboard shows aggregate progress across participants — not a real-time ticker tied to a single `current_question_id`. `loadHostContext()` returns `canControl: false`; all mutation endpoints reject with 409 for async sessions. See §2.7.

---

## Open Questions

1. **Mixed-mode sessions:** Can a session switch from sync to async at the admin's request (e.g., host leaves mid-tour and wants participants to continue alone)? Not in scope for Wave 2 — flag as future.
2. **Async session `ended_at` deadline — RESOLVED:** Enforced server-side. Any answer submission, question-start, or participant-advance request checks `session.ended_at` before proceeding. If `now() > ended_at`, return `SESSION_EXPIRED` (HTTP 409). The session-expiry cron (ADR-0004 Consequences) transitions the session to `ended` when this deadline passes, so subsequent requests also hit the `session.status == 'ended'` guard in ADR-0004 §4.4.
3. **Async participant who joins after some other participants have already completed:** They still start at question 1 and go in order. Their leaderboard rank is live — they can still beat people who finished early with high accuracy but low time bonuses.
