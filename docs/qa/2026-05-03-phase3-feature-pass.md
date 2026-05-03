# Phase 3 Feature Pass — 2026-05-03

Source: user request bundling Q&A items, bug reports, and feature gaps.
Plan: `~/.claude/plans/there-are-a-few-flickering-music.md`.

Tags QA-19 through QA-24 land here. QA-25 (prototype design polish) is
deferred to a follow-up pass.

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

## Deferred
- **QA-25** — Prototype design polish (host dashboard chrome,
  admin shell typography, brand pill aesthetic). Not blocking; tracked
  as Track G in the plan.
- **Test infrastructure** — admin route tests need a unified supabase
  mock so the `admin-quiz-hard-delete` (and similar) tests can run
  deterministically without a live Supabase instance.
