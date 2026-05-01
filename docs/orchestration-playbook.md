# Orchestration Playbook — Bishvil Yehuda Quiz

This document is the operating manual for any new coordinator session that takes over from a previous orchestrator. **Read this first before doing anything else.**

## 1. Your role

You are a **coordinator session**, not an implementer. You orchestrate sub-agents (Sonnet via `claude-code-1`, Codex via `codex-cli-1`) through the agendo task system. You make decisions, review summaries, and route work — you do not write production code yourself unless the task is explicitly hands-on.

## 2. Project at a glance

- **Stack:** Next.js 16.2 App Router · React 19.2 · TypeScript 5.7 strict · Tailwind 4.2 (`@theme` token bridge) · Supabase (local Docker stack on `54321/54323/54324`) · Drizzle ORM · Vitest 3 + Playwright 1.59 · pnpm 10.27.0
- **Audience:** Hebrew/RTL field-event quiz platform (`lang="he" dir="rtl"`)
- **Working dir:** `/home/ubuntu/projects/bishvil-yehuda-quiz`
- **Repo state:** local git, `main` branch only. No GitHub remote yet (waiting on client account). No Vercel deploy yet (same).
- **Supabase:** local-first dev. Migrations in `supabase/migrations/` push to client cloud later via `supabase db push --linked`.

## 3. What's done (Wave 1 + Wave 2)

- **Wave 1:** Dev tooling, bootstrap, design intake, ADR-0004 through ADR-0008
- **Wave 2:** DB schema · Auth · 20+ API routes · `submit_answer` Postgres RPC · Participant UI · Host UI · Admin UI · ADR-0009 (host pre-start cancellation)
- **Tests:** 83 unit + 4 e2e, all CI gates green
- **Reviews:** 3 completed (`docs/reviews/`) — final verdict `accept-with-followups`
- **Closed agendo tasks:** Wave 1 parent `43d1ee77`, Wave 2 parent `799dacb2`

## 4. Mandatory reading before any decision

| Path | Why |
|---|---|
| `docs/decisions/README.md` | ADR index + numbering rules |
| `docs/decisions/ADR-0004-state-machine.md` (super-ed by 0009 for host cancel) | Session/participant state |
| `docs/decisions/ADR-0005-question-lifecycle.md` | Server timestamps, lazy expiry |
| `docs/decisions/ADR-0006-answer-policy.md` | First-submit-wins, scoring, reveal authority §8 |
| `docs/decisions/ADR-0007-sync-async-model.md` | Sync vs async progression |
| `docs/decisions/ADR-0008-cache-privacy.md` | **Forbidden fields** in public payloads |
| `docs/decisions/ADR-0009-host-pre-start-cancellation.md` | Host can cancel `scheduled` |
| `docs/dev-tooling.md` | Tool inventory, env policy, MCP status |
| `docs/design-intake.md` | Tailwind 4 token bridge, font wiring |
| `docs/reviews/2026-04-30-wave2-final-review.md` | **Wave 3 punch list (16 items)** |
| `docs/reviews/2026-04-30-wave2-backend-review.md` | Original backend findings + re-eval table in final review |
| `docs/reviews/2026-04-30-wave2-ui-review.md` | UI findings (closed by fix-batch) |

## 5. Working method (this is how the previous coordinator worked — keep it)

### 5.1 Coordinator pattern
- **Don't implement.** Spawn sub-agents per task via `mcp__agendo__start_agent_session`.
- Parent tasks coordinate; subtasks execute. Use `mcp__agendo__create_subtask` for new work.
- Mark parent + subtask `in_progress` when starting. Mark `done` only when verified.

### 5.2 Multi-agent split
- **Sonnet (`claude-code-1`)** — UI work, broad refactors, anything where design judgment matters. Larger context, better at component patterns.
- **Codex (`codex-cli-1`)** — Backend, reviews, fix-batches, anything systematic and rule-driven. Burns subscription tokens fast — alternate with Sonnet to avoid limit hits.
- **One agent per file scope.** Never two agents writing the same file. If parallel work is needed, split by directory (e.g., Codex on `app/api/`, Sonnet on `src/components/`).
- If both must touch the same file, run sequentially.

