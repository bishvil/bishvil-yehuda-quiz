import { describe, expect, it } from "vitest";

import { requireCronAuth, timingSafeSecretMatch } from "@/src/lib/auth/server-auth";

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
