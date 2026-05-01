import { describe, expect, it } from "vitest";

import {
  LIFECYCLE_COPY,
  SESSION_CREATE_HELPER,
  SESSION_END_CONFIRM,
  SESSION_PUBLISH_CONFIRM,
  SESSION_START_CONFIRM,
} from "@/src/lib/admin/lifecycle-copy";

describe("admin lifecycle copy", () => {
  it("exports a non-empty Hebrew helper for create", () => {
    expect(SESSION_CREATE_HELPER.length).toBeGreaterThan(10);
    expect(SESSION_CREATE_HELPER).toMatch(/[א-ת]/);
  });

  it("publish copy mentions the join code", () => {
    expect(SESSION_PUBLISH_CONFIRM).toMatch(/קוד/);
    expect(SESSION_PUBLISH_CONFIRM).toMatch(/[א-ת]/);
  });

  it("start copy warns the transition is one-way", () => {
    expect(SESSION_START_CONFIRM).toMatch(/לא ניתן/);
  });

  it("end copy warns the session cannot be reopened", () => {
    expect(SESSION_END_CONFIRM).toMatch(/לא ניתן/);
  });

  it("LIFECYCLE_COPY object aggregates the four strings", () => {
    expect(LIFECYCLE_COPY.createHelper).toBe(SESSION_CREATE_HELPER);
    expect(LIFECYCLE_COPY.publishConfirm).toBe(SESSION_PUBLISH_CONFIRM);
    expect(LIFECYCLE_COPY.startConfirm).toBe(SESSION_START_CONFIRM);
    expect(LIFECYCLE_COPY.endConfirm).toBe(SESSION_END_CONFIRM);
  });
});
