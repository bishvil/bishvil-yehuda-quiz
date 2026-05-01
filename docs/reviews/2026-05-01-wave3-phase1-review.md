# Wave 3 Phase 1 Review — 2026-05-01

**Verdict:** `needs-rework`

Phase 1 closes most of the Wave 2 backend/admin punch list, and the core CI gate is green at HEAD. I found no CRITICAL issue and no ADR-0008 correct-answer/PII leak in the newly reviewed API changes. However, Phase 1 should not close yet: the DB hardening commit breaks the existing Playwright host-flow fixture, and the public session status filter still exposes `paused` sessions through unauthenticated quiz APIs even though the Wave 2 finding explicitly called out draft/paused exposure.

## Findings

### CRITICAL

None.

### HIGH

#### H1. Brand CHECK constraint breaks the existing host-flow e2e fixture
**File:** `supabase/migrations/20260501035700_backend_check_constraints.sql:3`

The new `quizzes_brand_id_check` allows only `default`, `yehuda`, `haari`, `tzafon`, and `etzion`, but the existing Playwright host-flow fixture inserts `brand_id = 'bishvil-yehuda'` in `tests/e2e/host-flow.spec.ts:44`. After the constraint migration, the fixture fails at insert time before the browser flow starts.

**Impact:** `PLAYWRIGHT_BASE_URL=http://localhost:3002 pnpm test:e2e -- tests/e2e/host-flow.spec.ts` fails with `violates check constraint "quizzes_brand_id_check"`. This leaves the host start/reveal/advance smoke uncovered and means the DB hardening batch regressed an existing verification path.

**Fix:** Update the e2e fixture to use a canonical brand ID, or broaden the constraint if `bishvil-yehuda` is still a supported persisted ID. Add a small constraint/fixture compatibility check so future brand-registry changes do not silently break e2e setup.

### MEDIUM

#### M1. Public session helper still exposes paused sessions
**File:** `src/lib/sessions/lookup.ts:54`

`findPublicSessionByPin` now hides `draft`, but it deliberately allows `paused` and the new test locks that behavior in at `tests/unit/api/public-status-filter.test.ts:86`. The original Wave 2 M2 issue was that public quiz/question routes served both draft and paused sessions. Paused is a host-controlled mid-session state where participants should be driven through participant-private state, not unauthenticated public question/content URLs.

**Impact:** The public route split only half-closes M2. Anyone with a PIN can still read public info/question metadata while the host has paused a sync session, which is inconsistent with the review brief's ADR-0007 visibility concern and the prior finding disposition.

**Fix:** Remove `paused` from the generic public helper, or split helpers by endpoint so any paused exposure is explicit and justified. Update `public-status-filter.test.ts` to assert 404/hidden behavior for paused where appropriate.

#### M2. Numeric CHECK constraints remain looser than the ADR/app invariants
**File:** `supabase/migrations/20260501035700_backend_check_constraints.sql:18`

The new points constraint is `points >= 0`, but ADR-0004/M4 and `adminQuestionCreateSchema` require positive question points. The tolerance constraint also only checks `type <> 'map' or tolerance > 0` at line 23, so raw writes can persist arbitrarily large map tolerances even though the admin schema bounds tolerance to 0-100.

**Impact:** The M4 DB-hardening intent is not fully met. Seed scripts, imports, or future admin bugs can still persist zero-point questions or nonsensical map tolerances that the application validation would reject.

**Fix:** Change points to `points > 0` and bound map tolerance to the persisted coordinate scale, e.g. `type <> 'map' or (tolerance > 0 and tolerance <= 100)`. Keep the `NOT VALID` then `VALIDATE CONSTRAINT` pattern after checking existing rows.

### LOW

None.

## Per-Item Review