### 5.3 Communication contract (mandatory in every spawn)
Every spawn prompt must require **progress notes** at:
1. **Start** — confirmed scope, ordered plan, ambiguities flagged
2. **Mid** — first major slice complete + locally verified
3. **End** — commit list, test counts, CI status, deferrals, coordinator action items

**You read progress notes only**, not full agent output. This protects your context. Investigate further only on flagged problems.

If an agent gets stuck, tell them to post a `BLOCKED` note, not silently revert other work.

### 5.4 Autonomous polling
- Use `ScheduleWakeup` for hands-off coordination. The user's pattern was: "check every few seconds" → use 270s for active work (stays in prompt-cache TTL window) or 1200-1800s for long agent runs.
- Always pass back a self-contained prompt that re-states the next-step decision tree.

### 5.5 Code review checkpoints
- **After each major implementation slice** — spawn Codex on a review-only task. Deliverable: `docs/reviews/YYYY-MM-DD-<scope>-review.md`.
- Review format (match existing reviews):
  - Verdict: `accept` / `accept-with-followups` / `needs-rework`
  - Findings by severity: CRITICAL → HIGH → MEDIUM → LOW
  - Each finding: `[ID]` + title + `file:line` + problem + fix
  - Test plan deltas
  - All focus areas explicitly addressed (even "no findings")
- After review → fix-batch if findings → re-verify → close.

### 5.6 Commit hygiene
- **Conventional commits**, one logical unit per commit
- CI gate before EACH commit: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
- Reference review finding IDs in commit messages (`[H1]`, `[M2]`)
- Co-author footer for AI-driven commits

### 5.7 Product decisions
- ADRs are immutable once accepted. To change: write a superseder + cross-link.
- For product calls (like ADR-0009 host pre-start cancellation), **stop and ask the user** — don't decide architecture-changing behavior alone. Explain the tradeoff in 2-3 sentences and propose a default.

## 6. Wave 3 punch list (filed in `docs/reviews/2026-04-30-wave2-final-review.md` §"Wave 3 Punch List")

**Admin polish (post-review fixes):**
1. Auto-save brandId fix + nullable logo clearing (M1)
2. Non-empty quiz launch enforcement (M2 — UI + API)
3. Question type-switch payload normalization (M3)
4. Admin e2e fixture stability (L1)
5. Vitest setup for React 19/RTL v16 — move `NODE_ENV=test` from package scripts into `vitest.config.ts` (L2)

**Product features:**
6. File upload pipeline (logos, image questions, map backgrounds)
7. True drag-and-drop reorder (touch + keyboard)
8. Streamed CSV results export
9. Per-question live preview in editor

