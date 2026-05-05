# ADR-0004 — Session and Participant State Machine

**Status:** Accepted
**Date:** 2026-04-30
**Deciders:** Wave 1 design agent

**Supersession note:** ADR-0009 supersedes the actor for the `scheduled -> ended`
transition in §1. Hosts are explicitly allowed to cancel scheduled sessions
before start. All other ADR-0004 rules remain accepted.

---

## Context

The quiz platform has two modes (sync / async) and three actor roles (host, participant, admin). Every write that changes game state must follow a deterministic state machine so that concurrent requests, reconnects, and delayed cron jobs do not produce inconsistent state.

This ADR defines:
- The session-level state enum and allowed transitions
- The participant-level state enum and allowed transitions
- Who (actor) may trigger each transition
- Idempotency rules
- Failure and recovery behavior

Cross-reference:
- Question-level substates are in **ADR-0005**.
- Answer submission rules (including late-answer rejection) are in **ADR-0006**.
- Sync vs async progression details are in **ADR-0007**.
- Cache/privacy implications of each state are in **ADR-0008**.

---

## Decision

### 1. Session States

A *session* is one live instance of a quiz (one run). It is created by the admin/host and holds the current question pointer for sync mode.

```
draft ──► scheduled ──► live ──┬──► paused ──► live  (resume cycle)
                               └──► ended
```

| State | Meaning |
|---|---|
| `draft` | Being configured. No participants can join. Questions can still be edited. |
| `scheduled` | Frozen configuration. PIN is published. Participants may join and wait in lobby. No questions active yet. |
| `live` | Quiz is running. In sync mode, `current_question_id` is set and advances. In async mode, participants advance independently. |
| `paused` | Host has paused mid-session (sync only). Timer stopped server-side. Participants see "ממתין למדריך". |
| `ended` | Session is over. Answers are frozen. Results are public. |

**Allowed transitions:**

| From | To | Actor | Guard |
|---|---|---|---|
| `draft` | `scheduled` | admin/host | At least one question exists |
| `scheduled` | `live` | host | Session is `scheduled` |
| `scheduled` | `draft` | admin | Undo publish (participants who joined are removed) |
| `live` | `paused` | host | Sync mode only |
| `paused` | `live` | host | Session was `paused` |
| `live` | `ended` | host | All questions revealed OR explicit end |
| `live` | `ended` | system | Lazy expiry: all questions past their deadlines and async session inactive for >24h |
| `paused` | `ended` | host | Early termination |
| `scheduled` | `ended` | admin | Cancel before start. Superseded by [ADR-0009](./ADR-0009-host-pre-start-cancellation.md): host is also allowed. |

**Rejected transitions** (return current state, no error to client):
- Any transition not in the table above.
- `ended → *` — ended is terminal.
- `paused → scheduled` — can't un-start a session.

### 2. Participant States

A *participant* is one person joined to one session.

```
joined ──► in_progress ──► completed
   │                          │
   └──────────────────────────┤
                              └──► (session ends, forfeit remaining)
```

| State | Meaning |
|---|---|
| `joined` | Completed join form, in lobby, has not answered any question yet. |
| `in_progress` | Has answered at least one question; session is still live. |
| `completed` | Has answered all questions (or session ended with all their available answers submitted). |

**`session_participants` schema (key columns):**

```sql
session_participants (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid        NOT NULL REFERENCES sessions(id),
  first_name      text        NOT NULL,
  last_name       text        NOT NULL,
  phone           text        NOT NULL,           -- canonicalized E.164; stored plaintext server-side; never serialised to browser
  unit            text,
  status          text        NOT NULL DEFAULT 'joined'
                              CHECK (status IN ('joined','in_progress','completed')),
  streak          int         NOT NULL DEFAULT 0,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  display_name    text        GENERATED ALWAYS AS
                              (first_name || ' ' || left(last_name, 1) || '.') STORED,
  UNIQUE (session_id, phone)
)
```

`display_name` is a **`GENERATED ALWAYS AS … STORED`** column. Queries and API responses read it directly — no application-level derivation needed. ADR-0008 references this column for leaderboard payloads.

**Phone normalization (load-bearing for `(session_id, phone)` uniqueness):**
Israeli mobile numbers can be entered as `0501234567`, `+972501234567`, `972-50-123-4567`, etc. The `phone` column stores **canonicalized E.164** form (`+972501234567`). Normalization happens in the join handler before INSERT:

```ts
function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');           // strip all non-digits
  if (digits.startsWith('972')) return '+' + digits;
  if (digits.startsWith('0'))   return '+972' + digits.slice(1);
  return '+972' + digits;                            // assume IL bare digits
}
```

Without this, `UNIQUE (session_id, phone)` silently fails to detect the same person rejoining with a different format, breaking the join idempotency rule (§3).

**Allowed transitions:**