| # | Commit | Punch ID | Review |
|---|---|---|---|
| 1 | `5adedf4` | item 8 / M1 | Met. `requireCronAuth` now uses fixed-length buffers and `timingSafeEqual`, with missing/malformed/wrong token tests. |
| 2 | `91d4aa9` | item 15 / L3 | Met. The decode-only participant token helper is renamed `decodeParticipantAccessTokenUnsafe`, making the non-verifying behavior explicit at call sites. |
| 3 | `da4e055` | item 1 / M2 | Met. Admin session creation now rejects zero-question quizzes, and the sessions UI disables launch with coverage for API and UI paths. |
| 4 | `77fbb35` | item 11 / M4 | Partially met. `NOT VALID` constraints were added and validated, but H1 breaks host-flow e2e and M2 leaves points/tolerance weaker than the ADR/app validation. |
| 5 | `3a7c73e` | item 2 / M1 | Met. Save payloads include `brandId` and explicit nullable custom-logo fields, with route and payload tests. |
| 6 | `126b73d` | item 3 / M3 | Met. Question type switching now centralizes normalization and covers map/choice/image/truefalse edge cases. |
| 7 | `82c0a35` | item 13 / M6 | Met for the reviewed public/participant/scoring paths. Stored question JSON is Zod-validated before public serialization, participant state serialization, and answer scoring. |
| 8 | `e0b5636` | item 9 / M2 | Partially met. Draft sessions are hidden, but paused sessions remain public via the generic helper. See M1. |
| 9 | `a94e035` | item 10 / M3 | Mostly met. Rejected host transitions now return structured bodies with `code` and `currentStatus`; idempotent same-target operations return 200. This intentionally keeps invalid transitions as 409 despite ADR-0004's broad "no error" wording, so the convention is consistent but still a product-contract clarification. |
| 10 | `34b69a9` | L2 | Met. `vitest.config.ts` now sets `NODE_ENV=test`; direct targeted Vitest invocations passed without script-only env setup. |
| 11 | `bc0a346` | item 16 / L1-e2e | Met for admin smoke. The seeded non-empty admin list path passed locally. |
| 12 | `7846a4b` | item 12 / M5 | Met. RLS tests now use scoped participant tokens for own-row progress access, sibling denial, cross-session denial, and expiry denial. |
| 13 | `22f05bd` | item 14 / L1 | Met. The deprecated `src/middleware.ts` duplicate was removed, leaving the Next 16 proxy entrypoint. |

## Cross-Cutting Checks

- **ADR-0008 cache/privacy:** No newly reviewed API path exposes `correct_ids`, `explanation`, `map.target`, phone, full names, `joinFields`, or full session results in public-cacheable responses. Public counts stay private/no-store until reveal.
- **ADR-0007 sync/async visibility:** Public API helpers still allow `paused`; this is the main remaining visibility problem. Async RLS coverage improved materially.
- **ADR-0004/0009 transitions:** Host rejected-transition responses are now structured consistently. ADR-0009 host `scheduled -> ended` remains supported.
- **Hebrew/RTL:** New UI strings in the sessions screen are Hebrew and fit the existing RTL admin surface. No new LTR-isolation issue found in this phase.
- **Test coverage adequacy:** Unit coverage improved substantially around admin launch, type normalization, stored JSON validation, RLS, and public status filtering. Coverage gap remains for paused-public denial because the new test asserts the opposite behavior, and host-flow e2e currently fails at fixture setup.

## Test Plan Deltas

- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — passed at HEAD. Vitest: 31 files, 146 tests.
- `pnpm vitest run tests/unit/api/public-status-filter.test.ts tests/unit/api/admin-sessions-route.test.ts tests/unit/admin/sessions-screen.test.tsx` — passed, 9 tests.
- `pnpm vitest run tests/unit/api/admin-quiz-route.test.ts tests/unit/admin/quiz-save-payload.test.ts tests/unit/admin/normalize-question-type.test.ts tests/unit/lib/question-content.test.ts tests/unit/api/public-question-route.test.ts` — passed, 46 tests.
- `pnpm vitest run tests/unit/api/rls.test.ts tests/unit/auth/server-auth.test.ts tests/unit/auth/claims.test.ts tests/unit/api/host-next-route.test.ts` — passed, 12 tests.
- `PLAYWRIGHT_BASE_URL=http://localhost:3002 pnpm test:e2e -- tests/e2e/admin-smoke.spec.ts` — passed, 1 test.
- `PLAYWRIGHT_BASE_URL=http://localhost:3002 pnpm test:e2e -- tests/e2e/host-flow.spec.ts` — failed: `quizzes_brand_id_check` rejects `brand_id='bishvil-yehuda'`.
- `pnpm test:e2e -- tests/e2e/host-flow.spec.ts` without `PLAYWRIGHT_BASE_URL` could not start its own web server because another Next dev server for this repo was already running on port 3002.

## Closure Recommendation

Do not close Phase 1 yet. Run a small fix batch for H1 and M1/M2, then rerun the core CI gate plus both Playwright smoke specs. After that, Phase 1 can close if the public paused-session policy is either fixed or explicitly accepted in an ADR/product note.
