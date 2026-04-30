# Wave 2 Backend Code Review — 2026-04-30

## Summary
- 1 CRITICAL · 4 HIGH · 7 MEDIUM · 3 LOW
- Overall verdict: needs-rework
- Reviewer: codex-cli-1
- Implementer: claude-code-1 (Sonnet)
- Commits reviewed: 090ebd0, ba7b508, fbc94ce, 61916a1, 07245e2, 0d8236a, e62ed32, de5a278, bf548eb, 91b3e59, 570318c, 6524210, c7793d8, e1bc11f, 231a42e, c467b04, 69c91b4

## CRITICAL findings

### C1. Host routes allow any host to control hostless sessions
**Severity:** CRITICAL
**File:** src/lib/sessions/host-context.ts:49
**Finding:** `loadHostContext` only rejects a host when `session.host_id` is non-null and different from the authenticated host. Sessions created without `hostUserId` store `host_id: null` in `app/api/admin/sessions/route.ts:82`, so any authenticated host who knows the PIN can pass host authorization. The host control routes then allow destructive mutations such as ending the session in `app/api/host/[pin]/end/route.ts:79`.
**Impact:** A host account can take over or end an unassigned/async session by PIN, causing unauthorized state changes and data loss/quiz disruption.
**Fix:** Enforce ownership for host endpoints: require `session.host_id === auth.claims.userId`; reject null host IDs on sync host routes unless a deliberate claim/assignment flow exists. Also reject host question/session control routes for async sessions where host control is not part of the model, and ensure admin session creation assigns a host for sync sessions or keeps those sessions inaccessible to host endpoints until assigned.
**Follow-up task:** e03a98ca-93b5-46ff-adaf-8a8fb4af6d78

## HIGH findings

### H1. Async submit returns reveal data but leaves progress `answering`
**Severity:** HIGH
**File:** app/api/session/[pin]/answer/route.ts:348
**Finding:** Async answer submit returns `isCorrect`, `correctIds`, and `explanation`, but it does not update `participant_question_progress` to `revealed`. `GET /api/participant/[pin]/state` later derives `isRevealed` from the progress row status at `app/api/participant/[pin]/state/route.ts:311`, so a refresh after submit can show `submitted_awaiting_reveal` until the deadline expires.
**Impact:** Violates ADR-0006 §8 and ADR-0007 §2.4: async participants should immediately be in revealed state after submission. The UI becomes inconsistent and can hide reveal data after a successful submit.
**Fix:** In the async branch of the answer transaction, update the participant's progress row to `revealed` with `revealed_at = submitted_at` in the same atomic write path as the answer insert/score update. Add a regression test: async submit followed by participant state returns `myAnswer.status='revealed'` and `reveal.correctIds` before the deadline.
**Follow-up task:** 0405ba4e-8a57-4ca0-975f-6c199a013c5b

### H2. Answer insert, score summary, and streak update are not atomic
**Severity:** HIGH
**File:** app/api/session/[pin]/answer/route.ts:274
**Finding:** The route inserts the canonical answer first, then updates `participant_scores` and `session_participants.streak/status` in separate best-effort statements at `app/api/session/[pin]/answer/route.ts:325`. `upsertParticipantScores` reads the existing summary then writes `existing.total_score + scoreDelta` at `app/api/session/[pin]/answer/route.ts:402`, which can lose increments under concurrent submissions and can leave summaries stale if a post-insert update fails.
**Impact:** Violates ADR-0006 §6 and ADR-0007 §3, which require score summaries and streaks to update in the same transaction as the answer insert. Leaderboards/results can become incorrect even though answer rows are present.
**Fix:** Move answer submission into a Postgres RPC or database transaction that locks the participant score row, inserts with `ON CONFLICT DO NOTHING RETURNING *`, and updates score/streak only for a newly inserted answer. Use atomic `INSERT ... ON CONFLICT ... DO UPDATE SET total_score = participant_scores.total_score + excluded_delta` or row locks. Add concurrent submit tests covering two different questions for the same participant.
**Follow-up task:** a2f152dc-4f48-458c-9a2e-99daa71d7ae8

### H3. Join does not normalize phone or return existing participant on duplicate
**Severity:** HIGH
**File:** app/api/session/[pin]/join/route.ts:106
**Finding:** The join route stores `parsedBody.data.phone` directly, with no canonicalization. On `(session_id, phone)` unique conflicts it returns `PARTICIPANT_CREATE_FAILED` at `app/api/session/[pin]/join/route.ts:124` instead of returning the existing participant. This contradicts ADR-0004 §2 phone normalization and §3 join idempotency.
**Impact:** The same participant can join multiple times with equivalent phone formats, or get a 409 on retry/rejoin with the same format. This breaks participant identity, leaderboard accuracy, and network retry behavior.
**Fix:** Add the ADR phone normalization helper before insert, use the normalized phone for uniqueness, and implement conflict handling that returns/rebinds the existing participant according to the chosen auth model. Add tests for `0501234567`, `+972501234567`, and duplicate retry returning the same participant/session instead of 409.
**Follow-up task:** 36fcadc3-671f-41bd-9c2d-e0f05b0e6d54