| From | To | Actor | Guard |
|---|---|---|---|
| — | `joined` | participant | Session is `scheduled` or `live`; valid PIN and required join fields provided |
| `joined` | `in_progress` | system | Participant submits their first answer |
| `in_progress` | `completed` | system | All questions answered, OR session transitions to `ended` |
| `joined` | `completed` | system | Session transitions to `ended` before participant answers anything (zero-score result) |

**Late joiner rule (sync mode):**
A participant who joins while the session is `live` (not `scheduled`) enters at the *current* question. They forfeit all prior questions (those questions record no answer row for them; score = 0 for those questions). They do NOT see prior questions.

**Late joiner rule (async mode):**
A participant who joins while the session is `live` starts at question 1 regardless of how far other participants are. The session `ended_at` deadline (if set) applies — they must complete before it.

### 3. Idempotency Rules

Every state-mutating API call must be idempotent:

- **JOIN:** `(session_id, participant_phone)` is unique. Second join with the same phone returns the existing participant record and current state — no error, no duplicate.
- **START SESSION:** `(session_id)` guard checks state == `scheduled`. If already `live`, return current state without error.
- **END SESSION:** If already `ended`, return current state without error.
- **PAUSE/RESUME:** Idempotent on same target state — pausing an already-paused session returns current state.
- **All transitions:** use optimistic locking (`updated_at` version column or Postgres `FOR UPDATE`). If the row changed between read and write, re-read and re-evaluate the guard. If the guard still passes, write. If not, return current state.

### 4. Failure and Recovery

#### 4.1 Host disconnects during live session (sync)

- Timer continues server-side (deadline is stored as UTC timestamp, not a countdown).
- Session remains `live`. Participants see their question normally.
- On reconnect, host GETs `/host/session/[pin]` → receives current state (current question, timer remaining, answer counts). No manual recovery needed.
- If host does not reconnect for > `config.host_session_timeout` (suggested: 30 minutes), the system transitions the session to `paused` automatically via cron. This prevents participants from being stuck on a question forever.

#### 4.2 Participant disconnects mid-question

- Client-side timer is display-only. Server holds the `deadline_at`.
- On reconnect, participant GETs `/participant/session/[pin]` → receives current question state.
- If `now() > deadline_at`: question is locked server-side (see ADR-0005). Participant missed it; score = 0 for that question.
- If `now() < deadline_at`: participant can still submit.

#### 4.3 Lazy expiry (no cron)

Question expiry is handled exclusively by lazy expiry inside route handlers and the
`submit_answer` RPC — there is no cron worker. (Earlier revisions of this ADR
described a `* * * * *` cron; that was removed once it was clear every active
client path already triggered lazy expiry, and the cron's only unique role was
cache-tag invalidation, which now happens inline in `lazyExpire*` helpers.)

- Every request handler that reads question state MUST check `now() > question_deadline_at` before processing (`src/lib/sessions/expiry.ts`).
- The `submit_answer` Postgres RPC self-heals expired rows before evaluating the submission, so submission is always race-safe even without any preceding GET.
- A "dead" session (no active clients) may keep `answering` rows in the DB until somebody returns; this is harmless. When the session ends, `session.status='ended'` overrides per-question state everywhere.
- Question expiry is *eventually consistent* with the wall clock; no data loss or double-scoring can occur.

#### 4.4 Participant submits after session ends

If `session.status == 'ended'`, reject the submission with `SESSION_ENDED` error. Do not score.

#### 4.5 Admin force-ends a session

Transition to `ended`. All in-flight question deadlines are considered expired. Any answer submitted after `ended_at` is rejected. Existing answers are preserved.

---

## Consequences

- Schema must have a `status` column on `sessions` table (enum or varchar with check constraint).
- Schema must have a `status` column on `session_participants` table.
- All status-mutating route handlers must use a database transaction with a `SELECT ... FOR UPDATE` or equivalent optimistic lock.
- The `ended` status is write-terminal for sessions. Analytics/results read from this state.
- Soft-delete (archive) is a separate operation from `ended` — do not conflate.

### Required Table: `quizzes`

```sql
quizzes (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          uuid        NOT NULL,           -- admin/creator user id
  brand_id          text        NOT NULL,           -- see "Brands" below
  title             text        NOT NULL,
  default_game_mode text        NOT NULL CHECK (default_game_mode IN ('sync','async')),
  join_fields       jsonb       NOT NULL DEFAULT '["name","phone","unit"]',
                                                    -- ordered list of fields shown on join form
  custom_logo       text,                           -- URL override (nullable = use brand default)
  custom_logo_label text,                           -- display label override (nullable)
  created_at        timestamptz NOT NULL DEFAULT now(),
  archived_at       timestamptz                     -- soft-delete: null = active
)
```

`sessions` has a FK `quiz_id → quizzes.id`. The `sessions` table inherits `game_mode` from the quiz at creation time (copied, not re-derived, so mode is stable even if the quiz default changes later).

