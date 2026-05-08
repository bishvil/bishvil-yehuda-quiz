#!/usr/bin/env node
// Provisions a fresh load-test quiz + live sync session via the Supabase
// Management API SQL endpoint. Writes tests/load/.run.json with PIN +
// question IDs so the k6 runner and the question-advance ticker can use them.
//
// Required env:
//   SUPABASE_ACCESS_TOKEN   sbp_... management API token
//   SUPABASE_PROJECT_REF    e.g. dcinzawjietdpbmvksqx
//
// Optional env:
//   QUESTION_COUNT          number of questions to seed (default 5)
//   QUIZ_TAG                tag in the quiz title (default "load-test")

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ACCESS_TOKEN = required("SUPABASE_ACCESS_TOKEN");
const PROJECT_REF = required("SUPABASE_PROJECT_REF");
const QUESTION_COUNT = Number(process.env.QUESTION_COUNT ?? 5);
const QUIZ_TAG = process.env.QUIZ_TAG ?? "load-test";

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

function randomPin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function main() {
  // Pick the system "yehuda" brand and an admin owner that already exists.
  const [brand] = await sql(
    `select id from brands where slug = 'yehuda' limit 1;`,
  );
  if (!brand) throw new Error("no yehuda brand");

  const [owner] = await sql(
    `select id from auth.users where (raw_app_meta_data->>'role') in ('admin','host') order by created_at limit 1;`,
  );
  if (!owner) throw new Error("no admin/host user to own the test quiz");

  const title = `${QUIZ_TAG} ${new Date().toISOString().slice(0, 19)}`;
  const [quiz] = await sql(`
    insert into quizzes (owner_id, brand_id, title, default_game_mode)
    values ('${owner.id}', '${brand.id}', '${title.replace(/'/g, "''")}', 'sync')
    returning id;
  `);

  const questionRows = Array.from({ length: QUESTION_COUNT }, (_, i) => {
    const ord = i + 1;
    const correct = `opt-a-${ord}`;
    return `(
      '${quiz.id}', ${ord}, 'single',
      'Load-test question ${ord}',
      jsonb_build_array(
        jsonb_build_object('id','${correct}','text','Option A'),
        jsonb_build_object('id','opt-b-${ord}','text','Option B'),
        jsonb_build_object('id','opt-c-${ord}','text','Option C'),
        jsonb_build_object('id','opt-d-${ord}','text','Option D')
      ),
      array['${correct}']::text[],
      30, 1500
    )`;
  }).join(",");

  const questions = await sql(`
    insert into questions (quiz_id, ordinal, type, prompt, options, correct_ids, time_seconds, points)
    values ${questionRows}
    returning id, ordinal;
  `);
  questions.sort((a, b) => a.ordinal - b.ordinal);

  let pin;
  let session;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    pin = randomPin();
    try {
      [session] = await sql(`
        insert into sessions (quiz_id, pin, status, game_mode, current_question_id, started_at)
        values ('${quiz.id}', '${pin}', 'live', 'sync', '${questions[0].id}', now())
        returning id;
      `);
      break;
    } catch (err) {
      if (!/sessions_pin_active_idx/.test(String(err))) throw err;
    }
  }
  if (!session) throw new Error("could not allocate a unique PIN");

  const out = {
    pin,
    sessionId: session.id,
    quizId: quiz.id,
    ownerId: owner.id,
    questionIds: questions.map((q) => q.id),
    correctOptionIds: questions.map((_, i) => `opt-a-${i + 1}`),
    createdAt: new Date().toISOString(),
  };

  const outPath = resolve(HERE, ".run.json");
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(out, null, 2));

  console.log(`PIN=${pin}`);
  console.log(`SESSION=${session.id}`);
  console.log(`QUIZ=${quiz.id}`);
  console.log(`QUESTIONS=${out.questionIds.length}`);
  console.log(`wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
