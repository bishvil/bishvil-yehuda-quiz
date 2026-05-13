// k6 load test for sync-mode hot path.
//
//   k6 run \
//     -e BASE_URL=https://bishvil-yehuda-quiz.vercel.app \
//     -e VUS=200 \
//     tests/load/k6-sync-game.js
//
// Requires tests/load/.run.json (created by setup.mjs) to be readable from
// the k6 process working directory. Run from the repo root.

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";
import { SharedArray } from "k6/data";
import { randomString } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

const BASE_URL = (__ENV.BASE_URL || "").replace(/\/$/, "");
if (!BASE_URL) throw new Error("BASE_URL env var is required");

const TARGET_VUS = Number(__ENV.VUS || 200);
const RAMP_S = Number(__ENV.RAMP_S || 60);
const HOLD_S = Number(__ENV.HOLD_S || 240);
// Mirrors PARTICIPANT_POLL_INTERVAL_MS (src/lib/constants.ts). Real
// browsers also refetch on Supabase Realtime broadcast events; this
// pure-HTTP runner does not, so its load profile is closer to the
// "broadcast unavailable" worst case.
const POLL_INTERVAL_S = Number(__ENV.POLL_INTERVAL_S || 30);
const ANSWER_DELAY_MIN_S = Number(__ENV.ANSWER_DELAY_MIN_S || 2);
const ANSWER_DELAY_MAX_S = Number(__ENV.ANSWER_DELAY_MAX_S || 15);

const run = new SharedArray("run", () => [JSON.parse(open("./.run.json"))]);

const stateLatency = new Trend("state_latency_ms", true);
const answerLatency = new Trend("answer_latency_ms", true);
const joinLatency = new Trend("join_latency_ms", true);
const stateErr = new Rate("state_errors");
const answerErr = new Rate("answer_errors");
const joinErr = new Rate("join_errors");

export const options = {
  discardResponseBodies: false,
  scenarios: {
    sync_game: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: `${RAMP_S}s`, target: TARGET_VUS },
        { duration: `${HOLD_S}s`, target: TARGET_VUS },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    join_latency_ms: ["p(95)<3000", "p(99)<8000"],
    state_latency_ms: ["p(95)<800", "p(99)<2000"],
    answer_latency_ms: ["p(95)<1000"],
    join_errors: ["rate<0.05"],
    state_errors: ["rate<0.02"],
    answer_errors: ["rate<0.05"],
    http_req_failed: ["rate<0.05"],
  },
};

function pin() {
  return run[0].pin;
}

function syntheticPhone(vu, iter) {
  // Israeli-format-like: starts with 05, total 10 digits.
  const tail = String(
    900_000_000 + ((vu * 9301 + iter * 49297 + Date.now()) % 90_000_000),
  ).slice(0, 8);
  return `05${tail}`;
}

export default function syncGame() {
  const headers = { "Content-Type": "application/json" };
  let token;
  let lastQuestionId = null;
  let answeredQuestionId = null;

  // Join
  const joinRes = http.post(
    `${BASE_URL}/api/session/${pin()}/join`,
    JSON.stringify({
      firstName: `Load${__VU}`,
      lastName: randomString(6),
      phone: syntheticPhone(__VU, __ITER),
      unit: "load-test",
    }),
    { headers, tags: { name: "join" } },
  );
  joinLatency.add(joinRes.timings.duration);
  joinErr.add(joinRes.status !== 200);
  const okJoin = check(joinRes, { "join 200": (r) => r.status === 200 });
  if (!okJoin) {
    sleep(1);
    return;
  }
  try {
    const body = joinRes.json();
    token = body.accessToken;
  } catch {
    return;
  }

  const authHeaders = { ...headers, Authorization: `Bearer ${token}` };
  const startTs = Date.now();
  const endTs = startTs + (RAMP_S + HOLD_S) * 1000;

  while (Date.now() < endTs) {
    const stateRes = http.get(`${BASE_URL}/api/participant/${pin()}/state`, {
      headers: authHeaders,
      tags: { name: "state" },
    });
    stateLatency.add(stateRes.timings.duration);
    stateErr.add(stateRes.status !== 200);
    check(stateRes, { "state 200": (r) => r.status === 200 });

    if (stateRes.status === 200) {
      try {
        const body = stateRes.json();
        const q = body && body.question;
        if (q && q.id && q.id !== lastQuestionId) {
          lastQuestionId = q.id;
          // Schedule an answer for this question after a random delay.
          const delay =
            ANSWER_DELAY_MIN_S +
            Math.random() * (ANSWER_DELAY_MAX_S - ANSWER_DELAY_MIN_S);
          sleep(delay);
          if (q.id !== answeredQuestionId) {
            const optionId = `opt-a-${q.index || 1}`;
            const answerRes = http.post(
              `${BASE_URL}/api/session/${pin()}/answer`,
              JSON.stringify({
                questionId: q.id,
                selectedIds: [optionId],
              }),
              { headers: authHeaders, tags: { name: "answer" } },
            );
            answerLatency.add(answerRes.timings.duration);
            answerErr.add(answerRes.status >= 400 && answerRes.status !== 409);
            answeredQuestionId = q.id;
          }
          continue;
        }
      } catch {
        // ignore parse errors
      }
    }
    sleep(POLL_INTERVAL_S);
  }
}
