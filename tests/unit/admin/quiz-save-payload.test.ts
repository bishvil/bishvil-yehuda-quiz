import { describe, expect, it } from "vitest";

import {
  buildQuizSavePayload,
  type EditableQuiz,
} from "@/src/lib/admin/quiz-editor";
import { adminQuizUpdateSchema } from "@/src/lib/admin/validation";

const BASE_QUIZ: EditableQuiz = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "מסע בעקבות אבות האומה",
  brandId: "yehuda",
  defaultGameMode: "sync",
  customLogo: null,
  customLogoLabel: null,
  customLogoActive: false,
  joinFields: ["name", "phone"],
  archivedAt: null,
};

describe("buildQuizSavePayload (Wave-2 review M1)", () => {
  it("always sends brandId so brand changes auto-save persist", () => {
    const payload = buildQuizSavePayload({ ...BASE_QUIZ, brandId: "haari" });
    expect(payload.brandId).toBe("haari");
  });

  it("includes title, defaultGameMode and joinFields verbatim", () => {
    const payload = buildQuizSavePayload({
      ...BASE_QUIZ,
      title: "חידון מורשת",
      defaultGameMode: "async",
      joinFields: ["name", "phone", "unit"],
    });
    expect(payload).toMatchObject({
      title: "חידון מורשת",
      defaultGameMode: "async",
      joinFields: ["name", "phone", "unit"],
    });
  });

  it("forwards null for customLogo when the editor cleared it", () => {
    const payload = buildQuizSavePayload({ ...BASE_QUIZ, customLogo: null });
    expect(payload.customLogo).toBeNull();
    // The key MUST be present (omitting it would leave the DB value).
    expect(Object.prototype.hasOwnProperty.call(payload, "customLogo")).toBe(true);
  });

  it("forwards customLogoActive boolean", () => {
    const off = buildQuizSavePayload({ ...BASE_QUIZ, customLogoActive: false });
    expect(off.customLogoActive).toBe(false);
    const on = buildQuizSavePayload({ ...BASE_QUIZ, customLogoActive: true });
    expect(on.customLogoActive).toBe(true);
  });

  it("forwards null for customLogoLabel when the editor cleared it", () => {
    const payload = buildQuizSavePayload({
      ...BASE_QUIZ,
      customLogoLabel: null,
    });
    expect(payload.customLogoLabel).toBeNull();
    expect(
      Object.prototype.hasOwnProperty.call(payload, "customLogoLabel"),
    ).toBe(true);
  });

  it("forwards a populated logo url + label when set", () => {
    const payload = buildQuizSavePayload({
      ...BASE_QUIZ,
      customLogo: "https://example.com/logo.png",
      customLogoLabel: "גדוד 890",
    });
    expect(payload).toMatchObject({
      customLogo: "https://example.com/logo.png",
      customLogoLabel: "גדוד 890",
    });
  });
});

describe("adminQuizUpdateSchema (Wave-2 review M1)", () => {
  it("accepts explicit null for customLogo and customLogoLabel so they can be cleared", () => {
    const parsed = adminQuizUpdateSchema.safeParse({
      brandId: "yehuda",
      title: "חידון",
      defaultGameMode: "sync",
      customLogo: null,
      customLogoLabel: null,
      joinFields: ["name", "phone"],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.customLogo).toBeNull();
      expect(parsed.data.customLogoLabel).toBeNull();
    }
  });

  it("still rejects a non-url customLogo", () => {
    const parsed = adminQuizUpdateSchema.safeParse({
      customLogo: "not a url",
    });
    expect(parsed.success).toBe(false);
  });
});
