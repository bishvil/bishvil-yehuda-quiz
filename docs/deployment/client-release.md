# Client release path

Verified on 2026-11-10. The client repository is
[bishvil/bishvil-yehuda-quiz](https://github.com/bishvil/bishvil-yehuda-quiz).
Its `main` commit is `24fc42d3e0b071c34d1e96a46c975e163a425b19`, an ancestor of
the tested feature branch. No client-only changes were found in that comparison.

## Access and deployment evidence

- The connected GitHub identity is `NehoraiHadad`. The collaborator listing
  reports `pull: true` and `push: true` for the client repository.
- Effective write access is blocked: a native Git push returned HTTP 403, and
  the connected GitHub integration's branch creation returned HTTP 403,
  `Resource not accessible by integration`. Neither attempt created a branch or
  changed client `main`. Repository permission metadata alone is insufficient.
- The client owner must authorize the ChatGPT/Codex GitHub connection for this
  repository. This may require signing in as the client owner `bishvil` and
  installing/authorizing the GitHub app for this repository. Do not paste account
  passwords or tokens into chat.
- The repository homepage is `https://bishvil-yehuda-quiz.vercel.app`. Client
  `main` has a successful `Vercel` deployment status linking to the
  `beshvil-yehodas-projects/bishvil-yehuda-quiz` Vercel project. This is evidence of
  an existing deployment, not verification of current Vercel account access.
- The client repository contains only `.github/workflows/ci.yml`; it starts a
  **local** Supabase instance for tests. It does not deploy cloud migrations.
  No cloud Supabase project ref or production deployment workflow was found in
  tracked configuration. External Supabase GitHub integration settings could
  not be inspected through the current GitHub connection.

## Migration source and release order

The feature branch contains four ordered SQL migrations under
`supabase/migrations/`:

1. `20261110090000_new_question_types.sql`
2. `20261110090100_question_capabilities.sql`
3. `20261110090200_unlock_station.sql`
4. `20261110090300_atomic_question_reorder.sql`

They were applied and tested on local Postgres. They have not been applied to
client production. The enum migration must commit before the capability
migration. See [release verification](../qa/2026-11-10-question-capabilities.md)
and [UI verification](../qa/2026-11-10-ui-polish.md).

A GitHub push that triggers Vercel does **not** itself apply Supabase SQL.
For an automated release, configure an explicit migration runner or verify an
existing Supabase GitHub migration integration. The intended sequence is:

1. Run CI on the exact release commit.
2. Identify and verify the client's Supabase project and migration history;
   review a CLI migration dry run against that project.
3. Apply the outstanding migrations using the Supabase CLI.
4. Trigger the Vercel production deployment only after migration success.
5. Verify the deployed host/player/results flows and real-device GPS/maps.

If using GitHub Actions, the client owner can provide the following through
GitHub settings without connecting their Supabase account to this chat:

| Setting | Purpose |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` secret | Client-authorized Supabase CLI API access |
| `SUPABASE_DB_PASSWORD` secret | Password of the intended project's database |
| `SUPABASE_PROJECT_REF` variable | Explicit cloud project identity |
| Vercel deploy hook secret or authorized CLI credentials | Deploy after migration success |

Before enabling this sequence, configure Vercel so its independent automatic
production deployment cannot race ahead of migrations. Secrets alone do not
create a workflow. No release automation or production settings were changed
as part of this access investigation.
