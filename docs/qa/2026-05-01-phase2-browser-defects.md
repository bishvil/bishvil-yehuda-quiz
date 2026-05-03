# Phase 2 Browser-Verified Defects — 2026-05-01

Source: user QA pass against PM2 dev server `http://instance-neo:3002` (HEAD `2caa436`, post-Wave-3-Phase-2).

## Defects reported

| # | Surface | Symptom | True nature |
|---|---|---|---|
| 1 | Landing `/` | Shows English placeholder ("Baseline ready — feature work begins in the next wave.") | **Not a regression.** `app/page.tsx` last touched at bootstrap commit `050674b`; never replaced. Treat as missing feature. |
| 2 | `/login` | Blank page | **Not a regression.** Route does not exist; signin **API** routes (`/api/auth/{host,admin}/signin`) exist but no UI consumes them. Blank = Next.js 404 default. Treat as missing feature. |
| 3 | Participant join `/[pin]` | "הצטרפות לחידון" button permanently disabled | **Real UX defect.** `app/[pin]/join-screen.tsx:43-48` gates `disabled` on PIN length === 6, phone trim ≥6, first/last name non-empty, `!submitting`, `!sessionUnavailable`. Most likely root causes: (a) PIN from URL `[pin]` not pre-populated into `CodeInput`, forcing manual retype; (b) `sessionUnavailable` flips true silently with no visible reason for the user. |

## Investigation evidence