### H4. Host `next` can advance while the current question is not revealed
**Severity:** HIGH
**File:** app/api/host/[pin]/question/next/route.ts:41
**Finding:** The next-question route only checks the session status, then advances to the next ordinal at `app/api/host/[pin]/question/next/route.ts:82`. It does not verify that the current `question_session_state.status` is `revealed`.
**Impact:** A host can advance from `answering` or `locked`, skipping the reveal step required by ADR-0005 §3.4 and §3.5. Participants can be moved off a question without seeing the reveal, and active timers/answers are left in an inconsistent lifecycle.
**Fix:** Load the current question state, lazy-expire if needed, require `status === 'revealed'` before advancing, and reject or idempotently return current state otherwise. For the last question, transition the session to `ended` only after the last question is revealed. Add tests for answering->next and locked->next denial plus revealed->next success.
**Follow-up task:** c85b916a-ec36-4847-8924-9f3bea06b352

## MEDIUM findings

### M1. Cron secret comparison is not timing-safe
**Severity:** MEDIUM
**File:** src/lib/auth/server-auth.ts:133
**Finding:** `requireCronAuth` compares the Authorization header with a plain `===` string comparison.
**Impact:** The route is authenticated and the Bearer format is strict, but it does not satisfy the review brief's timing-safe comparison requirement for `CRON_SECRET`.
**Fix:** Parse `Authorization: Bearer <token>` strictly, then compare fixed-length buffers with `crypto.timingSafeEqual`, returning the same 401 response for malformed and wrong tokens.

### M2. Public quiz/question routes serve draft and paused sessions
**Severity:** MEDIUM
**File:** src/lib/sessions/lookup.ts:27
**Finding:** `findAnySessionByPin` returns the newest session for a PIN without status filtering. Public `/api/quiz/[pin]/info` and question routes call it at `app/api/quiz/[pin]/info/route.ts:37` and `app/api/quiz/[pin]/question/[qIdx]/route.ts:62`.
**Impact:** If a draft or paused session has a PIN, unauthenticated users can read quiz metadata and question prompts. ADR-0004 says draft sessions are still being configured and participants cannot join.
**Fix:** Use separate lookup helpers: public quiz endpoints should allow only scheduled/live/ended states that product explicitly marks shareable. Keep admin/host lookups separate.

### M3. State-mutating routes do not follow ADR rejected-transition semantics
**Severity:** MEDIUM
**File:** src/lib/sessions/state-machine.ts:18
**Finding:** `canTransitionSession` permits idempotent same-state transitions, but host handlers return 409 for invalid transitions, for example `app/api/host/[pin]/pause/route.ts:54` and `app/api/host/[pin]/resume/route.ts:43`.
**Impact:** ADR-0004 §1 says rejected transitions return current state with no client error. Current behavior can make harmless double-clicks/retries look like failures.
**Fix:** Normalize transition handlers to return the current state for rejected/idempotent cases where the ADR requires no error; reserve 409 for true request conflicts outside the state-machine table.

### M4. Schema leaves ADR constraints to application code only
**Severity:** MEDIUM
**File:** supabase/migrations/0000_sloppy_bug.sql:85
**Finding:** `quizzes.brand_id` is free text with no CHECK against the static brand enum, and `sessions.pin` has no database format check. Question `time_seconds`/`points` also lack positive CHECK constraints.
**Impact:** Bad admin writes, seed scripts, or future import tools can persist invalid brand IDs, malformed PINs, or nonsensical scoring/timer values even though the ADRs define these as load-bearing invariants.
**Fix:** Add DB CHECK constraints for brand IDs, 6-digit PIN format, positive question time, positive points, and map tolerance bounds.

### M5. RLS test does not exercise a scoped participant JWT
**Severity:** MEDIUM
**File:** tests/unit/api/rls.test.ts:98
**Finding:** The test signs in as a fresh anonymous user, then queries participant B's answer and expects zero rows. The comments acknowledge it does not mint a JWT whose `sub` is participant A at `tests/unit/api/rls.test.ts:104`.
**Impact:** It proves random anon users cannot read rows, but it does not prove the real participant-token shape (`sub = session_participants.id`) can read own rows and cannot read sibling rows.
**Fix:** Add a JWT helper or use Supabase auth admin to create participant A/B users with matching app_metadata, then assert own-row success and cross-row denial through the anon client using those real tokens.

