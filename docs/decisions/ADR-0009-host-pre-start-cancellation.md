# ADR-0009 — Host Pre-Start Cancellation

**Status:** Accepted
**Date:** 2026-04-30
**Deciders:** Wave 2 coordinator
**Supersedes:** ADR-0004 §1 only for the `scheduled -> ended` actor

---

## Context

ADR-0004 originally allowed `scheduled -> ended` only for admin cancellation.
Wave 2 host UI and API behavior already allowed a host to end a scheduled session
before the first question starts.

This product is used as a field event. The host may be on-site without admin or
HQ access, and needs a practical way to cancel a published PIN before start when
the activity cannot run.

## Decision

Hosts may cancel a scheduled session before start.

The session transition table is amended as follows:

| From | To | Actor | Guard |
|---|---|---|---|
| `scheduled` | `ended` | admin/host | Cancel before start |

This supersedes ADR-0004 §1 for that transition only. All other ADR-0004 session
state rules remain accepted.

The existing host end endpoint may continue to accept `scheduled -> ended` with
host authentication. The host UI may continue to show the end action while a
session is scheduled.

## Consequences

- A scheduled field session can be cancelled by the same host who can start it.
- Admin tooling must not assume scheduled cancellation is admin-only.
- Ending remains terminal; a cancelled scheduled session releases its PIN under
  ADR-0004's existing active-PIN uniqueness scope.
- API coverage must confirm host-authenticated `scheduled -> ended` stays
  supported.

## Open questions

None.
