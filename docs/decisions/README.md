# Architecture Decision Records — Bishvil Yehuda Quiz

This folder contains the ADRs that future agents must follow when implementing the
quiz platform. Each ADR is **practical and implementation-oriented**: schema, state
builders, route handlers, and UI components must be derivable from these documents
without guessing core behavior.

## Numbering

ADRs are numbered sequentially starting at `ADR-0004`. **Numbers `0001–0003` are
reserved** for the high-level decisions captured in the saved execution plan
(`Bishvil Yehuda Quiz — Production v5.3 Dev-First Execution Plan`,
plan ID `391b46db-9931-4cf8-b6da-95f1a52855ab`). Do not back-fill them
opportunistically — if a prior decision needs surfacing, copy the relevant text
out of the plan into a new, higher-numbered ADR.

## Index

| # | Title | Scope |
|---|---|---|
| [ADR-0004](./ADR-0004-state-machine.md) | Session & participant state machine | Status enums, transitions, idempotency, recovery |
| [ADR-0005](./ADR-0005-question-lifecycle.md) | Question lifecycle | Server timestamps, lazy expiry, reveal authority |
| [ADR-0006](./ADR-0006-answer-policy.md) | Answer submission & scoring policy | First-submit-wins, server-time validation, scoring |
| [ADR-0007](./ADR-0007-sync-async-model.md) | Sync vs async progression model | Session pointer vs `participant_question_progress`, resume |
| [ADR-0008](./ADR-0008-cache-privacy.md) | Cache & privacy contract | Public cacheable vs private no-store, forbidden fields |
| [ADR-0009](./ADR-0009-host-pre-start-cancellation.md) | Host pre-start cancellation | Host-authorized `scheduled -> ended` cancellation |
| [ADR-0010](./ADR-0010-storage-policy.md) | Storage policy for admin uploads | Public buckets, admin writes, upload validation, URL strategy |
| [ADR-0011](./ADR-0011-interactive-map.md) | Interactive map question (MapLibre + react-map-gl) | Library, tile source, RTL, additive geo schema, haversine scoring |

## How to add a new ADR

1. Pick the next free number.
2. Use the same heading layout as the existing files: **Status**, **Context**,
   **Decision**, **Consequences**, **Open questions**.
3. Update the index table above in the same change.
4. Cross-link from any ADR that depends on the new one — these documents are
   read together, not in isolation.

## How to *change* an ADR

ADRs are immutable once accepted. To revise:

- Mark the old ADR `Status: Superseded by ADR-NNNN`.
- Write a new ADR that explicitly states what it overrides and why.
- Keep the old file in the repo — it documents history.

## Companion documents

- [`docs/design-intake.md`](../design-intake.md) — design system intake and shadcn/ui bridge.
- [`docs/dev-tooling.md`](../dev-tooling.md) — tooling, MCP, CLI, env policy.
