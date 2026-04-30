import { describe, expect, it } from "vitest";

import { getRoleFromClaims } from "@/src/lib/supabase/middleware";

describe("middleware role claims", () => {
  it("accepts host and admin roles from app metadata", () => {
    expect(getRoleFromClaims({ app_metadata: { role: "host" } })).toBe("host");
    expect(getRoleFromClaims({ app_metadata: { role: "admin" } })).toBe("admin");
  });

  it("rejects missing or unrecognized roles", () => {
    expect(getRoleFromClaims(null)).toBeNull();
    expect(getRoleFromClaims({ app_metadata: { role: "owner" } })).toBeNull();
  });
});
