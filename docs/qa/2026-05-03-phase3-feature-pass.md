# Phase 3 Feature Pass — 2026-05-03

Source: user request bundling Q&A items, bug reports, and feature gaps.
Plan: `~/.claude/plans/there-are-a-few-flickering-music.md` (QA-19..QA-24)
and `~/.claude/plans/vectorized-seeking-goblet.md` (QA-25..QA-27).

Tags QA-19 through QA-27 all land here.

## QA-19 — Quiz editor reorder autosave error
- Symptom: rapid drag-to-reorder produced silent `[browser] TypeError:
  Failed to fetch` in PM2 logs with no matching server 4xx/5xx.
- Root cause: two debounced saves could overlap; the second's PUT loop
  raced the first on `UNIQUE(quiz_id, ordinal)`. Ordinal-only detection
  also compared by index instead of by id, so swaps misfired the bulk
  endpoint.
- Fix: serialize question saves via an in-flight promise ref so the
  latest snapshot wins; tighten ordinal-only detection to compare every
  field by id.
- Files: `app/admin/quizzes/[quizId]/quiz-editor-screen.tsx`.

## QA-20 — Map labels on map questions
- Request: clean base map, no place names / POI / road labels.
- Implementation: post-style-load hook walks `map.getStyle().layers` and
  hides every `type: 'symbol'` layer. Re-applies on `'styledata'` to
  survive async style swaps. Switched the `israel-hiking` raster style
  from OpenTopoMap (labels baked in) to CartoDB `light_nolabels`.
- ADR-0011 §2 updated; `Hebrew labels mandatory` rule dropped.
- Files: `src/components/map/InteractiveMap.tsx`,
  `docs/decisions/ADR-0011-interactive-map.md`,
  `tests/e2e/map-labels.spec.ts`.

## QA-21 — Quiz delete/archive UX
- Terminology: quiz = deletable template; game = state-managed, not
  user-deletable.
- Behavior:
  1. Default-hide archived quizzes in the admin list.
  2. `?hard=true` on `DELETE /api/admin/quizzes/[id]`: refuses unless
     the quiz is archived AND has zero sessions; else 409 with the
     session count.
  3. Sessions FK is `ON DELETE RESTRICT` — games are never lost.
  4. Questions cascade via existing FK.
- Files: `app/admin/quizzes/quiz-list-screen.tsx`,
  `app/api/admin/quizzes/[id]/route.ts`,
  `src/lib/admin/api-client.ts`.
- Test: `tests/unit/api/admin-quiz-hard-delete.test.ts` (skipped pending
  supabase mock; impl verified by typecheck + lint).

## QA-22 — Share PIN / copy link
- New `SharePinPopover` (RTL, keyboard-accessible) renders a button →
  popover with the participant URL, the PIN, a QR code, and a copy
  action. URL is computed at click time from `window.location.origin`.
  Clipboard write falls back to a hidden textarea + `execCommand` for
  non-secure contexts.
- Wired into `HostHomeCard` (prominent variant) and per-row on the
  admin sessions list (compact variant).
- Dep added: `qrcode.react`.

## QA-23 — Active games + Results pages
- `/admin/sessions`: cross-quiz list of `scheduled`/`live`/`paused`
  sessions with brand, mode, PIN, share, and a host-dashboard link.
  Auto-refreshes every 10s.
- `/admin/results`: 50 most recent ended sessions with participant
  count, average score, and top-3 leaderboard. Drills down to the
  existing per-session results page.
- Both items moved out of the "בקרוב" disabled nav group on desktop and
  mobile shells.
- Files: `app/admin/sessions/**`, `app/admin/results/**`,
  `app/api/admin/sessions/active/route.ts`,
  `app/api/admin/results/route.ts`,
  `src/components/admin/{admin-nav-items,AdminSidebar,AdminMobileNav}.tsx`.

## QA-24 — Brand & display + Team pages
- `/admin/settings/brand`: pick from the four brand presets in
  `src/lib/participant/brands.ts`. Persisted on
  `auth.users.app_metadata.brand` (no migration).
- `/admin/settings/team`: list of users with role admin or host;
  role-toggle action; invite-by-email form that calls
  `auth.admin.inviteUserByEmail` with role baked into `app_metadata`.
- Files: `app/admin/settings/{brand,team}/**`,
  `app/api/admin/{settings/brand,team,team/invite}/route.ts`,
  `src/components/admin/{AdminSidebar,AdminMobileNav}.tsx`.

## QA-25 — Prototype design polish (Track G)
- Host question card prompt scaled up for projector view
  (`md:text-[32px] lg:text-[36px]` with tighter leading).
- `HostHomeCard` quiz title switched to display font for warmth.
- Mobile `HostHeader` counter rendered as a pill chip to match the
  desktop CounterChip rhythm.
- Admin sidebar + mobile-nav brand tagline now uses Suez One via
  `--font-suez` with the prototype's ״…״ guillemets, in
  `--bsy-tan-mid` — first place the hand-feel accent actually lands
  in the shell.
- No behavioral changes; no new tokens introduced.

## QA-26 — Host assignment UI (multi-host)
- Schema (`sessions.host_id`) and `POST /api/admin/sessions` already
  accepted `hostUserId`, but the create-session UI never sent it, so
  every game silently belonged to the admin who clicked "create".
- Added a host `<select>` next to "הפעלת חידון" on the per-quiz
  sessions screen, defaulted to the current admin and sourced from
  `GET /api/admin/team` (now also returns `currentUserId`).
- POST validates `hostUserId` against the team roster and returns
  `hostId`/`hostEmail`. New `PATCH /api/admin/sessions/[id]` allows
  re-assigning a host on `draft`/`scheduled` sessions; refuses with
  409 once a session is `live`/`paused`/`ended`.
- Session cards on `/admin/quizzes/[id]/sessions` and `/admin/sessions`
  display the assigned host email; a `(אני)` suffix marks self.
- Files: `app/api/admin/sessions/route.ts`,
  `app/api/admin/sessions/[id]/route.ts` (new),
  `app/api/admin/sessions/active/route.ts`,
  `app/api/admin/team/route.ts`, `src/lib/admin/api-client.ts`,
  `src/lib/admin/team-lookup.ts` (new),
  `app/admin/quizzes/[quizId]/sessions/sessions-screen.tsx`,
  `app/admin/sessions/active-sessions-screen.tsx`.

## QA-27 — Admin route test infrastructure
- `tests/unit/api/admin-quiz-hard-delete.test.ts` was `describe.skip`-ed
  because it called `createServiceRoleSupabaseClient()` against a live
  stack. Re-implemented with the same hoisted `vi.mock` pattern that
  `admin-upload-routes.test.ts` already uses; the suite now runs
  deterministically with no DB.
- New `tests/unit/api/admin-sessions-host-assignment.test.ts` covers
  QA-26's POST `hostUserId` happy path, the 400 INVALID_HOST guard,
  the implicit fall-back to the current admin, the PATCH happy path,
  and the 409 INVALID_STATE refusal once a session is live.
