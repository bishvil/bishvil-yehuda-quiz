# Dev Tooling Readiness — Bishvil Yehuda Quiz

> Wave 1, Subtask 1 deliverable. Target: **Dev** environment, not production hosting.
> Prepared on `instance-neo` (Ubuntu 22.04, Oracle Cloud). Last scanned: 2026-04-30.

This document is the contract the next agent (Project Bootstrap) follows. If a tool, MCP, or env-var assumption isn't here, the next agent should stop and update this doc rather than guess.

---

## 1. Tool / Version Inventory

All commands below were run on the project host. Versions are pinned for reproducibility — bootstrap should match or document upgrades.

| Tool | Version | Status | Notes |
|---|---|---|---|
| Node.js | `v22.20.0` | ✅ Ready | LTS line; satisfies Next.js 15+, Drizzle, Vitest, Playwright. |
| npm | `11.7.0` | ✅ Ready | Bundled with Node. Used only for `npx`/installer flows. |
| pnpm | `10.27.0` | ✅ Ready | **Primary package manager.** All install/run commands go through `pnpm`. |
| corepack | `0.34.0` | ✅ Ready | Available — bootstrap should pin pnpm via `packageManager` in `package.json`. |
| git | `2.34.1` | ✅ Ready | |
| GitHub CLI (`gh`) | `2.88.1` | ✅ Authed | Active account `NehoraiHadad`, scopes `gist, read:org, repo, workflow`, HTTPS. |
| Vercel CLI | `51.6.1` | ✅ Authed | Logged in as `nehoraihadad`. No project link yet (`.vercel/` absent). |
| Docker | `28.4.0` | ✅ Ready (daemon active) | Available for `supabase start` if local stack is needed. |
| psql | `14.22` | ✅ Ready | Useful for direct DB inspection / fallback when a SQL MCP isn't reachable. |
| Supabase CLI | — | ❌ **Missing** | Install strategy below. |
| Playwright browsers | — | ⏳ Project-local | Installed during bootstrap via `pnpm dlx playwright install`. |
| Drizzle Kit | — | ⏳ Project-local | Installed during bootstrap as a dev dependency. |
| TypeScript (`tsc`) | — | ⏳ Project-local | Installed via `typescript` dev dep in bootstrap. |

### 1.1 Missing tool: Supabase CLI — install strategy

Supabase's official guidance ([docs](https://supabase.com/docs/guides/local-development/cli/getting-started.md)) is explicit:

> "Installing the Supabase CLI globally using `npm install -g supabase` is **not supported**."

Supported methods on Linux/Ubuntu:

| Method | Command | When to use |
|---|---|---|
| **Dev dependency (recommended for this project)** | `pnpm add -D supabase` (added during bootstrap) → run via `pnpm supabase ...` | Default. Pins version in `package.json`, available to every contributor with `pnpm install`, no global state. |
| One-off via npx | `pnpm dlx supabase <cmd>` (or `npx supabase <cmd>`) | For ad-hoc commands before bootstrap is finished. |
| `.deb` package | Download from [`supabase/cli` releases](https://github.com/supabase/cli/releases), `sudo dpkg -i`. | Only if a single shared system binary is wanted across all repos on this host. Requires sudo — **ask first**. |

**Decision for this project:** install Supabase CLI as a **project dev dependency** during bootstrap. Do not install globally. Bootstrap should add an `engines.supabase` note in `docs/dev-tooling.md` if a specific minimum version becomes important (e.g. `2.79.0+` for `supabase db query`, `2.81.3+` for `supabase db advisors`).

---

## 2. MCP and Skills Readiness

### 2.1 MCP vs Skill vs CLI — when to use which

These three layers solve different problems. Picking the wrong one wastes context or blocks work.

| Layer | What it is | When to prefer |
|---|---|---|
| **Skill** | Markdown playbook auto-loaded into context based on triggers. Read-only — provides expertise, not actions. | Whenever guidance, conventions, or "what's the correct pattern" is the question. Free of runtime cost. |
| **MCP server** | Active integration that exposes tools to perform external actions (run SQL, deploy, query an API). | When the agent must read/write live state on an external system, and a CLI alternative is awkward, slow, or missing. |
| **CLI via Bash** | Direct shell commands. | When a CLI exists, is authenticated, and the action is scriptable. Cheapest in tokens; most reproducible in CI. |

**Project rule of thumb:** prefer **Skill + CLI** by default. Add an MCP only when it removes friction the CLI can't (e.g. structured `execute_sql`, OAuth-gated actions, real-time inspection).

### 2.2 MCP servers — live status this session

Source: `claude mcp list` plus session-loaded tool list.

| Server | Status | Purpose | Action |
|---|---|---|---|
| `agendo` | ✅ Connected | Task/project orchestration. | Required — already in use. |
| `plugin:context7:context7` | ✅ Connected | Live docs lookup for libraries (Next.js, Supabase, Drizzle, Tailwind, Playwright, etc.). | **Use this before guessing any API surface.** Free and authoritative. |
| `stitch` | ✅ Connected | Google's design tool. Not relevant for this stack — ignore. | Ignore. |
| `plugin:vercel:vercel` | ⚠️ Needs auth (OAuth) | Vercel MCP — deeper integration than CLI for project / env / deployment ops. | **Defer.** Vercel CLI is already authed and covers everything Project Bootstrap needs. Enable later only if a CLI gap appears. |
| `supabase@claude-plugins-official` | ⚠️ **Disabled** in `~/.claude/settings.json` | Supabase MCP — exposes `execute_sql`, `apply_migration`, `get_advisors`, `search_docs`, etc. against a live project. | **Enable when a Supabase project ref exists.** Until then there's nothing to point it at. The companion `supabase` skill is also gated behind the same plugin flag — enabling the plugin enables both. |
| `github@claude-plugins-official` | ⚠️ Disabled | GitHub API tool surface. | **Skip.** `gh` CLI + `gh api` cover PRs, issues, releases, runs, workflow inspection. Add the MCP only if a future task needs structured GraphQL-ish access agents can't easily script. |
| `claude.ai Google Calendar/Gmail/Drive` | ⚠️ Needs auth | Personal productivity MCPs. | Not relevant to this project. |
| `claude.ai Canva` | ⚠️ Needs auth | Design. | Not relevant — design system already exists locally under `_design-system/`. |

**Net for Project Bootstrap:** the only MCPs that *need* to be active are `agendo` (already on) and `context7` (already on). Supabase MCP can be flipped on later in the same wave once we know the project ref.

### 2.3 Skills — what's loaded and what each one covers

Skills auto-trigger on the matching prompt. They're "free" — no setup needed. The relevant ones for this project:

| Skill | Loaded? | Use it for |
|---|---|---|
| `frontend-design:frontend-design` | ✅ | Distinctive UI design beyond generic AI aesthetics. Will be used in the design intake / UI subtasks. |
| `nextjs-testing-expert` | ✅ | Vitest + RTL + Playwright + MSW patterns for Next.js 15/16. **Primary reference for Project Bootstrap testing setup.** |
| `vercel:nextjs` | ✅ | App Router, Server Components, Server Actions, caching, middleware. |
| `vercel:vercel-cli` | ✅ | `vercel link`, env management, deploy commands. |
| `vercel:deployments-cicd` | ✅ | Preview vs production deploys, `--prebuilt`, rollback. |
| `vercel:env-vars` | ✅ | `vercel env pull`, OIDC tokens, environment-scoped vars. |
| `vercel:next-cache-components` | ✅ | `use cache`, `cacheLife`, `cacheTag`, PPR — relevant for the public-cacheable endpoints in ADR-0008. |
| `vercel:routing-middleware` | ✅ | Middleware patterns for participant vs host route separation. |
| `vercel:shadcn` | ✅ | shadcn/ui composition with our existing tokens (`_design-system/.../styles/tokens.css`). |
| `vercel:turbopack` | ✅ | Next.js bundler config / HMR behavior. |
| `vercel:react-best-practices` | ✅ | Auto-runs after multi-file TSX edits. |
| `vercel:vercel-functions` | ✅ | Serverless / Edge / Fluid Compute / Cron. Relevant to ADR-0005 question lifecycle. |
| `vercel:runtime-cache` | ✅ | Tag-based invalidation — relevant if we cache public quiz state. |
| `code-quality-enforcer` | ✅ | Pre-commit lint/typecheck/test gating. |
| `ci-deployment-check` | ✅ | Diagnose red CI / failed Vercel deploys. |
| `agent-browser` | ✅ | Agent-driven browser sessions (see §2.5). |
| `architect-mind` | ✅ | Pre-implementation thinking gate — explore-first, get critique before code. |
| `brainstorm` + role skills | ✅ | Multi-model architecture brainstorm before non-trivial implementation. |
| `code-review:code-review` | ✅ | PR review. |
| `pr` / `review-pr` / `amend` / `init` | ✅ | Git/PR operations. |
| `gemini-cli` | ✅ | Second-opinion code review. |
| `agendo:agendo` + `agendo-artifact-design` | ✅ | This task system. |
| `token-optimizer:*` | ✅ | Context-window hygiene. |
| `n8n-expert` | ✅ | Not relevant unless we wire workflow automation. |

**Not loaded (gated behind disabled plugins):**

- `supabase:supabase` — bundled inside `supabase@claude-plugins-official` (disabled). Enable that plugin to gain both the skill (DB/auth/RLS guidance) and the MCP server. The skill itself contains a security checklist that we **must** consult before writing schema in Wave 2.
- `figma:*` — disabled. We have local design assets, no Figma source needed right now.
- `serena` — disabled. Code-search alternative; not needed.
- `github:*` — disabled. `gh` CLI covers our needs.

### 2.4 CLI fallbacks for missing/disabled MCPs

| Missing/disabled MCP | Fallback that fully covers Project Bootstrap |
|---|---|
| Supabase MCP | `pnpm supabase ...` (after install), `psql` for direct DB checks. The `supabase` skill is the doc layer; CLI is the action layer. |
| Vercel MCP | `vercel` CLI (already authed). |
| GitHub MCP | `gh` CLI + `gh api`. |

### 2.5 agent-browser: relationship to Playwright

The `agent-browser` skill is itself a Playwright-backed CLI (it embeds Playwright internally and exposes `agent-browser open / snapshot / click / fill / screenshot / diff` for agents). It is not a project test framework: no test runner, no fixtures, no parallel workers, no JUnit reporter.

**Project decision:**

| Use case | Tool | Why |
|---|---|---|
| Project-owned, version-controlled e2e tests in `tests/e2e/`, run by CI on every push | **Playwright (project dep)** | Bootstrap subtask explicitly requires Playwright config + one smoke test. Tests-as-code are reviewable, deterministic, and CI-friendly. |
| Agent-driven manual QA during dev (open localhost, snapshot, screenshot, visual diff, prototype walkthrough, design-system spot-check, login flow rehearsal) | **`agent-browser` skill** | Already installed, no project deps to add, ideal for one-off agent interaction with the running dev server. |

This means **bootstrap still installs `@playwright/test` and writes one smoke test**, but Playwright browser binaries (~600 MB) only need to be installed where the suite actually runs (CI runner + local devs who want to run e2e). For agent-driven exploration, `agent-browser` is the daily driver.

---

## 3. Required Authentication / Login Steps (no secrets in this doc)

| Service | How to verify auth | If not authed | Where the secret lives |
|---|---|---|---|
| GitHub (`gh`) | `gh auth status` — already shows ✓. | `gh auth login --web --scopes repo,workflow,read:org`. | `~/.config/gh/hosts.yml` (host-managed). Never committed. |
| Vercel CLI | `vercel whoami` — already shows `nehoraihadad`. | `vercel login` (email link). | `~/.local/share/com.vercel.cli/auth.json`. Never committed. |
| Supabase CLI | After install, `pnpm supabase login` (browser flow). | `pnpm supabase login` then paste access token from dashboard. | `~/.supabase/access-token`. Never committed. |
| Supabase MCP (when enabled) | Will trigger an OAuth 2.1 browser flow on first use. | Re-run the MCP from the agent — Claude will surface the URL. | Token stored by MCP runtime, not in repo. |
| Vercel MCP (deferred) | Same OAuth flow. | Defer until needed. | Same. |
| Supabase project (anon / service_role / DB URL) | Will exist once a project is created — see §4. | Bootstrap subtask owner creates the project, copies env vars to `.env.local` (never `.env.example`). | Vercel Project env (Production/Preview/Development) + local `.env.local`. |

**Hard rules:**

- `.env`, `.env.*` (except `.env.example`) and `firebase-service-account.json` are denied at the agent permission layer (`~/.claude/settings.json`) and ignored by `.gitignore` — keep it that way.
- The `service_role` key never appears in any `NEXT_PUBLIC_*` variable, never in client code, never in this repo.
- No secret value is ever pasted into a progress note, ADR, or commit message.

---

## 4. Recommended Dev Environment Policy

### 4.1 Supabase — local vs remote dev

**Default: local Supabase via `pnpm supabase start` (Docker).**

- Use the local stack for day-to-day Wave 2 development until the client-owned Supabase Cloud project exists.
- Schema lives in `supabase/migrations/` and is the source of truth for both local and cloud. Apply locally from scratch with `pnpm supabase db reset --local`.
- Local ports: API `54321`, Postgres `54322`, Studio `54323`, Mailpit `54324`.
- Local database URL: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
- Pros: real Postgres, real Auth helpers, real RLS, real Realtime, no dependency on a client account.
- Cons: requires Docker and first start pulls the Supabase service images.

**Deferred: linked Supabase Cloud dev project.**

- When the client account exists, link it with `pnpm supabase link --project-ref <ref>`.
- Push the same migration history with `pnpm supabase db push --linked`.
- Replace local `.env.local` values with the cloud project values. Do not put cloud secrets in `.env.example`.

### 4.2 Local dev vs Vercel preview

| Workflow | Trigger | Purpose |
|---|---|---|
| `pnpm dev` (Next.js dev server, localhost:3000) | Manual | Day-to-day feature work, hot reload. |
| `vercel dev` | Manual | Replicate Vercel runtime locally — Edge functions, middleware, env resolution. Use only when CLI dev diverges. |
| Vercel preview deploy (branch) | `git push` to a non-main branch (after `vercel link`) | Stakeholder review, agent-browser visual diffs, end-to-end smoke against real Supabase dev. |
| Vercel production | Merge to `main` (manual promotion via CLI until pipeline matures) | Out of scope for Wave 1. |

**Branching:** trunk-based. `main` is always deployable. Feature branches → PR → preview deploy → merge.

### 4.3 Environment variable naming convention

| Prefix | Visibility | Example | Rule |
|---|---|---|---|
| `NEXT_PUBLIC_*` | Browser + server | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL` | Anything `NEXT_PUBLIC_` is sent to the client — **never** put a secret here. |
| `SUPABASE_*` | Server only | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN` (CI only) | Service-role and project-ref are server-only. |
| `DATABASE_URL`, `DIRECT_URL` | Server only | Pooled (`pgbouncer`, port 6543) and direct (port 5432) Postgres connection strings, used by Drizzle. | Both required — Drizzle migrations need direct, runtime queries use pooled. |
| `APP_*` | Server only | `APP_BASE_URL`, `APP_ENV` (`dev` / `preview` / `production`), `APP_LOG_LEVEL` | Project-internal config. |
| `CRON_SECRET` | Server only | Shared secret Vercel Cron passes in `Authorization`. | Required for the question-lifecycle / lazy-expiry routes (ADR-0005). |
| `VERCEL_*` | Auto-injected by Vercel | `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_GIT_COMMIT_SHA` | Don't define manually. |

### 4.4 Secret handling policy

- **Local dev:** `.env.local` (git-ignored). Never `.env`, never `.env.development`.
- **Vercel:** set per-environment via `vercel env add <NAME> <production|preview|development>`. Pull with `vercel env pull .env.local` to refresh.
- **CI (GitHub Actions):** repository or environment secrets. Never inline values in workflow YAML.
- **Service-role keys:** only on server runtimes (route handlers, server actions, cron). Never imported into client components.
- **Rotation:** when a secret leaks, rotate at the source first (Supabase dashboard / Vercel dashboard), then `vercel env pull` and update local `.env.local`. Document the rotation in a progress note, never the value.
- **Logs:** redact secrets before writing to `logs/`. The default `logs/*.log` glob in `.gitignore` covers accidental commits but isn't a substitute for not logging the value in the first place.

### 4.5 `.env.example` contract (for Project Bootstrap to create)

`.env.example` is committed with the fixed local Supabase defaults so a new local stack can run without cloud credentials. Cloud project values still belong only in `.env.local` or Vercel environment variables.

```
# === Public (browser-exposed) ===
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key from pnpm supabase status -o env>
NEXT_PUBLIC_APP_URL=http://localhost:3000

# === Server-only ===
SUPABASE_SERVICE_ROLE_KEY=<local service role key from pnpm supabase status -o env>
SUPABASE_PROJECT_REF=local

# Drizzle / Postgres
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# App
APP_ENV=dev
APP_LOG_LEVEL=info

# Cron / scheduled work (filled in once cron routes are added)
CRON_SECRET=
```

Rules for the file:

- Every variable referenced in code or `next.config.*` must appear here.
- Comment groups by visibility (public vs server) so reviewers can spot a mis-prefixed leak instantly.
- Only local Supabase defaults may have concrete values in `.env.example`; cloud secrets must stay out of the repo.
- Update this file in the same PR as any new env-dependent code. CI should fail if a referenced var is missing from `.env.example` (lint rule to add later).

---

## 5. Next Steps for `Project Bootstrap` (Subtask 2)

The next agent should do, in this order:

1. **Read this doc end-to-end before touching `package.json`.**
2. **Pin pnpm** in `package.json` via `packageManager: "pnpm@10.27.0"`. Match Node 22 in `engines`.
3. **Initialise Next.js (App Router) + React + TypeScript strict** with the file list in the Project Bootstrap task description. Use Tailwind 4. **This doc is the contract for *decisions* (which tools, which env vars, which policy) — not for API surfaces.** Always verify framework syntax (Tailwind 4 imports, Next.js 15/16 config keys, Drizzle schema helpers, etc.) against current docs via `context7` MCP. If docs disagree with anything written here at the syntax level, the docs win — patch this file.
4. **Add Supabase CLI as a dev dependency:** `pnpm add -D supabase`. Do **not** install globally. Add `pnpm supabase` to project scripts (e.g. `"db:push": "supabase db push --linked"`).
5. **Add Drizzle Kit + driver:** `pnpm add drizzle-orm postgres` and `pnpm add -D drizzle-kit`. Defer schema authoring — that's Wave 2.
6. **Testing:** Vitest + RTL + Playwright per `nextjs-testing-expert` skill. Add only one smoke unit test and one Playwright e2e that hits `/`. Do not install Playwright browsers in the CI runner image until the smoke is proven locally; document the deferred install as a follow-up in the bootstrap progress notes if needed.
7. **CI baseline:** `.github/workflows/ci.yml` runs `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`. Playwright in CI is "best effort" per the bootstrap task — if browser install times out, document and defer.
8. **`.env.example`:** create per §4.5. No secrets. Add a comment header pointing to this doc.
9. **No git remote yet** — the host has no `origin`. Do not create a GitHub repo automatically; the user should approve the org/visibility first. Bootstrap may stage a follow-up task for "Create GitHub repo and push baseline" rather than acting silently.
10. **No `vercel link` yet** — same reasoning. Stage a follow-up task once a GitHub repo exists.
11. **Run baseline checks** and only mark Project Bootstrap done when `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all pass locally.

---

## 6. Follow-up Tasks Decision

Per the task's "Done criteria", I have to either create follow-up tasks or document why none are needed.

### 6.1 Follow-ups recommended (to be created)

The following items are **out of scope** for this subtask but **in scope** for Wave 1 — they are already covered by the existing Wave 1 subtasks (Project Bootstrap and Design Intake), so no *new* tasks are required. Specifically:

- ✅ Supabase CLI install → handled inside Project Bootstrap (`pnpm add -D supabase`).
- ✅ Playwright + Vitest setup → handled inside Project Bootstrap.
- ✅ Drizzle Kit install → handled inside Project Bootstrap.
- ✅ `.env.example` creation → handled inside Project Bootstrap per §4.5.
- ✅ CI workflow → handled inside Project Bootstrap.

### 6.2 Items deferred beyond Wave 1 — no task created yet, but flagged here

These should become tasks at the start of Wave 2 (or as Wave 1 cleanup) once the user confirms direction. None of them block Project Bootstrap.

| Item | Why deferred | Trigger to create the task |
|---|---|---|
| Create GitHub repo + push baseline + protect `main` | Needs user input on org/visibility. | Once user says "push it to NehoraiHadad/bishvil-yehuda-quiz" or similar. |
| `vercel link` + create Vercel project + set env vars | Needs the GitHub repo first (Vercel auto-imports from GitHub). | Right after the GitHub repo exists. |
| Create Supabase dev project + capture project ref | Needs user input on Supabase org. | Before any schema work in Wave 2. |
| Enable `supabase@claude-plugins-official` plugin in `~/.claude/settings.json` | Currently disabled. Worth enabling once a Supabase project ref exists, so the next agent gets both the skill and the MCP. **Requires editing user-global settings — ask before flipping the flag.** | When the Supabase dev project is created. |
| Enable Vercel MCP OAuth (optional) | Vercel CLI is sufficient today. | Only if a CLI gap shows up. |
| Re-evaluate `github@claude-plugins-official` | `gh` covers our needs. | Only if a future task needs structured GitHub MCP. |

### 6.3 Items that need explicit user decision (NOT auto-creating)

- **Should `~/.claude/settings.json` be edited at the agent layer?** Enabling/disabling plugins there affects every Claude session on this host, not just this project. Default: don't touch user-global settings from inside the project — propose the change in a progress note and let the user flip the flag.
- **Supabase install method.** This doc commits to "dev dependency". If the user prefers the system-wide `.deb`, they should override here, since it requires `sudo`.

---

## Appendix A — Quick reference cheatsheet

```bash
# Daily dev
pnpm dev                          # localhost:3000
pnpm typecheck && pnpm lint
pnpm test                         # Vitest
pnpm test:e2e                     # Playwright (after browsers installed)

# Supabase (after bootstrap installs it as dev dep)
pnpm supabase login
pnpm supabase link --project-ref <ref>
pnpm supabase db pull <name> --local --yes
pnpm supabase db push --linked
pnpm supabase migration list --local

# Vercel
vercel link
vercel env pull .env.local
vercel --prod=false                # preview deploy
vercel deploy --prebuilt           # advanced

# GitHub
gh auth status
gh repo create <name> --source . --private --remote=origin --push  # only after user approval
gh pr create --fill
gh run watch

# Agent-driven browser checks (skill, not project dep)
agent-browser open http://localhost:3000
agent-browser snapshot -i
agent-browser screenshot --full ./tmp/home.png
```

## Appendix B — Sources

- Supabase CLI install (official): <https://supabase.com/docs/guides/local-development/cli/getting-started.md>
- Supabase MCP (official): <https://supabase.com/docs/guides/getting-started/mcp>
- `agent-browser` skill: `~/.claude/skills/agent-browser/SKILL.md`
- `supabase` skill: `~/.claude/plugins/cache/claude-plugins-official/supabase/0.1.6/skills/supabase/SKILL.md`
- This host's enabled plugins: `~/.claude/settings.json`
- Live MCP roster: `claude mcp list`
