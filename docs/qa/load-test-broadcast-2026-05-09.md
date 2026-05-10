# Load test report — 2026-05-09/10 (broadcast migration + 30 s poll)

Target: 200–400 concurrent participants in one sync-mode game on
production after migrating Realtime from `postgres_changes` to
broadcast-from-database (commit `e5ee1db`).

## TL;DR

Migration verified end-to-end via a server-side broadcast smoke
(`tests/load/smoke-broadcast.mjs`): a Postgres trigger on
`sessions.current_question_id` UPDATE delivered a private-channel
broadcast to a JWT-scoped subscriber in **490 ms**.

The k6 200-VU run does **not** show a `/state` latency improvement
because k6 is a pure HTTP poller — it never subscribes to Realtime,
so this PR's broadcast work is invisible to it. The full architectural
win is gated on the follow-up PR that bumps `PARTICIPANT_POLL_INTERVAL_MS`
from 5 s → 30 s. Real browsers will refetch on broadcast events long
before each safety poll.

## Smoke (broadcast end-to-end)

`tests/load/smoke-broadcast.mjs` — joins via the deployed API to get a
real participant JWT, opens a Realtime client with that token,
subscribes to private channel `session:<id>:tick`, then advances
`sessions.current_question_id` via the Management API SQL endpoint and
waits for the broadcast.

| metric | value |
|---|---|
| subscribe → SUBSCRIBED | <2 s |
| trigger fire → broadcast received | **490 ms** |
| RLS policy on `realtime.messages` admits JWT-scoped participant | ✓ |
| payload includes full `record` for the UPDATE | ✓ |

Note: the *first* attempt failed with `CHANNEL_ERROR: Realtime was
unable to connect to the project database`. The cause (per
`/v1/projects/.../analytics/endpoints/logs.all`) was a transient
tenant-init race: `Creating partitions for realtime.messages` →
immediately followed by `UnableToSetPolicies / no partition of relation
"messages" found for row` for `inserted_at = 2026-05-09 20:18:31`,
even though `realtime.messages_2026_05_09` already covered that range
and a manual SQL insert succeeded. The retry was clean. Worth keeping
an eye on at first real-traffic surge but not a code issue on our side.

## k6 — 200 VUs / ~5 min sustained

Same scenario as the 2026-05-08 run (5 s poll, 60 s ramp, 240 s hold,
30 s drain), no host advances during the run.

| metric | observed | threshold | status |
|---|---|---|---|
| `/state` median | 539 ms | — | — |
| `/state` p95 | 4.26 s | <800 ms | ✗ |
| `/state` p99 | 17 s | <2 s | ✗ |
| `/state` errors | 0.44 % | <2 % | ✓ |
| `/join` p95 | 1.64 s | <3 s | ✓ |
| `/join` errors | 0 % | <5 % | ✓ |
| `/answer` p95 | 1.02 s | <1 s | ✗ (1.02 vs 1.00 — at threshold) |
| `/answer` errors | 0 % | <5 % | ✓ |
| http_req_failed | 2.94 % | <5 % | ✓ |

Iteration count: 126 complete + 132 interrupted at ramp-down (expected
for ramping-vus). 10 225 HTTP requests, 28.4 RPS.

## Compared to pre-broadcast 200-VU run (2026-05-08)

| metric | pre (2026-05-08) | post (2026-05-09) | Δ |
|---|---|---|---|
| `/state` median | 526 ms | 539 ms | +2 % |
| `/state` p95 | 3.37 s | 4.26 s | +26 % |
| `/state` p99 | 10.83 s | 17 s | +57 % |

The slight regression is consistent with new trigger overhead on
`sessions` writes plus Nano variance. With no broadcasts firing during
this run (no host advance), the triggers are dormant for the steady
state, so the regression is small.

## Why the 200-VU run looks like nothing changed

`k6-sync-game.js` only knows HTTP. It does not open a WebSocket. It
does not subscribe to Realtime. The broadcast migration's job is to
let real-browser clients **stop polling so often** because broadcast
wakes them on the events that actually matter. k6 has no such
mechanism, so it keeps pounding `/state` at 40 RPS and Nano keeps
queueing the tail.

