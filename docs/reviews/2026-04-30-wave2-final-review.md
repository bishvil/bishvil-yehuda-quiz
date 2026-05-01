# Wave 2 Final Review — 2026-04-30

**Verdict:** `accept-with-followups`

Wave 2 can close. I found no CRITICAL/HIGH blocker in the new Admin UI/API work. The remaining issues are concrete Wave 3 follow-ups: admin authoring polish, test hardening, data-invariant hardening, and a few backend contracts that are still intentionally rough.

## Subtask 6 Findings

### CRITICAL

None.

### HIGH

None.

### MEDIUM

#### M1. Quiz metadata auto-save drops brand changes and cannot clear custom logo fields
**File:** `app/admin/quizzes/[quizId]/quiz-editor-screen.tsx:112`

`saveQuiz` persists `title`, `defaultGameMode`, and `joinFields`, but it omits `brandId`. It also only sends `customLogo` / `customLogoLabel` when truthy, so unchecking the custom-logo toggle or clearing a label updates local state but does not clear the database value.

**Impact:** Admins can make changes that appear accepted by the auto-save indicator but are lost after reload. This affects authoring correctness, not auth/cache privacy.

**Fix:** Always include `brandId`, and send explicit `null` for nullable fields when the editor state is null.

#### M2. The sessions page can launch an empty quiz
**File:** `app/admin/quizzes/[quizId]/sessions/sessions-screen.tsx:70` and `app/api/admin/sessions/route.ts:117`

The editor launch path blocks `questions.length === 0`, but the sessions page calls `createAdminSession({ quizId })` without checking question count. The API only verifies that the quiz exists and is not archived before creating a scheduled session.

**Impact:** This violates ADR-0004's `draft -> scheduled` guard ("At least one question exists") and can create a published PIN that the host/participant flows cannot run meaningfully.

**Fix:** Enforce `questionCount > 0` in `POST /api/admin/sessions`, and mirror that disabled state in the sessions UI.

#### M3. Question type switching leaves stale incompatible fields
**File:** `src/components/admin/QuestionEditor.tsx:55`

`handleTypeChange` clears options/correct IDs for `map`, but switching back from `map` to choice/image keeps `map`, and switching from `image` to non-image keeps `imageUrl`. The save path then sends those stale fields in `app/admin/quizzes/[quizId]/quiz-editor-screen.tsx:167`.

**Impact:** The public renderers mostly ignore stale fields by question type today, but the database accumulates contradictory question rows and future exports/imports/previews can read the wrong payload.

**Fix:** Normalize the full payload on every type change: only map questions keep `map`/`tolerance`; only image questions keep `imageUrl`; choice questions keep options/correct IDs; true/false should default a valid `correctIds` value if the previous IDs do not apply.

### LOW

#### L1. Admin e2e smoke is fixture-dependent
**File:** `tests/e2e/admin-smoke.spec.ts:50`

The test waits for a heading named `/החידונים שלי|אין חידונים/`, but the non-empty quiz list page currently exposes "החידונים שלי" as breadcrumb text, not a heading. It passed in a clean empty-list state, but failed locally against the seeded non-empty list.

**Fix:** Assert the stable page affordances instead: the create button plus either `admin-quiz-card` or the empty-state heading.

#### L2. `NODE_ENV=test` in package scripts works, but direct Vitest remains sharp-edged
**File:** `package.json:21`

Running the admin hook tests through the project script/env passes, but a direct `pnpm vitest run ...` fails with React 19 / RTL v16 `React.act is not a function`. The script workaround is acceptable for Wave 2, but it is easy for contributors to bypass.

**Fix:** Move the test env setup into `vitest.config.ts` or `tests/setup.ts` if possible, or document that React component tests must run through `pnpm test` / `NODE_ENV=test`.

## Cross-UI Consistency

No blocking findings.

- **Auth/cache:** Admin client fetches use `credentials: "include"` and `cache: "no-store"` in `src/lib/admin/api-client.ts:21`; modified admin routes keep `requireRole("admin")` and `privateNoStoreJson`.
- **ADR-0008:** `joinFields`, `questionCount`, and session-result payloads are admin-only and remain private no-store.
- **State transitions:** Admin launch creates `scheduled` server-side with server-generated PINs. Host start/next/reveal/end still own live game control.
- **RTL/a11y:** Admin forms mostly use labeled controls, logical spacing, and text-start. Arrow reorder controls have accessible labels. Map coordinate fields are LTR only where appropriate.
- **Component reuse:** Admin reuses `PrimaryButton`, `privateNoStoreJson`, `requireRole`, constants, and the shared brand/token vocabulary.
- **Question-type doc drift:** The authoritative schema/ADR/design-intake set is `single | multi | truefalse | image | map`. The task-spec wording (`multi-with-image`, `free-text`) is doc drift, not a Wave 2 product gap.
- **ADR-0009:** Sound. ADR-0004 links to ADR-0009 at the superseded transition, ADR-0009 states the exact override, and the README indexes it.

