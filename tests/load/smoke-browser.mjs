#!/usr/bin/env node
// Real-browser smoke for the broadcast tick.
//
// Opens a chromium tab, joins as a participant, waits for "Load-test
// question 1", then advances sessions.current_question_id via the
// Management API SQL endpoint and measures how long until the page
// renders "Load-test question 2".
//
// Pass: question 2 visible within 2s of the SQL update (broadcast wakes
// the page well before the 30s safety poll).
// Fail: 25-30s = page only updated when the safety poll fired.
//
// Required env: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, BASE_URL.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUN = JSON.parse(await readFile(resolve(HERE, ".run.json"), "utf8"));

const ACCESS_TOKEN = req("SUPABASE_ACCESS_TOKEN");
const PROJECT_REF = req("SUPABASE_PROJECT_REF");
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

async function main() {
  console.log(`[smoke] pin=${RUN.pin} sessionId=${RUN.sessionId}`);

  // Bootstrap question_session_state for Q1 in 'answering' so the
  // lobby auto-navigates the participant to /play. setup.mjs only sets
  // sessions.current_question_id; the lobby waits for an active qss
  // status to transition.
  const nowSql = "now()";
  const deadline = `now() + interval '120 seconds'`;
  await sql(
    `insert into public.question_session_state
       (session_id, question_id, question_index, status, started_at, deadline_at)
     values ('${RUN.sessionId}', '${RUN.questionIds[0]}', 1, 'answering', ${nowSql}, ${deadline})
     on conflict (session_id, question_id) do update
     set status = 'answering', started_at = ${nowSql}, deadline_at = ${deadline}, revealed_at = null;`,
  );
  console.log(`[smoke] qss bootstrapped for q1 = answering`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
  });
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(`[browser-err] ${msg.text()}`);
  });

  // Capture /state requests for visibility into broadcast-driven refetch cadence.
  const stateFetches = [];
  page.on("response", (res) => {
    const url = res.url();
    if (url.includes(`/api/participant/${RUN.pin}/state`)) {
      stateFetches.push({ at: Date.now(), status: res.status() });
    }
  });

  await page.goto(`${BASE_URL}/${RUN.pin}`, { waitUntil: "networkidle" });
  console.log(`[smoke] opened ${BASE_URL}/${RUN.pin}`);

  await page.fill("#join-phone", "0509998877");
  await page.fill("#join-first-name", "Browser");
  await page.fill("#join-last-name", "Smoke");
  await page.fill("#join-unit", "smoke");

  const submitBtn = page.locator('button:has-text("הצטרפות לחידון")');
  await submitBtn.waitFor({ state: "visible", timeout: 5000 });
  const disabledBefore = await submitBtn.isDisabled();
  console.log(`[smoke] submit disabled? ${disabledBefore}`);
  if (disabledBefore) {
    await page.screenshot({ path: "/tmp/smoke-disabled.png" });
    console.log("[smoke] saved /tmp/smoke-disabled.png");
  }
  await submitBtn.click();
  try {
    await page.waitForURL(/\/lobby|\/play/, { timeout: 20000 });
  } catch (err) {
    await page.screenshot({ path: "/tmp/smoke-no-nav.png" });
    console.log(
      `[smoke] no nav, url=${page.url()} screenshot=/tmp/smoke-no-nav.png`,
    );
    throw err;
  }
  console.log(`[smoke] joined, url=${page.url()}`);

  // Wait for question 1 prompt to render on /play.
  await page.waitForURL(/\/play/, { timeout: 15000 });
  await page.locator('text="Load-test question 1"').waitFor({ timeout: 15000 });
  console.log(`[smoke] q1 visible`);

  // Reset state-fetch counter from this point so we measure
  // post-trigger refetch latency cleanly.
  stateFetches.length = 0;

  // Wait 2s of "quiet" (no refetches) so we know the broadcast we see
  // next is response to our trigger, not a tail of join-time refetches.
  await page.waitForTimeout(2000);
  const baselineFetches = stateFetches.length;

  const triggerAt = Date.now();
  console.log(`[smoke] advancing current_question_id -> ${RUN.questionIds[1]}`);
  // Mirror what /api/host/[pin]/question/start does: bootstrap qss
  // for the new question, then point sessions at it.
  const nowSql2 = "now()";
  const deadline2 = `now() + interval '120 seconds'`;
  await sql(
    `insert into public.question_session_state
       (session_id, question_id, question_index, status, started_at, deadline_at)
     values ('${RUN.sessionId}', '${RUN.questionIds[1]}', 2, 'answering', ${nowSql2}, ${deadline2})
     on conflict (session_id, question_id) do update
     set status = 'answering', started_at = ${nowSql2}, deadline_at = ${deadline2}, revealed_at = null;
     update public.sessions set current_question_id = '${RUN.questionIds[1]}' where id = '${RUN.sessionId}';`,
  );
  const sqlReturnAt = Date.now();
  console.log(`[smoke] SQL returned in ${sqlReturnAt - triggerAt}ms`);

  // Wait for the q2 prompt to appear.
  let q2At;
  try {
    await page
      .locator('text="Load-test question 2"')
      .waitFor({ timeout: 35000 });
    q2At = Date.now();
  } catch {
    console.log(`[smoke] q2 NEVER appeared within 35s`);
    await browser.close();
    process.exit(1);
  }

  const renderLatencyMs = q2At - triggerAt;
  const postTriggerFetches = stateFetches.filter((f) => f.at >= triggerAt);
  const firstFetchAfter = postTriggerFetches[0];
  const fetchLatencyMs = firstFetchAfter
    ? firstFetchAfter.at - triggerAt
    : null;

  await browser.close();

  console.log("");
  console.log("============================================================");
  console.log(`baseline fetches in 2s quiet:  ${baselineFetches}`);
  console.log(`fetches after trigger:         ${postTriggerFetches.length}`);
  console.log(`first /state after trigger:    ${fetchLatencyMs ?? "(none)"}ms`);
  console.log(
    `q2 visible:                    ${renderLatencyMs}ms after trigger`,
  );
  console.log("============================================================");

  if (renderLatencyMs > 5000) {
    console.log(
      `WARN: q2 took ${renderLatencyMs}ms — that's longer than a broadcast hop should be. May have arrived via the 30s safety poll instead.`,
    );
    process.exit(1);
  }
  console.log(`PASS: broadcast carried the tick in ${renderLatencyMs}ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
