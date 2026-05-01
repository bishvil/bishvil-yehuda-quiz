# Wave 2 UI Code Review — 2026-04-30

## Summary
- 0 CRITICAL · 2 HIGH · 1 MEDIUM · 0 LOW
- Overall verdict: accept-with-followups
- Reviewer: codex-cli-1
- Scope reviewed: Participant UI (Subtask 4) + Host UI/live dashboard (Subtask 5)
- Commits emphasized: d338e84, 633944a, 70f1daa, 88734da, c9a94ee plus prior participant UI commits

## CRITICAL findings

None.

## HIGH findings

### H1. Draft host screen enables a start action that the server rejects
**Severity:** HIGH
**File:** src/lib/host/controls.ts:63
**Finding:** `decideHostPrimaryButton` treats `draft` the same as `scheduled` and enables `start_session` whenever `hasNextQuestion` is true. The route rejects the same click because `/api/host/[pin]/start` only allows `scheduled → live`; `draft → live` returns `INVALID_TRANSITION` at `app/api/host/[pin]/start/route.ts:51`. This violates the review requirement that state-transition buttons visually disable when the server would 4xx.
**Impact:** A host looking at a draft session can press an enabled primary CTA and get a server error. The UI is also implying a lifecycle transition that ADR-0004 does not allow; draft sessions must first be scheduled/published.
**Fix:** Split `draft` from `scheduled` in `decideHostPrimaryButton`. For `draft`, return a disabled state with a publish/schedule hint, or hide the host dashboard until the session is scheduled. Add a unit case covering `sessionStatus: "draft"` with questions present.

### H2. Paused revealed sessions can partially advance, then fail to start the next question
**Severity:** HIGH
**File:** src/lib/host/controls.ts:87
**Finding:** When `sessionStatus === "paused"` and `questionStatus === "revealed"`, the primary decision returns enabled `advance`. `HostScreen` then calls `/question/next` and, if a next question exists, immediately calls `/question/start` (`app/host/[pin]/host-screen.tsx:132`). The next route currently permits paused sessions (`app/api/host/[pin]/question/next/route.ts:42`) and updates `current_question_id`, but the start route rejects because the session is not `live` (`app/api/host/[pin]/question/start/route.ts:59`). The result is a partial mutation followed by an error.
**Impact:** A paused session can move off the revealed question without starting the next one. Participants and host can lose the previous reveal context and land on an idle next question while the UI reports an error. This breaks ADR-0004 paused-state expectations and the UI state-machine contract.
**Fix:** Make advance live-only in both UI and API. Disable the primary advance CTA while paused with a "resume first" hint, and change `/question/next` to reject paused sessions before mutating. Add tests for paused+revealed: UI decision disabled, API next returns current state/error without changing `current_question_id`.

## MEDIUM findings

### M1. Host can end scheduled sessions despite ADR assigning that transition to admin
**Severity:** MEDIUM
**File:** src/components/host/HostControlBar.tsx:40
**Finding:** `HostControlBar` shows "סיום החידון" for `scheduled` sessions, and `/api/host/[pin]/end` allows `scheduled → ended` through `canTransitionSession` (`src/lib/sessions/state-machine.ts:12`, `app/api/host/[pin]/end/route.ts:52`). ADR-0004 allows `scheduled → ended` only for admin cancellation; host-controlled end is specified for `live` and `paused`.
**Impact:** A host can cancel a scheduled session before it starts. That may be product-acceptable, but it is currently ADR drift and should be made explicit before Admin UI bakes in the same pattern.
**Fix:** Either remove `scheduled` from the host end UI/API and keep cancellation admin-only, or supersede ADR-0004 to explicitly allow host cancellation before start. Add one API test for the chosen behavior.

## LOW findings

None.

## Focus area coverage

1. **Cache privacy:** No implementation finding. Host live uses `private, no-store`; participant private state uses `private, no-store`; writes use no-store. Public pre-reveal question payloads strip `correct_ids`, `explanation`, and `map.target`. Public counts return `private, no-store` until revealed.
2. **Reveal gate:** No implementation finding. Participant and host question payloads strip `map.target`; reveal payloads are only built when status is `revealed`. Host answer bars receive `correctIds = null` pre-reveal.
3. **Server-time correctness:** No implementation finding. Countdown call sites use `useServerCountdown` with `serverNow`/`deadlineAt`; direct `Date.now()` usage is confined to the offset helper/server-side expiry checks, not UI call sites.
4. **State machine adherence:** Findings H1 and H2.
5. **First-submit-wins:** No implementation finding. The answer route returns `already_submitted` 200, and the participant UI treats non-error submit responses as success. Coverage is async-only; see test deltas.
6. **Sync vs async:** No implementation finding in UI. Sync uses session current question; async uses participant progress and `/api/participant/[pin]/next`.
7. **Auth flow:** No finding. Private client fetches include credentials; host APIs call `requireRole("host")`; participant APIs call `requireRole("participant")`.
8. **Cookie scope / SameSite:** No new client-side cookie writes found in the reviewed UI files.
9. **XSS:** No finding. User/DB text is rendered through React escaping; no `dangerouslySetInnerHTML` found.
10. **Prototype pollution / object spread:** No finding. Server payloads are mapped into explicit DTOs; no broad `{ ...input }` spread into client state found in reviewed paths.
11. **'use client' boundaries:** No finding. Server components pass brand/session chrome, not correct answers or PII-heavy rows, into client components.
12. **Suspense / streaming:** No finding. No Suspense/streaming boundaries in reviewed participant/host surfaces.
13. **Async params:** No finding. All consumed route/page params found via `rg` are Promise-typed and awaited.
14. **Fetch caching defaults:** No finding. Private client fetches specify `cache: "no-store"` where needed; route handlers set explicit cache headers.
15. **next/image:** No finding. Brand/header images have fixed dimensions and the recent aspect warning fix is present.
16. **Component reuse:** No finding. Host reuses participant `PrimaryButton` and shared countdown helper; host-specific components are reasonable because projector/mobile dashboard needs differ.
17. **Tailwind 4 token usage:** No blocking finding. Components mostly use `bsy-*` tokens. A few raw shadow/hover/SVG color values remain but are localized and not privacy/correctness risks.
18. **RTL:** No finding. Root layout sets `dir="rtl"`; most layout spacing uses logical `ms`/`text-start`. Absolute map coordinates legitimately use `left/top` against image coordinate space.
19. **A11y:** No blocking finding. Join inputs have labels, buttons have text names, alert/status regions are present. Map interaction remains pointer-centric; add keyboard-map support later if map questions become central.
20. **Self-flagged test gaps:** Should be follow-ups, not blockers for Admin UI. Mobile tab swap is render-only; no start→answer→wait→reveal→next full-flow e2e; pause/resume/end are decision/API-tested more than click-flow tested; async host loading is acceptable per sync-only host scope.
21. **ADR drift:** Findings H1, H2, and M1. No ADR drift found for reveal gating/cache privacy.