- Explore-agent transcript located each file, confirmed last-touched commit, and traced the disabled-button state machine. No middleware redirect, no layout/provider error, no hidden CSS. Tests for landing/login do not exist (because the surfaces don't exist as features).
- Design system source of truth: `_design-system/bishvil-yehuda-design-system/project/SKILL.md` + `colors_and_type.css` + `preview/*.html` (13 specimens). Mobile-first JSX patterns under `_design-system/.../ui_kits/website/*.jsx` and `_prototype/untitled/project/*.jsx` (Hero, Header, FilterChips, BottomNav). Tailwind 4 `@theme` bridge already wired in `app/globals.css`; Heebo + Suez One via `next/font/google` + BAHamossad via `@font-face` in `app/layout.tsx`.

## Decided fix-batch (Phase 2 fix-batch — A + B together)

### A. Landing + Login UI (Sonnet — UI/design judgment)
- Build a real Hebrew/RTL landing at `app/page.tsx` using brand tokens. Surfaces: hero with quiz brand, primary CTA → `/login` (host/admin), secondary affordance → "הצטרפות לחידון" (PIN input modal/inline that routes to `/<pin>`), footer with brand mark.
- Build `app/login/page.tsx` (client component) with two tabs/segments: **מארח** and **מנהל**, each consuming the existing API routes `/api/auth/host/signin` and `/api/auth/admin/signin`. After success, redirect to `/host` and `/admin/quizzes` respectively. Show Hebrew error messages on 401/422.
- Use design tokens only — no hard-coded hex. Pill buttons, paper background, forest-green primary, brown headings. Mobile-first. RTL.

### B. Join-screen UX fix (Codex — systematic)
- Pre-populate `CodeInput` from the route param `[pin]` so an arrived participant doesn't retype.
- Render a visible Hebrew status banner when `sessionUnavailable` or `sessionStatus === "ended"` (reason copy: "החידון אינו זמין כעת" / "החידון הסתיים"), so the disabled button has a user-facing explanation.
- Keep the validation gate intact; only surface its reason. No new dependencies.

### Tradeoff
Doing A expands Phase 3 scope (landing + login were never on the punch list). Alternative was filing A as a new Wave 3 item and shipping only B now. User chose A+B together so the platform can be "played with" end-to-end.

---

## Wave 3 status snapshot (as of 2026-05-01)

### Phase 1 — backend hardening + admin polish + test infra · **DONE**
| Subtask | Punch IDs | Status | Owner |
|---|---|---|---|
| 1A — Admin authoring polish | items 1, 2, 3 (M1/M2/M3) | done | Sonnet |
| 1B — Backend hardening | items 8, 9, 10, 11, 12, 13, 14, 15 | done | Codex |
| 1C — Test infra | item 16, L2 | done | Sonnet |
| Phase 1 review | (review-only) | done · `accept-with-followups` | Codex |
| Phase 1 fix-batch | H1, M1, M2 from review | done | Sonnet |

### Phase 2 — product features · **DONE (implementation), QA-FAILED on landing/login/join**
| Subtask | Punch IDs | Status | Owner |
|---|---|---|---|
| 4 — File upload pipeline + ADR-0010 | item 6 | done | Sonnet |
| 4b — Interactive map question + ADR-0011 | item 6/map | done | Sonnet |
| 5 — DnD reorder | item 7 | done | Sonnet |
| Phase 2 editor wiring (uploads + map + dnd) | (integration) | done — last commit `2caa436` | Sonnet |

**Outstanding from Phase 2 plan (not yet started):**
- 6. Streamed CSV results export (admin session results) — sequenced after 4/4b/5
- 7. Per-question live preview in editor — sequenced after 6

### Phase 2 fix-batch (this doc) · **STARTING NOW**
- A. Landing + Login UI — Sonnet — depends on design system
- B. Join-screen UX fix (PIN prefill + status banner) — Codex

### Phase 3 — deploy infra · **BLOCKED on user accounts**
- Cloud Supabase project link + `supabase db push --linked`
- GitHub remote + `vercel link`
- `vercel.ts` cron schedule wiring (`/api/cron/expire-questions` every minute)
- Mobile Playwright project (currently Desktop Chrome only)
- Multi-station integration tests
- Real device QA on Hebrew/RTL

### Cross-cutting deferrals (non-blocking)
- `'use cache'` adoption / performance pass
- `next/font/local` switch when licensed Fontbit woff2 fonts arrive

---

## What is left (linear todo)

Done:
- ~~A — landing + login~~ (`261e68c`, `455155f`)
- ~~B — join screen prefill + status banner~~ (`de194e3`, `edf6716`, `1d6d5ae`, plus dev-server side `db0f40f`/`426f1e4`)
- ~~C — auth role-agnostic elevation~~ (`bd5e3b9`, `c83c8dd`) — went too far, segmented control was removed; corrected by E
- ~~D — `/host` home index + lifecycle copy + host live banner~~ (`25db08a`, `87778f5`, `7e66ea1`)

Phase 2.5 done (Codex):
- **E** [QA-1b] — Segmented login restored (`4ef2525`) + bonus logout endpoint (`1a6c805`)
- **F** [QA-4a] — Admin nav dead-link disable (`891a7ca`)
- **F** [QA-4b] — Mobile nav drawer (`afdcb37`)
- **G** [QA-5] — Bulk reorder endpoint (`591522a`) + editor wiring (`9b607db`)
- Coordinator gate-fix for G's TS strict-index leak (`d537c7c` after history rewrite)

Phase 2.5 partially done — needs follow-up:
- **F** [QA-4c] — Host live "טוען לוח מדריך…" → real error UI: NOT COMMITTED. `useHostState` already exposes `status`/`error`; `host-screen.tsx:53` still only destructures `state, refetch`. Re-spawn under task `9e9404f3-575e-4583-97e6-7b49d9fb7531`.

Phase 2.5 queued (todo):
- **H** [QA-6] — Map style switch no-op (3 distinct free style URLs + admin warning) — task `c0245d74-ef3a-4370-ac48-85dd6cea5709`
- **I** [QA-7] — Unarchive button + lifecycle copy — task `ca427cca-47a6-43fa-9186-fa14bda30970`
- **J** [QA-8] — Lobby/host-start UX clarity — task `a84e8185-07bc-4f36-bb5b-49da093584cf`

Repo published:
- `https://github.com/NehoraiHadad/bishvil-yehuda-quiz` (private). Tracking `origin/main`. History was rewritten with `git filter-repo` to scrub Supabase local-dev demo JWTs from `.env.example` (force-push completed; old `d0f3d69` SHA is gone, current HEAD is `d537c7c`). Client mirror remote: TBD.

After Phase 2.5:
- Phase 2 fix-batch review (Codex)
- Phase 2 punch item 6 — streamed CSV export
- Phase 2 punch item 7 — per-question live preview
- Phase 2 final review
- Phase 3 — gated on user accounts (cloud Supabase, Vercel link, GitHub Actions on the new remote)

Backlog (filed for later):
- Admin user-management UI (invite hosts via Supabase Admin API)
- Build real `/admin/sessions` and `/admin/results` pages (currently disabled in nav)

## Backlog (filed for later)

- **Admin user-management UI** — invite hosts via Supabase Admin API + email invite, role auto-assigned. Today users are provisioned by SQL/Studio only. Less urgent.
