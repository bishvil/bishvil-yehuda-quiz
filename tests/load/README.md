# Load tests

k6 sync-mode load test against the production deployment.

## Files

- `setup.mjs` — provisions a fresh test quiz + live `sync` session via the Supabase Management API. Writes `.run.json`.
- `advance.mjs` — background ticker that walks `sessions.current_question_id` through the seeded question list, simulating a host pacing the game. Run alongside k6.
- `k6-sync-game.js` — the k6 scenario (join → poll → answer).
- `teardown.mjs` — deletes anonymous participant auth users + the test quiz (cascade).

## Required env

```bash
export SUPABASE_ACCESS_TOKEN="sbp_..."          # Supabase management API token
export SUPABASE_PROJECT_REF="dcinzawjietdpbmvksqx"
export BASE_URL="https://bishvil-yehuda-quiz.vercel.app"
```

## Run

```bash
# 1. Provision the test session
node tests/load/setup.mjs

# 2. Start the question advancer in another shell (or background)
ADVANCE_INTERVAL_MS=30000 START_DELAY_MS=60000 node tests/load/advance.mjs &

# 3. Run k6 (200 VUs over 5 minutes)
cd tests/load
k6 run -e BASE_URL=$BASE_URL -e VUS=200 -e RAMP_S=60 -e HOLD_S=240 k6-sync-game.js

# 4. Repeat with 400 VUs if 200 passed
k6 run -e BASE_URL=$BASE_URL -e VUS=400 -e RAMP_S=90 -e HOLD_S=300 k6-sync-game.js

# 5. Clean up
node tests/load/teardown.mjs
```

## What to watch during the run

- **Vercel** dashboard → Observability: function p95, concurrency, errors.
- **Supabase** dashboard → Reports: DB CPU, active connections, pooler saturation, slow queries.
- **Supabase** dashboard → Realtime: subscribers, message rate (Realtime is best-effort here, polling is primary).

## Thresholds (k6 fails the run if any breach)

| Metric | p95 | p99 |
|---|---|---|
| join | 3000 ms | 8000 ms |
| state poll | 800 ms | 2000 ms |
| answer | 1000 ms | — |

Plus error rates: join < 5%, state < 2%, answer < 5%.

## Notes on side effects

- Each VU calls `signInAnonymously()`, which creates a real anonymous user in `auth.users`. `teardown.mjs` deletes them. Don't skip teardown.
- The advancer mutates `sessions.current_question_id` directly via SQL. Participants pick this up on the next 5 s state poll. (We are not exercising `safeRevalidateTag` or the host route — that's a separate test if needed.)
- Tests run against **production**. Use only when no real users are on the system. The advance and teardown scripts touch only the rows tied to `.run.json`.