## Quick wins / verification suggestions

1. Add `decideHostPrimaryButton` tests for `draft` and `paused + revealed`.
2. Add a host-next API test that paused sessions cannot mutate `current_question_id`.
3. Add a sync answer-submit test asserting the pre-reveal response omits `isCorrect`, `score`, `timeBonus`, `correctIds`, and `explanation`.
4. Add a participant-state sync test for submitted-awaiting-reveal with `reveal: null`.
5. Extend Playwright with a narrow full flow: host starts, participant answers, host waits/reveals, host advances.

## Test plan deltas

- Current focused verification run: `pnpm vitest run tests/unit/host/controls.test.ts tests/unit/api/host-live-route.test.ts tests/unit/api/answer-route.test.ts` — passed, 17 tests.
- Failed command before rerun: `pnpm vitest ... --runInBand` because Vitest 3 does not support that Jest flag.
- Existing tests cover host-live `private,no-store`, pre-reveal host leak assertions, async duplicate submit, async reveal persistence, and host-next revealed-only behavior.
- Missing coverage to add now or in fix batch: H1/H2 regressions, sync pre-reveal submit payload, participant sync submitted-awaiting-reveal state, and click-flow tests for pause/resume/end.

## Files reviewed

- `docs/decisions/ADR-0004-state-machine.md`
- `docs/decisions/ADR-0005-question-lifecycle.md`
- `docs/decisions/ADR-0006-answer-policy.md`
- `docs/decisions/ADR-0007-sync-async-model.md`
- `docs/decisions/ADR-0008-cache-privacy.md`
- `docs/reviews/2026-04-30-wave2-backend-review.md`
- `app/[pin]/page.tsx`
- `app/[pin]/join-screen.tsx`
- `app/[pin]/lobby/page.tsx`
- `app/[pin]/lobby/lobby-screen.tsx`
- `app/[pin]/play/page.tsx`
- `app/[pin]/play/play-screen.tsx`
- `app/[pin]/result/page.tsx`
- `app/[pin]/result/result-screen.tsx`
- `app/host/[pin]/page.tsx`
- `app/host/[pin]/host-screen.tsx`
- `app/api/participant/[pin]/state/route.ts`
- `app/api/participant/[pin]/next/route.ts`
- `app/api/session/[pin]/answer/route.ts`
- `app/api/host/[pin]/live/route.ts`
- `app/api/host/[pin]/start/route.ts`
- `app/api/host/[pin]/pause/route.ts`
- `app/api/host/[pin]/resume/route.ts`
- `app/api/host/[pin]/end/route.ts`
- `app/api/host/[pin]/question/start/route.ts`
- `app/api/host/[pin]/question/reveal/route.ts`
- `app/api/host/[pin]/question/next/route.ts`
- `app/api/quiz/[pin]/info/route.ts`
- `app/api/quiz/[pin]/question/[qIdx]/route.ts`
- `app/api/quiz/[pin]/question/[qIdx]/counts/route.ts`
- `app/layout.tsx`
- `app/globals.css`
- `src/lib/participant/api-client.ts`
- `src/lib/hooks/useParticipantState.ts`
- `src/lib/hooks/useHostState.ts`
- `src/lib/time/countdown.ts`
- `src/lib/sessions/participant-payload.ts`
- `src/lib/host/api-client.ts`
- `src/lib/host/controls.ts`
- `src/lib/sessions/host-context.ts`
- `src/lib/sessions/state-machine.ts`
- Representative participant components: `AnswerOption`, `MapQuestion`, `PrimaryButton`, `TimerBar`, `BrandBlock`, `Leaderboard`, `ScoreCircle`
- Host components: `HostAnswerBars`, `HostControlBar`, `HostHeader`, `HostMapSummary`, `HostPlayerList`, `HostQuestionCard`, `HostStatusPill`, `HostTimerPanel`
- `tests/unit/host/controls.test.ts`
- `tests/unit/api/host-live-route.test.ts`
- `tests/unit/api/answer-route.test.ts`
- `tests/unit/api/host-next-route.test.ts`
- `tests/e2e/participant-join.spec.ts`
- `tests/e2e/host-smoke.spec.ts`
