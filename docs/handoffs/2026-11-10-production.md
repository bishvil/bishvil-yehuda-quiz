# Production handoff — 2026-11-10

## Verified release state

The user reports that the code was merged and deployed to production and plans
to switch the connected GitHub app back to their developer account.

Independent GitHub checks confirmed:

- [Client PR #1](https://github.com/bishvil/bishvil-yehuda-quiz/pull/1) is merged.
- Client `main` is `f2e9c7920b5d6d90712ca3a86bf4695d4894cdbf`.
- Its source feature commit is `c57fc835b11a8f57f4b2ae75bd4ce09b735ecbd0`.
- The merge commit has a successful `Vercel` status:
  [deployment](https://vercel.com/beshvil-yehodas-projects/bishvil-yehuda-quiz/F9DdVa3dSUnk91FCuQToLTvwBWmA).
- The reported application URL is `https://bishvil-yehuda-quiz.vercel.app`.
  This environment could not directly inspect that deployed application.

The developer's `main` was last observed at
`24fc42d3e0b071c34d1e96a46c975e163a425b19`; the full feature branch was already
pushed to both repositories. Do not infer that both main branches were merged.
Fetch them again at the start of future work.

## Repository ownership and access

The user explicitly requires the code in **both** repositories:

| Remote | Repository |
| --- | --- |
| `origin` | `https://github.com/NehoraiHadad/bishvil-yehuda-quiz.git` |
| `client` | `https://github.com/bishvil/bishvil-yehuda-quiz.git` |

Feature branch: `feat/quiz-completion-gps-20261110`.
Developer PR: `https://github.com/NehoraiHadad/bishvil-yehuda-quiz/pull/1`.

The initial app connection was `NehoraiHadad`; client writes failed HTTP 403 even
though collaborator metadata claimed push permission. The user switched the app
connection to `bishvil`; client writes then succeeded. Native Git subsequently
pushed to both repositories and both feature branch heads matched. This verifies
Git transport access for that session, not two simultaneous app logins. The user
is now returning the app connection to their account. Check identity, installed
repository access and actual Git transport separately next time.

Do not request passwords or tokens in chat. Reuse an authorized working route
when available. Preserve both repositories and compare remote history before
pushing changes.

## Implemented scope

- Async completion/results and stored-answer summary correction.
- Correctness separated from timing; retry/duplicate-score protection.
- Untimed questions and host manual closing/reveal.
- Open answers with normalized matching and reveal-only accepted-answer feedback.
- Information-only stations without scoring or answer counters.
- Persistent GPS unlock for async stations; answer timer starts after unlock.
- Street/satellite maps and settlement labels: off plus three detail levels.
- Author/administrator, host and player usability fixes; local player preview,
  labeled touch controls, drawer/preview keyboard focus handling, GPS authoring,
  100-player host layout, clear report semantics and protected personal review.
- Safe reorder persistence and transactional, service-role-only reorder RPC.

## Database status — verify first next session

These four migrations are committed and were applied/tested **locally**:

1. `20261110090000_new_question_types.sql`
2. `20261110090100_question_capabilities.sql`
3. `20261110090200_unlock_station.sql`
4. `20261110090300_atomic_question_reorder.sql`

The user confirmed application-code deployment and merging. They did not
explicitly confirm database migration execution, and the assistant has not
inspected cloud migration history. First check the intended client's Supabase
project and migration history; do not blindly rerun SQL or assume Vercel ran it.
The enum migration must commit before the capability migration.

The tracked GitHub workflow runs CI using **local** Supabase. No cloud migration
runner was added or verified. Any automatic release should run validation, then
cloud migrations, then Vercel deployment, with independent Vercel auto-deploys
configured so they cannot race migrations.

The stored-answer repair cannot recover answers that were never stored. Check a
representative historic async game when validating the production migration.

## Validation and remaining checks

Completed before release: **456 tests in 83 files**, TypeScript, ESLint, formatting,
production build and five Chromium scenarios against the local production build.
Browser review inspected 36 screenshots at 390×844 and 1366×900; host controls
were verified with 12 and 100 players. Review privacy, early access, draft GPS
races and transactional reorder rollback/concurrency were covered.

Still not verified on the client's deployed system:

- Physical Android/iPhone GPS, permission recovery and return from navigation.
- Safari and live Google OAuth.
- Live Hebrew settlement coverage/RTL, provider access and map performance.
- Deployed async results and historical-data repair.
- Actual production schema/RPC/migration history.

See [capability QA](../qa/2026-11-10-question-capabilities.md),
[UI QA](../qa/2026-11-10-ui-polish.md), and
[release/access notes](../deployment/client-release.md).
Screenshot artifacts are workspace-local at
`/workspace/artifacts/quiz-ui-polish-2026-11-10/report.html`; future environments
may not retain them. Synthetic review fixtures and authentication states were
removed after QA. Never commit real credentials or browser storage states.
