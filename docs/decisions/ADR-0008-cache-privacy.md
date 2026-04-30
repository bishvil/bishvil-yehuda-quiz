# ADR-0008 — Cache and Privacy Contract

**Status:** Accepted
**Date:** 2026-04-30
**Deciders:** Wave 1 design agent

---

## Context

The quiz platform serves multiple actor roles (participant, host, admin) with wildly different privacy requirements. A cache misconfiguration that allows one participant to see another's answer, or that exposes the correct answer before reveal, is a critical bug — not a performance optimization failure.

This ADR establishes:
- Which endpoints may be publicly cached (by CDN / Vercel Edge Cache)
- Which endpoints must be `private, no-store`
- Which fields are forbidden in public payloads
- The participant-safe payload shape
- The host/admin payload privacy rules
- The required `Cache-Control` header on each class of endpoint

Cross-references:
- Session and question states: **ADR-0004**, **ADR-0005**
- Answer visibility by mode: **ADR-0006 §8**
- Scoring data: **ADR-0006 §5**

---

## Decision

### 1. Cache Classification

#### 1.1 Public — CDN-cacheable

These responses do not contain secrets, PII, correct answers, or per-user data.

| Endpoint | TTL | Cache scope | Invalidation |
|---|---|---|---|
| `GET /api/quiz/[pin]/info` — quiz title, brand, question count, mode | 60s | public | On session state change |
| `GET /api/quiz/[pin]/question/[qIdx]` — question prompt, options (no `correct`), type, time_seconds | Until question is revealed | public, per-question | On `revealed` transition |
| `GET /api/quiz/[pin]/question/[qIdx]/counts` — post-reveal answer distribution counts | Until next question | public, per-question | On next question start |
| `GET /api/brands/[brandId]` — brand name, logo URL, accent color | 1 hour | public | Manual (brand rarely changes) |

Header pattern for these endpoints:
```
Cache-Control: public, s-maxage=60, stale-while-revalidate=30
```
For question content (stable until revealed):
```
Cache-Control: public, s-maxage=3600, stale-while-revalidate=300
```

Use Vercel `cacheTag` for fine-grained invalidation:
```ts
import { cacheTag } from 'next/cache';

// Inside a Next.js Server Component or route handler:
cacheTag(`question:${sessionId}:${questionId}`);

// On reveal: invalidate this tag
revalidateTag(`question:${sessionId}:${questionId}`);
```

**Pre-reveal answer counts are NOT public.** Before the host triggers reveal (sync) or the question locks (async), answer distribution counts are host-only. Only post-reveal counts may be public. See §4 for why this matters.

#### 1.2 Private — No CDN cache

These responses contain per-user state, PII, correct answers, or host-control data.

| Endpoint | Why private |
|---|---|
| `POST /api/session/[pin]/answer` — submit answer | Write, per-user |
| `GET /api/participant/[pin]/state` — participant's own submitted answer, is_correct, score | Per-user, contains PII-adjacent state |
| `GET /api/host/[pin]/live` — answer counts (pre-reveal), individual player list, revealed answer | Pre-reveal counts + PII |
| `GET /api/admin/**` | Administrative data |
| `GET /api/session/[pin]/participants` — full participant list | Contains phone, full name |
| `GET /api/session/[pin]/results` — post-session detailed results | May contain individual answers |
| `POST /api/session/[pin]/start`, `/pause`, `/end`, `/reveal` | State-mutating |

Header pattern:
```
Cache-Control: private, no-store
```

**Never** use `no-cache` (allows revalidation) for these endpoints — use `no-store` (no storage at any layer, including browser history).

---

### 2. Forbidden Fields in Public Payloads

These fields must **never** appear in any response that is public-cacheable or that is readable without participant authentication:

| Field | Why forbidden |
|---|---|
| `question.correct` / `correct_ids` | Leaks the correct answer before reveal |
| `question.explanation` | Contains the correct-answer explanation |
| `answer.is_correct` | Per-participant result |
| `answer.selected_ids` | Per-participant selection (privacy) |
| `answer.score`, `answer.time_bonus` | Per-participant score component |
| `participant.phone` | PII — mandatory join field |
| `participant.name` (full) | PII — use display name only in public-facing endpoints |
| `participant.unit` | PII — military unit info |
| Pre-reveal `answer_counts` | Information leak — see §4 |

---

### 3. Participant-Safe Payload Shape

A participant may only see:

