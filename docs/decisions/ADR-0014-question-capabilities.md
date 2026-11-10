# ADR-0014 — Completion, feedback, flexible questions, and location gates

Status: Implemented locally, pending deployment and physical-device field QA.
Date: 2026-11-10

Existing quizzes retain timed satellite-map defaults. Additive migrations must run
before deploying the new application. `20261110090000_new_question_types.sql`
commits enum additions separately from the following schema/RPC migration.

## Results and feedback

A participant finishing an async session does not close that session for others.
Participant state exposes personal completion, and /play redirects completed users
to /result after reload. Admin results include live and paused async sessions,
labelled as interim results. Results count all participants, including those with
no scored answers. Per-session reads fail explicitly on database errors.

Missing answers, expired unanswered questions, partial answers and incorrect
answers have distinct feedback. Correctness is independent from speed bonuses.
`participant_scores.correct_count` now counts `answers.is_correct`, not all
positive partial scores. Existing score summaries are rebuilt from persisted
answers by the migration; missing answer history cannot be reconstructed.
Result maximum is the sum of scored question points, excluding content stations.

## Question settings

`questions.settings` is a validated JSON object:

- `timeLimitEnabled?: boolean` (default true): false means no deadline or speed
  bonus; points are `floor(question.points * correctness_ratio)`.
- `acceptedAnswers?: string[]`: short open-answer alternatives, private to admins
  and server scoring. Matching uses Unicode NFKC, lowercase, Hebrew niqqud
  removal, trimmed/collapsed whitespace. No fuzzy matching or manual grading.
- `locationGate?: {lat, lng, radiusM}`: an independent unlock rule for async
  stations, including open answers and content. Radius 20–5000 metres.

New question enum values: `open`, `content`. Open answers are saved in
`answers.text_answer` and available in admin review and CSV. Content stations
store progress only: no answer or score row, and no accuracy denominator entry.
Synchronous content is advanced by the host. Async content is ready to advance
when opened. Advance requests carry the current question ID so retries cannot
skip a second content station. Bootstrap/advance inserts never reset a timer
when concurrent requests create the same progress row.

## GPS gates

The latest station is progressed sequentially. Before unlock the server masks
question content, and the public cached question endpoint refuses gated async
content. Progress has null start/deadline and no authoritative answer is accepted.
A participant explicitly requests a fresh high-accuracy reading in the foreground.
Server validates a sample age <=30 seconds, future skew <=5 seconds, accuracy
<=min(radius,100m), and haversine distance <=radius. This is a location usability
gate; a browser cannot prove a device position against spoofing.

`unlock_quiz_station` is service-role-only and atomically persists the first
unlock/start/deadline. Repeated unlocks do not restart time. Operator override is
admin-authenticated and records `location_unlock_actor`. Raw movement trails are
not stored. A page must recheck location after device unlock/return from navigation.
Manual override is accessible in the session results page; refresh lists new waits.

## Maps

`map.geo.baseStyle`: satellite (default) or streets.
`map.geo.labelLevel`: none (default), major, medium, all.

Retain MapLibre. Streets/labels use MapTiler streets when configured, otherwise
OpenFreeMap Liberty. Satellite plus labels combines Esri imagery with the vector
settlement label source. Settlement classes/rank provide cumulative detail:
major cities (city, rank<=4), cities/towns, then all available settlement classes,
subject to the provider's zoom and label collision rules. This is provider ranking,
not a hard population threshold. Country/road/POI names remain hidden.
Hebrew names are preferred, then the source's original/local name.

Runtime destinations include api.maptiler.com (if configured),
tiles.openfreemap.org, server.arcgisonline.com, and the style's font/sprite hosts.
The existing RTL plugin is loaded from unpkg.com. Deployment must permit these
origins. Tests use a deterministic vector style to exercise filters and source
switches without depending on a live provider.

## Validation

Real Postgres/API tests cover timed versus untimed correctness, short open
answers, idempotent submissions, gated scoring denial, radius/accuracy checks,
persistent unlocks, content-only completion and open-session results.
Chromium exercises a full content → open answer → GPS → results journey,
returning to results after reload, editor save/reload, and real MapLibre style
switching/filter stability. Physical iOS/Android location behavior and live map
provider coverage remain field checks before public release.