**Backend hardening (re-eval'd from backend review):**
10. Timing-safe `CRON_SECRET` compare (M1)
11. Public route status filtering — drafts/paused (M2)
12. Rejected-transition response semantics (M3)
13. DB CHECK constraints — brand, PIN format, timer/points/tolerance (M4)
14. Scoped participant JWT RLS test (M5)
15. Stored JSON validation before serialization/scoring (M6)
16. Cleanup: `proxy.ts` + `middleware.ts` dedup (L1) · rename `decodeParticipantAccessToken` (L3)

**Plus deferred infra:**
- Cloud Supabase project link + `supabase db push --linked`
- GitHub remote + `vercel link`
- `vercel.ts` cron schedule wiring (`/api/cron/expire-questions` every minute)
- `'use cache'` adoption / performance pass
- Mobile Playwright project (currently Desktop Chrome only)
- Multi-station integration tests
- Real device QA on Hebrew/RTL

## 7. Wave 3 planning suggestions

The 16-item punch list groups naturally into 4 parallelizable subtasks:

| Subtask | Items | Agent fit |
|---|---|---|
| A. Admin polish + correctness | 1, 2, 3 | Sonnet (UI patterns) |
| B. Test infra | 4, 5 | Either |
| C. Backend hardening | 10, 11, 12, 13, 14, 15, 16 | Codex (systematic) |
| D. Upload pipeline + DnD | 6, 7 | Sonnet (complex UI) |
| E. Reporting (CSV + preview) | 8, 9 | Sonnet |
| F. Deploy infra (when accounts exist) | cloud Supabase, GitHub, Vercel, cron | Hybrid + user decisions |

A + C can run in parallel (different file scopes). B is small, can be tucked into either. D, E, F should be sequential after A/C.

## 8. Tooling primer

### agendo MCP
- `mcp__agendo__list_tasks` — find work
- `mcp__agendo__get_task` — task details
- `mcp__agendo__create_subtask` / `update_task` — create/update
- `mcp__agendo__start_agent_session` — spawn an agent (returns sessionId)
- `mcp__agendo__add_progress_note` — coordinator-side annotations
- `mcp__agendo__get_progress_notes` — read agent updates (preferred over reading full output)

### Sub-agents available in coordinator session
- `Explore` — read-only codebase queries
- `Plan` — design implementation plans
- `feature-dev:code-architect` / `code-explorer` / `code-reviewer`
- `senior-frontend-dev` — UI deep work
- `db-architect` / `system-architect` / `security-reviewer`
- `test-author` — Vitest + Playwright

### Skills
- `/frontend-design:frontend-design` — visual design judgment
- `/codex:codex-rescue` — second opinion / unstuck
- `/brainstorm` — multi-model convergence
- `/ultrareview` — multi-agent cloud review (USER-triggered, billed; you cannot launch)

## 9. Current local state (as of 2026-05-01)

- **Git:** `main` branch, clean, ~30 Wave 2 commits ahead of nothing (no remote)
- **Supabase local:** running on 54321 (API) / 54323 (Studio) / 54324 (Mailpit)
- **PM2:** **no entry for this project yet** — dev server not running. To view in browser, see §10.
- **Free ports:** 3002, 3003, 3004 are free (3000 = story-creator, 3001 = nehroai-portfolio)
- **Test status:** 83 unit + 4 e2e, all green per the final review's local verification

## 10. Running the dev server (Tailscale-accessible)

Per `~/.claude/CLAUDE.md`: never start `pnpm dev` manually — use PM2.

To add a PM2 entry, edit `/home/ubuntu/projects/ecosystem.config.js` and append:

```js
{
  name: 'bishvil-yehuda',
  cwd: '/home/ubuntu/projects/bishvil-yehuda-quiz',
  script: '/home/ubuntu/.local/share/pnpm/.tools/pnpm-exe/10.27.0/pnpm',
  args: 'dev --turbopack --port 3002',
  interpreter: 'none',
  max_memory_restart: '2G',
  env: {
    NODE_OPTIONS: '--max-old-space-size=1536',
    PORT: '3002',
    NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: '<from supabase status>',
    NEXT_PUBLIC_APP_URL: 'http://instance-neo:3002',
  },
  watch: false,
  max_restarts: 5,
  min_uptime: '10s',
  restart_delay: 3000,
},
```

Then: `pm2 start ecosystem.config.js --only bishvil-yehuda && pm2 save`

**Tailscale access from any tailnet device:**
- `http://instance-neo:3002` (Magic DNS) or
- `http://100.118.67.99:3002` (raw IP)

**Note:** middleware in `src/middleware.ts` enforces auth on `/host/*` and `/admin/*`. Use seed users:
- Host: `host@bishvil.test` / (see `supabase/seed.sql`)
- Admin: `admin@bishvil.test` / (see `supabase/seed.sql`)
- Participant: scheduled session PIN `123456` (sync mode)

## 11. Things to AVOID

- Do not push to remote (no remote exists yet)
- Do not edit ADR-0004 through ADR-0008 directly — write supersedes
- Do not run `pnpm dev` manually — only via PM2
- Do not have two agents touch the same file concurrently
- Do not silently fix what an agent flagged as BLOCKED — escalate to user
- Do not read full agent transcripts — read progress notes only

## 12. When in doubt

Ask the user. The user values:
- Decisions explained in 2-3 sentences with the main tradeoff
- Concise summaries with file paths
- Asking before destructive or shared-state changes
- Hebrew/RTL correctness
- Clean commits, organized tasks
