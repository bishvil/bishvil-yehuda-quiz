import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, quizRead, brandRead } = vi.hoisted(() => ({
  from: vi.fn(),
  quizRead: vi.fn(),
  brandRead: vi.fn(),
}));
vi.mock("@/src/lib/auth/server-auth", () => ({
  requireRole: vi.fn(async () => ({ ok: true, claims: { userId: "admin" } })),
}));
vi.mock("@/src/lib/supabase/server", () => ({
  createServiceRoleSupabaseClient: vi.fn(async () => ({ from })),
}));
import { GET } from "@/app/api/admin/quizzes/route";

const brand = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "yehuda",
  name: "בשביל יהודה",
  logo_url: "https://example.com/logo.png",
  primary_color: "#256331",
};
const quiz = {
  id: "q1",
  title: "מסלול",
  brand_id: brand.id,
  default_game_mode: "async",
  custom_logo_active: false,
  archived_at: null,
  created_at: "2026-11-10",
  questions: [{ count: 3 }],
  sessions: [{ count: 2 }],
};
beforeEach(() => {
  from.mockImplementation((table) =>
    table === "quizzes"
      ? { select: () => ({ order: quizRead }) }
      : { select: brandRead },
  );
  quizRead.mockResolvedValue({
    data: [
      quiz,
      { ...quiz, id: "q2", brand_id: brand.slug },
      { ...quiz, id: "q3", brand_id: "missing-brand" },
    ],
    error: null,
  });
  brandRead.mockResolvedValue({ data: [brand], error: null });
});

describe("admin quiz list brand metadata", () => {
  it("resolves UUID and legacy slug brands to the same name, logo and filter key", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    for (const row of body.quizzes.slice(0, 2)) {
      expect(row).toMatchObject({
        brandName: brand.name,
        brandLogoUrl: brand.logo_url,
        brandPrimary: brand.primary_color,
        brandKey: brand.slug,
        questionCount: 3,
        sessionCount: 2,
      });
    }
    expect(body.quizzes[2]).toMatchObject({
      brandName: "מותג כללי",
      brandLogoUrl: null,
    });
  });
  it("returns a read failure when brand resolution fails, rather than showing misleading defaults", async () => {
    brandRead.mockResolvedValue({ data: null, error: { message: "offline" } });
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: "READ_FAILED" });
  });
});
