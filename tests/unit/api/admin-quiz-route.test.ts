import { afterAll, describe, expect, it, vi } from "vitest";

import { getTestPostgres, SEED_ADMIN_ID } from "./test-db";

vi.mock("@/src/lib/auth/server-auth", async () => {
  const actual = await vi.importActual<
    typeof import("@/src/lib/auth/server-auth")
  >("@/src/lib/auth/server-auth");
  return {
    ...actual,
    requireRole: vi.fn(async () => ({
      ok: true,
      claims: {
        userId: SEED_ADMIN_ID,
        role: "admin",
        sessionId: null,
        participantId: null,
      },
    })),
  };
});

const sql = getTestPostgres();
const cleanupQuizIds: string[] = [];

afterAll(async () => {
  for (const quizId of cleanupQuizIds) {
    await sql`delete from public.quizzes where id = ${quizId}::uuid`;
  }
  await sql.end();
});

async function callPut(
  id: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const { PUT } = await import("@/app/api/admin/quizzes/[id]/route");
  const request = new Request(`http://localhost:3000/api/admin/quizzes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof PUT>[0];
  const context = {
    params: Promise.resolve({ id }),
  } as Parameters<typeof PUT>[1];
  const response = await PUT(request, context);
  return { status: response.status, body: await response.json() };
}

async function seedQuizWithCustomLogo(): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into public.quizzes (
      owner_id, brand_id, title, default_game_mode,
      custom_logo, custom_logo_label
    ) values (
      ${SEED_ADMIN_ID}::uuid,
      'yehuda',
      'M1 logo-clear fixture',
      'sync',
      'https://example.com/logo.png',
      'גדוד 890'
    )
    returning id
  `;
  if (!row) throw new Error("Failed to seed quiz fixture.");
  cleanupQuizIds.push(row.id);
  return row.id;
}

describe("PUT /api/admin/quizzes/[id] — null clears custom logo (Wave-2 review M1)", () => {
  it("persists explicit null for customLogo and customLogoLabel so the editor can clear them", async () => {
    const quizId = await seedQuizWithCustomLogo();

    const result = await callPut(quizId, {
      brandId: "yehuda",
      title: "M1 logo-clear fixture",
      defaultGameMode: "sync",
      customLogo: null,
      customLogoLabel: null,
      joinFields: ["name", "phone"],
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      quiz: { customLogo: null, customLogoLabel: null },
    });

    const [row] = await sql<{
      custom_logo: string | null;
      custom_logo_label: string | null;
    }[]>`
      select custom_logo, custom_logo_label
      from public.quizzes
      where id = ${quizId}::uuid
    `;
    expect(row?.custom_logo).toBeNull();
    expect(row?.custom_logo_label).toBeNull();
  });

  it("persists brandId so an auto-saved brand change is not silently dropped", async () => {
    const quizId = await seedQuizWithCustomLogo();

    const result = await callPut(quizId, {
      brandId: "haari",
      title: "M1 brand-change fixture",
      defaultGameMode: "sync",
      customLogo: null,
      customLogoLabel: null,
      joinFields: ["name", "phone"],
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ quiz: { brandId: "haari" } });

    const [row] = await sql<{ brand_id: string }[]>`
      select brand_id from public.quizzes where id = ${quizId}::uuid
    `;
    expect(row?.brand_id).toBe("haari");
  });
});