**Lifecycle interaction:** archiving a quiz (`quizzes.archived_at IS NOT NULL`) blocks creation of new sessions for that quiz, but does NOT end existing `live` or `scheduled` sessions — they run to natural completion.

### Required Table: `sessions`

```sql
sessions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id             uuid        NOT NULL REFERENCES quizzes(id),
  host_id             uuid,                          -- nullable for async sessions
  pin                 text        NOT NULL,          -- 6-digit numeric, see "PIN Format" below
  status              text        NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft','scheduled','live','paused','ended')),
  game_mode           text        NOT NULL CHECK (game_mode IN ('sync','async')),
                                                     -- copied from quiz.default_game_mode at creation
  auto_reveal         boolean     NOT NULL DEFAULT false,
                                                     -- true for async; false for sync
  current_question_id uuid,                          -- sync mode only; nullable
  started_at          timestamptz,                   -- set when status → 'live'
  ended_at            timestamptz,                   -- async deadline OR actual end timestamp
  host_last_seen_at   timestamptz,                   -- updated on every host request; cron checks this for 30-min timeout
  created_at          timestamptz NOT NULL DEFAULT now()
)

CREATE UNIQUE INDEX sessions_pin_active_idx
  ON sessions (pin)
  WHERE status IN ('scheduled', 'live');
```

### Required Table: `questions`

```sql
questions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id       uuid        NOT NULL REFERENCES quizzes(id),
  ordinal       int         NOT NULL,                -- 1-based position within the quiz
  type          text        NOT NULL CHECK (type IN ('single','multi','truefalse','image','map')),
  prompt        text        NOT NULL,
  options       jsonb,                               -- [{id, text, image_url?}] for choice types; null for map
  correct_ids   text[],                              -- array of option ids; null for map
  map           jsonb,                               -- {image_url, target:{x,y}} for map type; null otherwise
  image_url     text,                                -- optional question illustration
  explanation   text,                                -- shown post-reveal; never in pre-reveal payloads
  time_seconds  int         NOT NULL DEFAULT 25,     -- per-question timer
  points        int         NOT NULL DEFAULT 1500,   -- max score (see ADR-0006 §5)
  tolerance     numeric,                             -- map type: max distance in % units; null otherwise
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, ordinal)
)
```

The `correct_ids` and `explanation` columns must be stripped from any payload before reveal — see ADR-0008 §2.

### Brands — Static Enum (MVP)

Brands are a **static enum** in application code for MVP, not a database table:

```ts
const BSY_BRANDS = ['yehuda','haari','tzafon','etzion','haganat','main'] as const;
type BrandId = typeof BSY_BRANDS[number];
```

A `brands` lookup table (with `name`, `logo_url`, `accent_color` columns) is the recommended Wave 3 upgrade when white-labelling becomes self-serve. For now, brand assets are static files in `public/brands/[brandId]/`.

The `quizzes.brand_id` column stores one of the enum values (enforced by a `CHECK` constraint in the DB).

### PIN Format and Uniqueness

- **Format:** 6-digit numeric string (zero-padded), e.g. `"042837"`.
- **Display:** rendered with a center dot separator — `"042·837"` — matching the prototype UI.
- **Generation:** server generates a random 6-digit PIN at session creation using `crypto.randomInt(100000, 1000000)` from `node:crypto` (NOT `Math.random()` — the active-PIN space is small enough that a non-CSPRNG is guessable). Retried on collision.
- **Uniqueness scope:** PIN must be unique across all sessions with `status IN ('scheduled','live')`. Ended/archived sessions release their PIN. Enforced by a partial unique index:
  ```sql
  CREATE UNIQUE INDEX sessions_pin_active_idx
    ON sessions (pin)
    WHERE status IN ('scheduled', 'live');
  ```
- **Lifetime:** PIN is valid until the session transitions to `ended`. After that, the PIN may be reused for a new session.

### Session Expiry Cron

A second cron job (`/api/cron/expire-sessions`, schedule: `*/15 * * * *`) handles:
1. Auto-pause sync sessions where the host has been absent > `host_session_timeout` (30 min).
2. Auto-end async sessions where `ended_at` is set and `now() > ended_at`.

This complements the question-expiry cron (ADR-0005) and runs every 15 minutes (coarser granularity is acceptable — session-level timeouts are measured in minutes, not seconds). Also guarded by `CRON_SECRET`.

---

## Open Questions

1. **Session scheduling:** Is `scheduled` state needed if admin always starts sessions manually? If "go live immediately on PIN publish" is acceptable, `scheduled` and `draft` could collapse to `lobby`. Keep separate for now — the prototype shows an explicit "הפעלת חידון ←" button.
2. **Host timeout value:** 30 minutes suggested above. Needs product decision before Wave 2 schema hardcodes `CHECK` constraints on the timeout window.
3. **Multi-host:** Can two hosts share control of a session? Not modelled here. Flag for Wave 3 if needed.
