import { describe, expect, it } from "vitest";

import { normalizePhone } from "@/src/lib/auth/phone";

describe("normalizePhone", () => {
  it("canonicalizes Israeli mobile variants to E.164", () => {
    expect(normalizePhone("0501234567")).toBe("+972501234567");
    expect(normalizePhone("+972501234567")).toBe("+972501234567");
    expect(normalizePhone("972-50-123-4567")).toBe("+972501234567");
  });
});
