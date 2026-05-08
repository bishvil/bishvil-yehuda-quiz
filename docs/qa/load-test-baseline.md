# Load-Test Baseline — 2026-05-08

Baseline snapshot of production infra **before** any load testing. Target: 200–400 concurrent participants in one sync-mode game.

## Supabase

- **Project:** `bishvil-yehuda-quiz` (`dcinzawjietdpbmvksqx`)
- **Region:** `eu-central-1` (Frankfurt)
- **Status:** `ACTIVE_HEALTHY`
- **Postgres:** 17.6.1.113 on aarch64
- **Compute size:** **Nano** (default, no `compute_instance` addon selected)
  - Approx. 1 shared vCPU, ~512 MB RAM, ~60 direct connections, ~200 pooler connections.
  - First upgrade tier — **Micro** ($10/mo): 2 vCPU shared, 1 GB RAM, 200 pooler conns.
  - **Small** ($15/mo): 2 vCPU shared, 2 GB RAM, 400 pooler conns.
- **Pooler:** Supavisor at `aws-1-eu-central-1.pooler.supabase.com:6543`, **`pool_mode=transaction`** ✓, SCRAM auth ✓, no overrides on `default_pool_size` / `max_client_conn` (Supabase defaults).
- **Current data volume:** essentially empty (0 sessions, 0 participants, 0 answers, 1 quiz). EXPLAIN ANALYZE results from the live DB are not meaningful at this stage; the planner will choose seq scans regardless of indexes.

## Index coverage on hot tables (verified live)

All filters listed are covered by existing indexes (btree, leftmost-prefix rule):

| Table | Hot filter | Index used |
|---|---|---|
| `session_participants` | `session_id = ?` | `session_participants_session_id_id_idx (session_id, id)` UNIQUE |
| `session_participants` | `session_id = ? AND phone = ?` | `session_participants_session_id_phone_idx` UNIQUE |
| `answers` | `session_id = ?` | `answers_session_question_participant_idx (session_id, question_id, participant_id)` UNIQUE |
| `answers` | `session_id = ? AND question_id = ?` | same composite (leftmost prefix) |
| `participant_question_progress` | `(session_id, participant_id, question_id)` | PK |
| `participant_scores` | `(session_id, participant_id)` | PK |
| `question_session_state` | `(session_id, question_id)` | PK |
| `sessions` | `pin = ? AND status IN (scheduled,live)` | `sessions_pin_active_idx` partial UNIQUE |

**No missing indexes for the sync-mode hot paths.** Phase 2 step 1 of the plan (adding `session_participants(session_id)` and `answers(session_id, question_id)`) is **redundant** and was dropped.

## Vercel

- CLI logged in as `nehoraihadad`. Project not linked locally on `instance-neo` (no `.vercel/`); not blocking — Phase 1 reads the deployment via dashboard / API only.
- No `vercel.json` / `vercel.ts` in repo. Defaults apply: Fluid Compute (Node 24 LTS), 300 s default `maxDuration`.
- No `runtime` / `maxDuration` exports on hot route handlers (`participant/[pin]/state`, `host/[pin]/live`, `session/[pin]/answer`, `host/[pin]/question/next`).

## Sync-mode hot-path summary

When host advances a question with N participants:

- **Steady state:** N × 1 GET / 5 s on `/api/participant/[pin]/state` ≈ N/5 RPS. At N=400, ~80 RPS sustained.
- **Advance burst:** all N clients re-fetch within ~100–200 ms after `safeRevalidateTag(...)` + Realtime broadcast.
- **Answer burst:** up to N POSTs to `/api/session/[pin]/answer` in a 2–15 s window.

## Risk ranking (revised after live infra check)

1. **DB CPU on Nano** — most likely first bottleneck at 200–400 users. Nano shares 1 vCPU; even cheap RLS-checked queries × 80–200 RPS will likely saturate it. Highest signal to watch in Phase 4.
2. **Realtime fan-out** — 400 subscribers per session, RLS-gated `postgres_changes` on 4 tables. Unverified; monitor Realtime metrics during Phase 4.
3. **Pooler saturation** — Nano caps at ~200 pooler connections. Each Vercel function invocation reuses connections in transaction mode, so this is unlikely to hit unless functions hold connections. Watch but don't pre-fix.
4. **Vercel function concurrency** — Fluid Compute reuses instances across requests; not expected to be a problem at this RPS.

## Tools installed for testing

- `k6 v2.0.0-rc1` (apt, Grafana repo) — installed on `instance-neo`.
- `vercel` CLI 53.2.0, `supabase` CLI 2.96.0 — already present.
- Production DB SQL access via Supabase Management API (`/v1/projects/{ref}/database/query`) using the existing access token from this session.

## Decisions

- **Drop Phase 2 step 1** (the index migration). Indexes are sufficient.
- **Keep Phase 2 step 2** (pin `runtime` + `maxDuration` on hot routes) deferred — only if Phase 4 surfaces timeouts.
- **Go straight to Phase 3** (build the k6 test) after user confirms compute-tier strategy.