**Their own session state (`GET /api/participant/[pin]/state`):**
```json
{
  "session": {
    "status": "live",
    "game_mode": "sync",
    "quiz_title": "מסע בעקבות אבות האומה",
    "brand": { "name": "בשביל יהודה", "logo_url": "...", "accent": "#A0C040" },
    "custom_logo": null
  },
  "current_question": {
    "index": 2,
    "total": 6,
    "type": "single",
    "type_label": "רב־ברירה",
    "prompt": "...",
    "options": [
      { "id": "a", "text": "אברהם אבינו" },
      ...
    ],
    "image_url": null,
    "map": null,
    "time_seconds": 25,
    "status": "answering",
    "deadline_at": "2026-05-01T10:04:30Z",
    "server_now": "2026-05-01T10:04:10Z"
  },
  "my_answer": null,
  "my_score": 4200
}
```

**After submitting (sync mode — no reveal yet):**
```json
{
  "my_answer": {
    "submitted_at": "2026-05-01T10:04:18Z",
    "status": "submitted_awaiting_reveal"
  }
}
```

**After submitting (async mode — immediate reveal) or after host reveals (sync):**
```json
{
  "my_answer": {
    "submitted_at": "...",
    "is_correct": true,
    "score": 1400,
    "time_bonus": 400,
    "status": "revealed"
  },
  "question_reveal": {
    "correct_ids": ["a"],
    "explanation": "אברהם רכש את שדה המכפלה..."
  }
}
```

Note: `correct_ids` and `explanation` only appear when `status == "revealed"`.

**Leaderboard (always public within a session — display-safe names only):**
```json
{
  "leaderboard": [
    { "rank": 1, "display_name": "נועה ל.", "score": 4200 },
    { "rank": 2, "display_name": "אורי כ.", "score": 3850 }
  ]
}
```

`display_name` = `first_name + ' ' + last_name_initial + '.'` — never the full name or phone.

---

### 4. Pre-Reveal Answer Counts — Host Only

**Why this matters:** In a sync session with 24 participants, if answer counts for options A/B/C/D are visible before the host reveals, a participant who submitted last can trivially infer the most popular answer — and in a T/F question, that's the correct answer with near certainty.

**Rule:**
- **Pre-reveal:** answer counts (`{ a: 8, b: 3, c: 1, d: 12 }`) are visible ONLY to the host, via the host-live endpoint.
- **Post-reveal:** aggregate counts (option distributions) become public, cached per `(session, question)` with a `cacheTag`.

Host-live endpoint response (`private, no-store`):
```json
{
  "answer_counts": { "a": 8, "b": 3, "c": 1, "d": 12 },
  "respond_count": 24,
  "total_players": 24,
  "question_status": "answering",
  "time_remaining_ms": 8400,
  "players": [
    { "id": "uuid", "display_name": "נועה ל.", "score": 4200, "answered": true }
  ]
}
```

Post-reveal public counts (after `revalidateTag`):
```json
{
  "answer_counts": { "a": 8, "b": 3, "c": 1, "d": 12 },
  "correct_ids": ["a"],
  "total_responses": 24
}
```

---

### 5. Host and Admin Payload Privacy Rules

**Host live view** (`/api/host/[pin]/live`) — `private, no-store`:
- May see: real-time answer counts (pre-reveal), player list with `display_name` + answered status + score.
- Must NOT see: each player's selected option IDs before the host's own reveal action.
- Must NOT return: participant phone numbers or full names in the player list.
- After session ends, host sees final distribution + correct answer.

**Admin** (`/api/admin/**`) — `private, no-store`:
- Admin sees full participant data including name, phone, unit.
- Admin may export results CSVs — these must be generated server-side and streamed, never cached.
- Admin sessions must be authenticated (JWT/session cookie). No public admin routes.

---

### 6. Authentication Scope for Cache Classification

The cache classification above assumes:
- **Public endpoints** are unauthenticated (accessible with only the PIN).
- **Participant private endpoints** require the participant's session token (set on join).
- **Host endpoints** require the host's auth token.
- **Admin endpoints** require admin auth.

Authentication implementation (Wave 2 — Supabase Auth or custom JWT) must ensure:
- Participant tokens cannot call host or admin endpoints.
- The public quiz endpoints (`/api/quiz/[pin]/info`, question content) are accessible without any auth.
- The participant's own answer state requires the participant's own token.

**Participant identity model (load-bearing for RLS in §Consequences):**
The participant join form collects name + phone + unit. Participants do NOT create a password account. The chosen mechanism is:

