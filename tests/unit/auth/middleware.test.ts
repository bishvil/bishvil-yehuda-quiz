import { describe, expect, it } from "vitest";

import {
  canAccessProtectedPath,
  getRoleFromClaims,
} from "@/src/lib/supabase/middleware";

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

describe("middleware protected path access", () => {
  it("allows admin claims through host and admin paths", () => {
    expect(canAccessProtectedPath("admin", "/host/123456")).toBe(true);
    expect(canAccessProtectedPath("admin", "/admin/quizzes")).toBe(true);
  });

  it("allows host claims through host paths but not admin paths", () => {
    expect(canAccessProtectedPath("host", "/host/123456")).toBe(true);
    expect(canAccessProtectedPath("host", "/admin/quizzes")).toBe(false);
  });
});
