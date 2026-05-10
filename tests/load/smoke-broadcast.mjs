#!/usr/bin/env node
// End-to-end smoke for the realtime broadcast migration.
//
// Flow:
//   1. Join the smoke session via the deployed API (real participant JWT).
//   2. Open a Supabase Realtime client authenticated as that participant.
//   3. Subscribe to the private `session:<id>:tick` channel.
//   4. After SUBSCRIBED, advance sessions.current_question_id via the
//      Management API SQL endpoint.
//   5. Pass: a broadcast event arrives within 2 s of the UPDATE.
//      Fail: timeout — broadcast/RLS misconfigured.
//
// Required env: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, SUPABASE_URL,
// SUPABASE_ANON_KEY, BASE_URL.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUN = JSON.parse(await readFile(resolve(HERE, ".run.json"), "utf8"));

const ACCESS_TOKEN = req("SUPABASE_ACCESS_TOKEN");
const PROJECT_REF = req("SUPABASE_PROJECT_REF");
const SUPABASE_URL = req("SUPABASE_URL");
const SUPABASE_ANON_KEY = req("SUPABASE_ANON_KEY");
const BASE_URL = req("BASE_URL").replace(/\/$/, "");

function req(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`missing env ${name}`);
    process.exit(2);
  }
  return v;
}

async function sql(query) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function join() {
  const res = await fetch(`${BASE_URL}/api/session/${RUN.pin}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      firstName: "Smoke",
      lastName: "Test",
      phone: "0509999111",
      unit: "smoke",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`join ${res.status}: ${body}`);
  }
  return res.json();
}

const TIMEOUT_MS = 5000;

async function main() {
  console.log(`[smoke] pin=${RUN.pin} sessionId=${RUN.sessionId}`);
  const joined = await join();
  if (!joined.accessToken) {
    throw new Error(`no accessToken in join response: ${JSON.stringify(joined)}`);
  }
  console.log(`[smoke] joined, participantId=${joined.participantId ?? "?"}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${joined.accessToken}` },
    },
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  // Authenticate the realtime connection so private channels work.
  await supabase.realtime.setAuth(joined.accessToken);

  const topic = `session:${RUN.sessionId}:tick`;
  const events = [];
  const subscribed = new Promise((resolve, reject) => {
    const channel = supabase
      .channel(topic, { config: { private: true } })
      .on("broadcast", { event: "INSERT" }, (payload) => {
        events.push({ type: "INSERT", at: Date.now(), payload });
      })
      .on("broadcast", { event: "UPDATE" }, (payload) => {
        events.push({ type: "UPDATE", at: Date.now(), payload });
      })
      .on("broadcast", { event: "DELETE" }, (payload) => {
        events.push({ type: "DELETE", at: Date.now(), payload });
      })
      .subscribe((status, err) => {
        console.log(`[smoke] channel status=${status}${err ? " err=" + err.message : ""}`);
        if (status === "SUBSCRIBED") resolve(channel);
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          reject(err ?? new Error(status));
      });
  });

  const channel = await Promise.race([
    subscribed,
    new Promise((_, r) => setTimeout(() => r(new Error("subscribe timeout")), TIMEOUT_MS)),
  ]);

  // Advance current_question_id from question[0] to question[1].
  const triggerAt = Date.now();
  console.log(`[smoke] advancing current_question_id -> ${RUN.questionIds[1]}`);
  await sql(
    `update public.sessions set current_question_id = '${RUN.questionIds[1]}' where id = '${RUN.sessionId}';`,
  );
  console.log(`[smoke] advance UPDATE returned`);

  const deadline = triggerAt + TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (events.some((e) => e.at >= triggerAt)) break;
    await new Promise((r) => setTimeout(r, 50));
  }

  await supabase.removeChannel(channel);

  const matched = events.filter((e) => e.at >= triggerAt);
  const latencyMs = matched.length ? matched[0].at - triggerAt : null;

  console.log("");
  console.log("============================================================");
  console.log(`events received post-trigger: ${matched.length}`);
  if (matched.length) {
    console.log(
      `first event: type=${matched[0].type} latency=${latencyMs}ms payload=${JSON.stringify(matched[0].payload).slice(0, 200)}`,
    );
  }
  console.log("============================================================");

  if (!matched.length) {
    console.log("FAIL: no broadcast received within 5s");
    process.exit(1);
  }
  if (latencyMs > 1000) {
    console.log(`WARN: latency ${latencyMs}ms > 1000ms target`);
  } else {
    console.log(`PASS: broadcast received in ${latencyMs}ms`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