1. On join, the server creates a **Supabase anonymous auth user** (`supabase.auth.signInAnonymously()` server-side, or client-side immediately followed by a server insert).
2. The returned `auth.uid()` becomes the `session_participants.id` for that participant in that session.
3. The participant's session token (cookie or localStorage) carries this anonymous user identity.
4. Phone is stored in `session_participants.phone` and used for the `(session_id, phone)` UNIQUE rejoin idempotency — but the auth identity is the anonymous `auth.uid()`, not the phone.

This makes the RLS policies in §Consequences directly wireable: `auth.uid() = session_participants.id` works because the row was created with that exact UUID. A participant who clears cookies and rejoins with the same phone gets a fresh anonymous user; the server detects the existing `(session_id, phone)` row and re-binds the new auth UID to it (or returns the existing record under the new identity — exact mechanism deferred to the Wave 2 Auth ADR).

---

### 7. Cache Header Summary

| Endpoint class | Header |
|---|---|
| Public quiz info / question content (pre-reveal) | `Cache-Control: public, s-maxage=3600, stale-while-revalidate=60` |
| Public post-reveal counts | `Cache-Control: public, s-maxage=86400, stale-while-revalidate=3600` |
| Short-lived public (session status, lobby count) | `Cache-Control: public, s-maxage=5, stale-while-revalidate=5` |
| Participant private state | `Cache-Control: private, no-store` |
| Host live dashboard | `Cache-Control: private, no-store` |
| Admin | `Cache-Control: private, no-store` |
| All write (POST/PUT/PATCH/DELETE) | `Cache-Control: no-store` |

---

## Consequences

- Every Route Handler must explicitly set `Cache-Control`. Never rely on Vercel's default caching for API routes.
- The `question_reveal` payload block (`correct_ids`, `explanation`) must be gated behind a runtime check: `if question.status != 'revealed', exclude these fields from the response`.
- The `cacheTag` for post-reveal counts must be set at question-start time and invalidated at reveal time using `revalidateTag`.
- Pre-reveal answer counts must not appear in the same response object as the question prompt — use separate endpoints to prevent accidental cache merge.
- Participant phone number must be stored hashed (or only in a server-only table) and must never be serialised into any Next.js Server Component or API response that crosses the network boundary to the browser.

### RLS Sketch (Supabase Row-Level Security)

The following policies enforce the privacy rules at the database layer. They are a sketch — full policy text is elaborated in the Wave 2 Auth ADR.

```sql
-- session_participants: a participant can read only their own row
ALTER TABLE session_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participant reads own row"
  ON session_participants FOR SELECT
  USING (id = auth.uid());

-- answers: a participant can read/insert only their own answers
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participant reads own answers"
  ON answers FOR SELECT
  USING (participant_id = auth.uid());
CREATE POLICY "participant inserts own answer"
  ON answers FOR INSERT
  WITH CHECK (participant_id = auth.uid());

-- question_session_state: readable by any participant in the session; no direct write by participants
ALTER TABLE question_session_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "session member reads question state"
  ON question_session_state FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM session_participants sp
      WHERE sp.session_id = question_session_state.session_id
        AND sp.id = auth.uid()
    )
  );

-- participant_question_progress: participant reads/inserts only their own rows (async mode)
ALTER TABLE participant_question_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participant reads own progress"
  ON participant_question_progress FOR SELECT
  USING (participant_id = auth.uid());
```

**Service-role bypass:** all server-side route handlers (host controls, cron jobs, scoring) run with the Supabase `service_role` key and bypass RLS. RLS is the last line of defence against direct client SDK access — it is not a substitute for server-side auth checks.

**Realtime + RLS interaction:** Supabase Realtime broadcasts respect RLS only when (a) the table has `REPLICA IDENTITY FULL` set, and (b) the table is added to the `supabase_realtime` publication. Wave 2 must enable both for `question_session_state`, `participant_question_progress`, and `participant_scores` so that participant Realtime subscriptions don't silently leak rows the policies should block. Verify with: `SELECT relreplident FROM pg_class WHERE relname = '<table>';` (expect `f`).

---

## Open Questions

1. **Lobby participant count:** Is the number of joined participants (`"12 משתתפים"` shown in the host lobby) public-cacheable? It's low-privacy but changes frequently. Proposed: `s-maxage=5` public — rough count is fine, exact real-time count is host-only.
2. **Result page for ended sessions:** Should final leaderboard be public (accessible to anyone with the PIN after the session ends)? Proposed: yes, with `s-maxage=3600` and `cacheTag`. Needs product decision.
3. **Phone hashing:** Should phone be stored as a SHA-256 hash (for deduplication without storing PII) or as plaintext server-side (for admin export)? Plaintext server-side with strict access control is simpler for MVP; hashing can be added later. Flag for GDPR/privacy review.
