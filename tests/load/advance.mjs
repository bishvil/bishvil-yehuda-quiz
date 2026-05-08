#!/usr/bin/env node
// Background ticker that advances `sessions.current_question_id` through the
// pre-seeded question list directly via SQL, simulating a host pacing the game
// without needing real host credentials. Stops when the list is exhausted or
// when SIGINT/SIGTERM is received.
//
// Required env:
//   SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF
//
// Optional env:
//   ADVANCE_INTERVAL_MS    default 30000 (30s between advances)
//   START_DELAY_MS         default 60000 (wait for ramp-up before first advance)

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ACCESS_TOKEN = required("SUPABASE_ACCESS_TOKEN");
const PROJECT_REF = required("SUPABASE_PROJECT_REF");
const ADVANCE_INTERVAL_MS = Number(process.env.ADVANCE_INTERVAL_MS ?? 30_000);
const START_DELAY_MS = Number(process.env.START_DELAY_MS ?? 60_000);

const SQL_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
const HERE = dirname(fileURLToPath(import.meta.url));

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`missing env ${name}`);
    process.exit(1);
  }
  return v;
}

async function sql(query) {
  const res = await fetch(SQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text}`);
  return JSON.parse(text);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const run = JSON.parse(
    await readFile(resolve(HERE, ".run.json"), "utf8"),
  );
  console.log(
    `[advance] session=${run.sessionId} questions=${run.questionIds.length} delay=${START_DELAY_MS}ms interval=${ADVANCE_INTERVAL_MS}ms`,
  );

  let stopped = false;
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      console.log(`[advance] ${sig} received`);
      stopped = true;
    });
  }

  await sleep(START_DELAY_MS);

  for (let i = 1; i < run.questionIds.length && !stopped; i += 1) {
    const qid = run.questionIds[i];
    await sql(
      `update sessions set current_question_id = '${qid}', updated_at = now() where id = '${run.sessionId}';`,
    ).catch(async () => {
      await sql(
        `update sessions set current_question_id = '${qid}' where id = '${run.sessionId}';`,
      );
    });
    console.log(
      `[advance] ${new Date().toISOString()} -> q${i + 1}/${run.questionIds.length} (${qid})`,
    );
    await sleep(ADVANCE_INTERVAL_MS);
  }

  console.log("[advance] done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
