#!/usr/bin/env node
// Cleans up after a load test:
//  - ends + archives the test session
//  - deletes the test quiz (cascades to questions, sessions, participants, answers)
//  - deletes anonymous auth users that were created by the join phase
//
// Required env: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF

import { readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ACCESS_TOKEN = required("SUPABASE_ACCESS_TOKEN");
const PROJECT_REF = required("SUPABASE_PROJECT_REF");
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

async function main() {
  const runPath = resolve(HERE, ".run.json");
  let run;
  try {
    run = JSON.parse(await readFile(runPath, "utf8"));
  } catch {
    console.error("no .run.json found; nothing to clean up");
    process.exit(0);
  }

  // Find every anonymous auth user that was created as a participant of the
  // test session. Anonymous users have raw_app_meta_data.session_id set by
  // the join handler.
  const participantUsers = await sql(
    `select id from auth.users where (raw_app_meta_data->>'session_id') = '${run.sessionId}';`,
  );
  console.log(
    `[teardown] participant auth users: ${participantUsers.length}`,
  );

  // Delete from auth.users in batches; cascade rules in public schema take
  // care of session_participants/answers/progress/scores via FK ON DELETE CASCADE.
  const ids = participantUsers.map((row) => row.id);
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const list = batch.map((id) => `'${id}'`).join(",");
    await sql(`delete from auth.users where id in (${list});`);
    console.log(`[teardown] deleted ${Math.min(i + 200, ids.length)}/${ids.length}`);
  }

  // Delete session explicitly (no cascade from quiz → session), then quiz
  // (cascades to questions). Participants/answers already gone via auth.users delete.
  await sql(`delete from sessions where id = '${run.sessionId}';`);
  await sql(`delete from quizzes where id = '${run.quizId}';`);

  console.log("[teardown] done");
  await rm(runPath, { force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
