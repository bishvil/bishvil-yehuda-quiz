import { describe, expect, it } from "vitest";

import {
  isQuizTitleValid,
  makeBlankQuestion,
  validateQuestions,
  type EditableQuestion,
} from "@/src/lib/admin/quiz-editor";

function withOverrides(overrides: Partial<EditableQuestion>): EditableQuestion {
  return { ...makeBlankQuestion(1), ...overrides };
}

describe("validateQuestions", () => {
  it("flags an empty prompt", () => {
    const findings = validateQuestions([withOverrides({ prompt: "   " })]);
    expect(findings.some((f) => f.field === "prompt")).toBe(true);
  });

  it("flags a single-choice question with multiple correct answers", () => {
    const findings = validateQuestions([
      withOverrides({
        type: "single",
        correctIds: ["a", "b"],
      }),
    ]);
    expect(findings.some((f) => f.field === "correct")).toBe(true);
  });

  it("flags an image question without an image url", () => {
    const findings = validateQuestions([
      withOverrides({ type: "image", imageUrl: null }),
    ]);
    expect(findings.some((f) => f.field === "image")).toBe(true);
  });

  it("flags a map question without a map", () => {
    const findings = validateQuestions([
      withOverrides({
        type: "map",
        options: null,
        correctIds: [],
        map: null,
      }),
    ]);
    expect(findings.some((f) => f.field === "map")).toBe(true);
  });

  it("accepts a valid single-choice question silently", () => {
    expect(validateQuestions([makeBlankQuestion(1)])).toEqual([]);
  });
});

describe("isQuizTitleValid", () => {
  it("rejects empty titles", () => {
    expect(isQuizTitleValid("   ")).toBe(false);
  });

  it("accepts a normal Hebrew title", () => {
    expect(isQuizTitleValid("חידון מורשת")).toBe(true);
  });

  it("rejects titles longer than the cap", () => {
    expect(isQuizTitleValid("a".repeat(120))).toBe(false);
  });
});
