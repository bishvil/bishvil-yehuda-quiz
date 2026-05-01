import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthRole } from "@/src/lib/constants";

const claimsMock = vi.hoisted(() => vi.fn());

vi.mock("@/src/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      getClaims: claimsMock,
    },
  }),
}));

import {
  requireCronAuth,
  requireRole,
  timingSafeSecretMatch,
} from "@/src/lib/auth/server-auth";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cron auth", () => {
  it("compares equal-length cron secrets with timing-safe semantics", () => {
    expect(timingSafeSecretMatch("local-test-cron-secret", "local-test-cron-secret")).toBe(
      true,
    );
    expect(timingSafeSecretMatch("local-test-cron-secret", "local-test-cron-secreu")).toBe(
      false,
    );
  });

  it("rejects length-mismatched secrets before timing-safe comparison", () => {
    expect(timingSafeSecretMatch("short", "local-test-cron-secret")).toBe(false);
  });

  it("requires a matching bearer token", () => {
    process.env.CRON_SECRET = "local-test-cron-secret";

    const rejected = requireCronAuth(
      new Request("http://localhost/api/cron/expire-questions", {
        headers: { Authorization: "Bearer local-test-cron-secreu" },
      }),
    );
    const accepted = requireCronAuth(
      new Request("http://localhost/api/cron/expire-questions", {
        headers: { Authorization: "Bearer local-test-cron-secret" },
      }),
    );

    expect(rejected.ok).toBe(false);
    expect(accepted.ok).toBe(true);
  });
});

describe("requireRole", () => {
  it("allows admin claims to satisfy host requirements", async () => {
    claimsMock.mockResolvedValue({
      data: { claims: claimsForRole("admin") },
      error: null,
    });

    const result = await requireRole("host");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.role).toBe("admin");
    }
  });

  it("does not allow host claims to satisfy admin requirements", async () => {
    claimsMock.mockResolvedValue({
      data: { claims: claimsForRole("host") },
      error: null,
    });

    const result = await requireRole("admin");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  it("does not allow participant claims to satisfy host or admin requirements", async () => {
    claimsMock.mockResolvedValue({
      data: { claims: claimsForRole("participant") },
      error: null,
    });

    const hostResult = await requireRole("host");
    const adminResult = await requireRole("admin");

    expect(hostResult.ok).toBe(false);
    expect(adminResult.ok).toBe(false);
  });
});

function claimsForRole(role: AuthRole) {
  return {
    sub: "11111111-1111-4111-8111-111111111111",
    app_metadata: { role },
  };
}