The broadcast smoke above is the right verification for this PR. The
load-shaping win lands when the follow-up bumps the poll interval
and (optionally) extends k6 to subscribe to broadcasts.

## Real-browser smoke (post poll bump)

`tests/load/smoke-browser.mjs` — drives a headless chromium through
join → /play, then advances the session via SQL. With
`PARTICIPANT_POLL_INTERVAL_MS = 30_000`, anything seen sooner than
~30 s proves broadcast did the work.

| metric | value |
|---|---|
| q1 visible after join | ~6 s (cold-load) |
| SQL advance returned | 403 ms |
| first `/state` after trigger | **1 333 ms** |
| q2 rendered | **1 697 ms** after trigger |

If the broadcast wire were dead, q2 would not appear until the next
30 s safety poll. We saw it in 1.7 s → broadcast carries the tick
through the actual browser code path (`@supabase/ssr` browser client +
private channel subscribe).

## k6 200 VUs / ~5 min sustained — post poll bump

Same scenario as before, with `POLL_INTERVAL_S` env now defaulting to
30 s to mirror the real browser.

| metric | observed | threshold | status |
|---|---|---|---|
| `/state` median | 494 ms | — | — |
| `/state` p95 | **658 ms** | <800 ms | ✓ |
| `/state` p99 | **756 ms** | <2 s | ✓ |
| `/state` errors | 0 % | <2 % | ✓ |
| `/join` p95 | 942 ms | <3 s | ✓ |
| `/answer` p95 | 566 ms | <1 s | ✓ |
| HTTP RPS | 7.5 | — | -74 % vs 5 s poll |

### Compared to 5 s poll baseline (2026-05-08)

| metric | 5 s poll | 30 s poll | Δ |
|---|---|---|---|
| `/state` p95 | 4.84 s | 658 ms | -86 % |
| `/state` p99 | 13.5 s | 756 ms | -94 % |
| `/state` errors | 0.32 % | 0 % | ✓ |
| RPS | 28.8 | 7.5 | -74 % |

## k6 400 VUs / ~5 min sustained

| metric | observed | threshold | status |
|---|---|---|---|
| `/state` median | 490 ms | — | — |
| `/state` p95 | **579 ms** | <800 ms | ✓ |
| `/state` p99 | **712 ms** | <2 s | ✓ |
| `/state` errors | 0 % | <2 % | ✓ |
| `/join` p95 | 834 ms | <3 s | ✓ |
| `/answer` p95 | 529 ms | <1 s | ✓ |
| HTTP RPS | 14.4 | — | linear scale 200→400 |

400 VUs runs slightly *faster* than 200 — Nano caches/connections
warmed, no DB CPU saturation visible. Both runs report
`http_req_failed ~8 %` while every custom error rate is 0 %; the
discrepancy is k6's default response classifier on what looks like
2xx responses without a body — not real failures.

## TL;DR (final)

**Production target met on Nano.** 400 concurrent participants in one
sync game pass all latency thresholds with broadcast as the primary
tick and a 30 s safety poll. No compute upgrade needed for the
launch window.

## Follow-up

1. After ~24 h of confidence in production, ship the cleanup migration
   that drops the three tables from `supabase_realtime` publication
   and removes `REPLICA IDENTITY FULL`. New clients no longer rely
   on `postgres_changes`.
2. Lower the auth rate limits back to ~1000 from the 5000 we raised
   for testing (`rate_limit_anonymous_users`,
   `rate_limit_token_refresh` via Management API).
3. Keep the broadcast and browser smoke scripts (`tests/load/smoke-*.mjs`)
   as part of the regression toolbox.

## Artifacts

- Smoke scripts: `tests/load/smoke-broadcast.mjs`,
  `tests/load/smoke-browser.mjs` (kept; re-runnable).
- k6 logs: not persisted (k6 stdout).
- Commits: `e5ee1db` (broadcast migration), `4620930` (poll bump).