## Backend MEDIUM/LOW Re-eval

| Original ID | Current verdict | Severity now | Wave 2 blocker? | Disposition |
|---|---|---:|---|---|
| M1 cron timing-safe compare | Still valid: `requireCronAuth` still uses string equality in `src/lib/auth/server-auth.ts:136`. | MEDIUM | No | Wave 3 hardening. |
| M2 public routes serve draft/paused | Still valid: public info/question/counts still use `findAnySessionByPin`; `findAnySessionByPin` has no status filter. | MEDIUM | No | Wave 3 route split/status policy. |
| M3 rejected-transition semantics | Partially fixed: same-state pause/resume/end are idempotent, but invalid transitions still commonly return 409 despite ADR wording. | MEDIUM | No | Wave 3 consistency pass. |
| M4 DB constraints | Still valid: migration still lacks brand, PIN format, positive timer/points, and tolerance checks. | MEDIUM | No | Wave 3 schema migration. |
| M5 scoped participant JWT RLS test | Still valid: current RLS test still signs in a random anonymous user and only proves no rows are visible. | MEDIUM | No | Wave 3 auth-test helper. |
| M6 stored JSON validation | Still valid: public payload/scoring paths still cast JSON shapes instead of validating persisted option/map content. | MEDIUM | No | Wave 3 Zod validation before serialization/scoring. |
| M7 async participant advance | Silently fixed: `app/api/participant/[pin]/next/route.ts` now creates next progress rows and marks completed. | N/A | No | Closed. |
| L1 duplicate middleware/proxy entrypoints | Still valid: both `src/middleware.ts` and `proxy.ts` delegate to the same updater. | LOW | No | Wave 3 cleanup/documentation. |
| L2 HostLive type weakness | Silently fixed: `HostLiveErrorBody`/`never` casts are gone from `app/api/host/[pin]/live/route.ts`. | N/A | No | Closed. |
| L3 unsafe-sounding JWT decode helper | Still valid: `decodeParticipantAccessToken` still decodes without verifying; currently only used after join. | LOW | No | Rename or document as unsafe in Wave 3. |

## Wave 3 Punch List

1. Enforce non-empty quiz launch at the admin sessions API and UI.
2. Fix admin metadata auto-save for `brandId` and explicit nullable logo clearing.
3. Normalize question payloads on type changes; clear stale `map`, `imageUrl`, `correctIds`, and tolerance fields.
4. Add file upload/storage pipeline for logos, image questions, and map backgrounds.
5. Add true drag-and-drop reorder with keyboard-accessible fallback.
6. Add streamed CSV results export for admin session results.
7. Add per-question live preview in the editor.
8. Harden cron auth with timing-safe `CRON_SECRET` comparison.
9. Split public session lookup helpers so draft/paused exposure is deliberate per endpoint.
10. Normalize rejected-transition response semantics across state-mutating routes.
11. Add DB CHECK constraints for brand IDs, PIN format, positive timers/points, and map tolerance.
12. Add scoped participant JWT RLS tests for own-row success and sibling-row denial.
13. Validate stored JSON option/map payloads before public serialization and scoring.
14. Clean up duplicate middleware/proxy entrypoints once the Next 16 convention is settled.
15. Rename/document `decodeParticipantAccessToken` as decode-only/unsafe.
16. Make admin e2e smoke deterministic with non-empty seeded quiz lists.

## Test Plan Deltas

- `NODE_ENV=test pnpm vitest run tests/unit/admin/auto-save.test.ts tests/unit/admin/useDebouncedAutoSave.test.tsx tests/unit/admin/quiz-editor.test.ts tests/unit/admin/results.test.ts` — passed, 23 tests.
- `pnpm vitest run tests/unit/api/answer-route.test.ts tests/unit/api/answer-route-concurrent.test.ts tests/unit/api/join-route.test.ts tests/unit/api/host-next-route.test.ts tests/unit/api/rls.test.ts` — passed, 10 tests.
- `pnpm vitest run ...admin...` without `NODE_ENV=test` — failed only in `useDebouncedAutoSave` tests with the known React 19 / RTL `React.act` environment issue.
- `pnpm test:e2e -- tests/e2e/admin-smoke.spec.ts` — failed locally because the seeded non-empty quiz list has no matching heading for the test's first assertion; the page itself loaded and showed the admin quiz list/create button.

## Closure Rationale

The post-review fix batch closed the prior CRITICAL/HIGH issues that would have blocked Wave 2: host ownership is strict, answer submission is RPC-backed/atomic, async reveal persistence is covered, duplicate phone join is normalized/idempotent, and paused host-next is rejected before mutation. The new Admin UI preserves auth/cache boundaries and has no Wave 2 stop-the-line defect. Close Wave 2 with the punch list above filed as Wave 3 subtasks.
