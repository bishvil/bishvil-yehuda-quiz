# Question capability release verification — 2026-11-10

Implementation: [ADR-0014](../decisions/ADR-0014-question-capabilities.md).

## Automated results

- **376 tests passed, 65 test files**: complete Vitest unit/API/integration suite,
  against the local Supabase/Postgres instance.
- TypeScript `tsc --noEmit`: passed.
- ESLint: passed, no warnings.
- `next build`: passed; production bundle and route generation completed.
- `git diff --check`: passed.
- Five Chromium scenarios passed across these specs:
  - `question-capabilities.spec.ts`: content → untimed Hebrew open answer →
    out-of-radius GPS rejection → in-radius unlock → reload → results;
    returning to /play redirects to personal results. Mobile result checked.
  - Same spec: editor saves/reloads accepted answers, untimed mode, location
    gate and map presentation settings.
  - `map-label-levels.spec.ts`: real MapLibre renderer with a deterministic
    vector style; label detail changes, country labels hidden, satellite/street
    transitions restore backgrounds, repeated changes preserve original filters.
  - `admin-smoke.spec.ts`: create/edit/launch remains functional.
  - `host-flow.spec.ts`: start, answer, reveal, advance remains functional.
    Its obsolete anonymous-join fixture was updated to the current authenticated
    participant contract; it does not automate a real Google sign-in.

The new API tests also cover late versus slow correct answers, no duplicate
score on retries, original open-answer text, answer secrecy, denied scoring
before location unlock, low accuracy/stale readings, persistent timer start,
admin override authorization/audit actor, no scored rows for content stations,
concurrent bootstrap, and content-advance retry protection.

## Reproduction

Use the repository's configured Node/pnpm environment and a seeded local
Supabase stack. The commands used here bypassed the host pnpm wrapper, which
otherwise attempted to reinstall an already populated node_modules directory.

```sh
node --env-file=.env.local node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/next/dist/bin/next build
```

Playwright used the environment's `/usr/bin/chromium`, local Supabase, and a
Next dev server at `http://localhost:3100`. Its local config lives outside the
repository at `/workspace/quiz-local/playwright.config.ts` and selects that
installed browser. Standard project config remains suitable for a normal
Playwright browser installation.

## Deployment order and remaining release checks

The following migrations were applied successfully to **local Postgres only**:

1. `20261110090000_new_question_types.sql`
2. `20261110090100_question_capabilities.sql`
3. `20261110090200_unlock_station.sql`

The [UI follow-up](2026-11-10-ui-polish.md) adds
`20261110090300_atomic_question_reorder.sql` after these three migrations.
Run all four in that order before deploying the combined application code. The enum additions
must commit before the schema/RPC migration. The second migration repairs score
summaries from stored answers; it cannot restore answers that were never saved.
No production database or deployed site was changed in this task.

Before public release:

- Check GPS permissions, accuracy, device lock/unlock and return from navigation
  on physical Android and iPhone devices. Browser geolocation was simulated.
- Check actual Hebrew settlement coverage, fonts/RTL, zoom and mobile performance
  with the deployed map provider. Live tile/RTL service access was blocked by
  this environment's outbound policy (`ERR_TUNNEL_CONNECTION_FAILED`); deterministic
  style tests validate application filtering/switching, not live provider coverage.
- Verify a representative historic async game and the database summary repair
  on a production-like backup before the production migration.
