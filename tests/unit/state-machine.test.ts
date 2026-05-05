import { describe, expect, it } from "vitest";

import {
  canTransitionQuestion,
  canTransitionSession,
} from "@/src/lib/sessions/state-machine";

describe("session state transitions (ADR-0004 §1)", () => {
  it("allows scheduled → live", () => {
    expect(canTransitionSession("scheduled", "live")).toBe(true);
  });

  it("allows live → paused → live cycle", () => {
    expect(canTransitionSession("live", "paused")).toBe(true);
    expect(canTransitionSession("paused", "live")).toBe(true);
  });

  it("rejects ended → anything (terminal state)", () => {
    expect(canTransitionSession("ended", "live")).toBe(false);
    expect(canTransitionSession("ended", "paused")).toBe(false);
  });

  it("rejects paused → scheduled (cannot un-start)", () => {
    expect(canTransitionSession("paused", "scheduled")).toBe(false);
  });

  it("returns true for same-status idempotent calls", () => {
    expect(canTransitionSession("live", "live")).toBe(true);
  });
});

describe("question state transitions (ADR-0005 §1)", () => {
  it("allows idle → answering directly (presenting is optional)", () => {
    expect(canTransitionQuestion("idle", "answering")).toBe(true);
  });

  it("allows idle → presenting → answering for host-gated media", () => {
    expect(canTransitionQuestion("idle", "presenting")).toBe(true);
    expect(canTransitionQuestion("presenting", "answering")).toBe(true);
  });

  it("allows answering → locked → revealed", () => {
    expect(canTransitionQuestion("answering", "locked")).toBe(true);
    expect(canTransitionQuestion("locked", "revealed")).toBe(true);
  });

  it("rejects revealed → anything (terminal state per ADR-0005 Open Q3)", () => {
    expect(canTransitionQuestion("revealed", "locked")).toBe(false);
    expect(canTransitionQuestion("revealed", "answering")).toBe(false);
  });

  it("rejects answering → revealed (must lock first)", () => {
    expect(canTransitionQuestion("answering", "revealed")).toBe(false);
  });
});