### M6. JSON payloads are cast instead of validated before serialization/scoring
**Severity:** MEDIUM
**File:** src/lib/sessions/participant-payload.ts:82
**Finding:** Question option/map JSON is cast with `as unknown as RawQuestionOption[]` and `as unknown as RawQuestionMap`; answer scoring does the same for map targets at `app/api/session/[pin]/answer/route.ts:390`.
**Impact:** Invalid JSON persisted by admin/import paths can produce malformed public payloads or runtime exceptions on scoring instead of structured 4xx/5xx responses.
**Fix:** Reuse Zod schemas for stored `options` and `map` before serializing/scoring. Return a structured internal-data error if DB content is invalid.

### M7. Async progression has no participant advance endpoint
**Severity:** MEDIUM
**File:** app/api/participant/[pin]/state/route.ts:203
**Finding:** Async state always picks the latest `participant_question_progress` row, and state bootstrapping only creates question 1. There is no route in `app/api` that creates the next progress row after a participant's current row is revealed.
**Impact:** This does not violate the Subtask 3 endpoint inventory, but it leaves ADR-0007 §2.3/§2.6 incomplete: async participants can answer question 1 but have no backend path to advance through the quiz.
**Fix:** Add a participant-authenticated advance route that requires the current async progress row to be `revealed`, creates the next row with server timestamps, and marks the participant `completed` after the last question.

## LOW findings (rolled up)
- src/middleware.ts:5 and proxy.ts:5 — both delegate to the same middleware updater. If Next 16 only needs `proxy.ts`, keeping both entrypoints can confuse future route-protection edits.
- app/api/host/[pin]/live/route.ts:34 — `HostLiveErrorBody` uses `never` fields and the final response casts to `HostLiveSuccessBody`; this weakens the type signal in a route that returns only success bodies locally.
- src/lib/auth/claims.ts:15 — `decodeParticipantAccessToken` decodes without verifying. This is currently used only to sanity-check Supabase's freshly returned token after join, but the function name can invite misuse in request auth.

## Coordinator action items assessment
1. Postgres RPC: needed now. H2 is a real correctness problem, not just polish. The answer path needs one atomic database operation for insert, idempotent duplicate return, score summary, streak/status, and async reveal state.
2. Session-expiry cron: Wave 3 acceptable for host auto-pause, but async `ended_at` expiry should be scheduled before production because ADR-0007 says expired async sessions become `ended`. Current request handlers reject expired sessions, so this is not a Wave 2 stop-the-line item.
3. vercel.json cron schedule: required for deployment subtask. There is no `vercel.json`, so `/api/cron/expire-questions` will not run on Vercel until deployment wiring adds `{ "path": "/api/cron/expire-questions", "schedule": "* * * * *" }`.
4. Scoped-JWT RLS test: implement now or with the H2/C1 fix batch. The current test is weaker than the claim in the progress note; add own-row and cross-row assertions using real scoped JWTs.
5. `'use cache'` adoption: Wave 3/performance. The explicit Cache-Control headers are present, but cache tags are dormant without Next data-cache adoption. That is not a privacy bug because public question content intentionally excludes correct answers.

## Test coverage gaps (prioritized)
1. app/api/session/[pin]/answer/route.ts:348 — async submit followed by participant state before deadline should show `myAnswer.status='revealed'` and reveal payload.
2. app/api/session/[pin]/answer/route.ts:325 — concurrent answer submissions for two questions by the same participant should not lose `participant_scores.total_score` or streak updates.
3. src/lib/sessions/host-context.ts:49 — a host token must be rejected for sessions with `host_id = null` or a different `host_id`; include `/end` as the destructive regression case.
4. app/api/session/[pin]/join/route.ts:106 — phone variants should normalize to the same value, and duplicate join should return the existing participant instead of 409.
5. app/api/host/[pin]/question/next/route.ts:82 — `next` must fail/return current state for `answering` and `locked`, and succeed only after `revealed`.
6. tests/unit/api/rls.test.ts:98 — use scoped participant JWTs to prove own-row access and sibling-row denial.
7. src/lib/auth/server-auth.ts:133 — cron auth should reject missing/malformed/wrong Bearer tokens and use timing-safe comparison.

## Strengths
- RLS is enabled on all eight application tables, and the core participant row/answer/progress policies match the ADR direction.
- Public question payloads strip `correct_ids`, `explanation`, and map target coordinates before serialization.
- Scoring formula correctly implements ADR-0006 §5 points scaling, exact choice matching, and binary map tolerance.
- Lazy expiry exists in both answer-submit and participant-state paths, so missed cron runs do not keep accepting late answers.
- Cache headers are explicit on route responses, and private/admin/host routes consistently use `private, no-store`.
