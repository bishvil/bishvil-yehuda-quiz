# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Bishvil Yehuda quiz — Hebrew/RTL Next.js 16 (App Router) + Supabase (Postgres) + Drizzle quiz platform with two modes: **sync** (live host paces all participants) and **async** (self-paced). Three actor roles: admin, host, participant.

## Commands

Package manager is **pnpm@10.27.0** (Node ≥22). All commands are run via pnpm.

```
pnpm dev                  # Next dev on :3000 (managed by PM2 on this server — see "Server" below)
pnpm build                # Next build
pnpm typecheck            # Runs `next typegen` first (pretypecheck), then `tsc --noEmit`
pnpm lint                 # eslint . (use lint:fix to autofix)
pnpm format[:check]       # prettier
pnpm test                 # vitest run (unit tests in tests/unit/**)
pnpm test:watch           # vitest watch
pnpm test -- <pattern>    # single test file/name
pnpm test:e2e             # playwright (spawns its own next dev on :3100)
pnpm test:e2e:install     # install chromium (one-time)
pnpm db:push              # supabase db push --linked  (apply migrations to linked project)
pnpm db:pull              # supabase db pull --linked
pnpm db:reset:local       # supabase db reset --local
pnpm supabase <cmd>       # Supabase CLI is a dev dep — never install globally
```

CI (`.github/workflows/ci.yml`) runs typecheck → lint → unit tests → build. Playwright is gated separately. Match this order locally before declaring work done.

## Server (this host)

This repo lives on `instance-neo` where the dev server is **PM2-managed**. Do **not** run `pnpm dev` manually — use `pm2 restart <name>`. See `~/.claude/projects/-home-ubuntu-projects/memory/server-memory.md` for the port map and process names.

## Architecture

### Routing & request flow

- `app/` — App Router. Top-level surfaces: `app/page.tsx` (landing), `app/login`, `app/admin`, `app/host/[pin]`, `app/[pin]` (participant join/play), `app/api/**` (route handlers grouped by actor: `admin`, `host`, `participant`, `auth`, `quiz`, `session`, `cron`).
- `proxy.ts` — Next 16 Proxy (replaces middleware) calling `src/lib/supabase/middleware.ts#updateSession` to refresh Supabase auth cookies on every non-static request.
- `next.config.ts` — `typedRoutes: true`, `allowedDevOrigins: ["instance-neo"]` (required for HMR over Tailscale hostname).

### Domain layout (`src/`)

- `src/db/schema/` (re-exported from `src/db/schema.ts`) — Drizzle tables: `quizzes`, `sessions`, `participants`, `answers`, `progress`, `enums`. This is the single source of truth for DB shape; Supabase migrations under `supabase/migrations/` must be kept in sync.
- `src/lib/sessions/state-machine.ts` — Authoritative session/participant state transitions (see ADR-0004). Every API mutation that changes game state must go through here.
- `src/lib/sessions/{host-context,host-sessions,participant-payload,lookup,expiry}.ts` — Session resolution and the payload shapes returned to host vs participant clients.
- `src/lib/{admin,host,participant}/` — Per-actor server logic and `api-client.ts` files used by the corresponding client components.
- `src/lib/scoring.ts` — Shared scoring algorithm (used in both sync and async).
- `src/lib/auth/`, `src/lib/supabase/` — Auth and Supabase server/browser/middleware clients (`@supabase/ssr`).
- `src/lib/cache/` + ADR-0008 — Cache and privacy contract: route handlers must set the right `Cache-Control` based on actor and session state. Don't add caching without consulting ADR-0008.
- `src/lib/env.ts` — `getRequiredEnvironmentVariable(...)` is the only sanctioned env accessor for the four required vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`).
- `src/components/{admin,host,participant,landing,login,map,illustrations}/` — Client components grouped by surface. `MapQuestionInteractive.tsx` (MapLibre + react-map-gl) implements ADR-0011's interactive map question.

### Sync vs async (ADR-0007)

Both modes share questions and scoring but differ in who advances questions, where timer state lives, when answers are revealed, and whether `participant_question_progress` is used. **Read ADR-0007 before touching anything that touches question advancement, timers, or resume.** Async-mode work generally must not assume a host actor exists.

### Key ADRs (`docs/decisions/`)

Treat these as binding contracts, not background reading:
- ADR-0004 session/participant state machine
- ADR-0005 question lifecycle & timestamps
- ADR-0006 answer submission & scoring policy
- ADR-0007 sync vs async progression
- ADR-0008 cache & privacy contract
- ADR-0009 host pre-start cancellation (supersedes part of ADR-0004)
- ADR-0010 storage policy for admin uploads
- ADR-0011 interactive map question (MapLibre)

If a change conflicts with an ADR, update the ADR (or add a new one) in the same PR.

## Design system (RTL Hebrew)

The design system lives in `_design-system/bishvil-yehuda-design-system/project/` and the prototype reference in `_prototype/`. **`docs/design-intake.md` is the bridge document** — read it before any UI work. Hard rules (from `_design-system/.../SKILL.md`): RTL, self-hosted `BA Hamossad` font (must be present in `public/fonts/`), no emoji, pill buttons, specific font fallback stacks. The canonical CSS token file is `colors_and_type.css` (do not import the prototype's `tokens.css`). For the `--font-hand` stack, use the prototype's definition (Hebrew-safe).

## Testing

- **Unit:** Vitest + jsdom + RTL v16, files under `tests/unit/**/*.{test,spec}.{ts,tsx}`. `vitest.config.ts` force-sets `NODE_ENV=test` (the host shell exports `NODE_ENV=production` for PM2; without this React 19 loads its production bundle and `React.act` is missing). `tests/setup.ts` populates fake Supabase env vars so route handlers can be imported.
- **E2E:** Playwright in `tests/e2e/`, runs its own `next dev --port 3100` so it never collides with the PM2 dev server on :3000. Override with `PORT` or `PLAYWRIGHT_BASE_URL`.
- The `@/` import alias resolves to the repo root (see `vitest.config.ts` and `tsconfig.json`).

## Conventions worth knowing

- Route handlers are grouped by actor (`app/api/{admin,host,participant,...}`) and pair with a same-named module under `src/lib/<actor>/api-client.ts` consumed by the client.
- QA defect notes land in `docs/qa/` and are referenced from commits as `[QA-NN]` (see recent git log).
- Supabase MCP and the `supabase` skill are gated behind a plugin flag — enable only once a project ref exists. Otherwise prefer the `supabase` CLI via `pnpm supabase ...`.
- Use `context7` MCP for live library docs (Next.js 16, Supabase, Drizzle, Playwright, Tailwind v4) instead of relying on memory.
