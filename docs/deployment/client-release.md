# Client release path

Verified on 2026-11-10. The client repository is
[bishvil/bishvil-yehuda-quiz](https://github.com/bishvil/bishvil-yehuda-quiz).
Its `main` commit is `24fc42d3e0b071c34d1e96a46c975e163a425b19`, an ancestor of
the tested feature branch. No client-only changes were found in that comparison.

## Two-repository ownership

The user requires the code to remain in both repositories. The connected app
account may change independently of the existing repositories and Git transport
credentials. Verify each remote separately. The local checkout has two named
remotes:

| Remote | Repository | Role |
| --- | --- | --- |
| `origin` | `NehoraiHadad/bishvil-yehuda-quiz` | Developer-owned development copy |
| `client` | `bishvil/bishvil-yehuda-quiz` | Client-owned code and deployment copy |

Push the same validated feature branch to each remote and verify both remote
heads. Keep production release control on the client's deployment branch, with
migrations completed before the application deployment. Successful delivery to
`origin` alone is not successful synchronization to both repositories.

```sh
git push origin feat/quiz-completion-gps-20261110
git push client feat/quiz-completion-gps-20261110
```

Both pushes succeeded after the GitHub connection was changed to `bishvil`.
The same branch is available in both repositories, with a draft PR in each:
[developer PR](https://github.com/NehoraiHadad/bishvil-yehuda-quiz/pull/1) and
[client PR](https://github.com/bishvil/bishvil-yehuda-quiz/pull/1). The client's
deployment settings and main branch have not been changed.

## Access and deployment evidence

- Initially, the connected GitHub identity was `NehoraiHadad`. The collaborator
  listing reported `pull: true` and `push: true`, but native Git push and the
  integration's branch creation both returned HTTP 403. Permission metadata did
  not establish effective integration access.
- After the user changed the GitHub connection, the verified app identity became
  `bishvil` (`bishvil.go@gmail.com`), with administrative access to the client
  repository. The connected app did not list the developer's private repository.
- Git transport was verified separately: the feature branch was pushed to the
  client repository, the developer remote still accepted pushes, and both remote
  branch heads matched. Changing the app connection did not remove the code
  already stored in either repository. This is verified Git access in this
  session, not a claim that the app supports two simultaneous account logins.
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
