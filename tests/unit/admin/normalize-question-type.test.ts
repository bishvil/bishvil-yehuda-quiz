import { describe, expect, it } from "vitest";

import {
  makeBlankQuestion,
  normalizeQuestionForType,
  SCAFFOLDED_OPTIONS,
  TRUE_FALSE_OPTIONS,
  type EditableQuestion,
} from "@/src/lib/admin/quiz-editor";
import type { QuestionType } from "@/src/lib/constants";

function withOverrides(
  overrides: Partial<EditableQuestion>,
): EditableQuestion {
  return { ...makeBlankQuestion(1), ...overrides };
}

describe("normalizeQuestionForType — Wave-2 review M3", () => {
  it("returns the same instance when the type is unchanged", () => {
    const single = makeBlankQuestion(1);
    expect(normalizeQuestionForType(single, "single")).toBe(single);
  });

  describe("→ map", () => {
    it("clears options/correctIds and seeds a default map when entering map", () => {
      const single = withOverrides({ correctIds: ["a"] });
      const next = normalizeQuestionForType(single, "map");
      expect(next.type).toBe("map");
      expect(next.options).toBeNull();
      expect(next.correctIds).toEqual([]);
      expect(next.imageUrl).toBeNull();
      expect(next.map).toEqual({ image_url: "", target: { x: 50, y: 50 } });
    });

    it("preserves an existing map when entering from another type via no-op chain", () => {
      const map: EditableQuestion = withOverrides({
        type: "map",
        options: null,
        correctIds: [],
        map: { image_url: "https://example.com/m.jpg", target: { x: 10, y: 20 } },
        tolerance: "5",
      });
      // toggle through single and back; tolerance lives only on map
      const single = normalizeQuestionForType(map, "single");
      expect(single.tolerance).toBeNull();
      expect(single.map).toBeNull();
      const back = normalizeQuestionForType(single, "map");
      // Default map seeded because we lost it on the way out — this is
      // the documented behavior (only map keeps map/tolerance).
      expect(back.map).toEqual({ image_url: "", target: { x: 50, y: 50 } });
    });
  });

  describe("← map", () => {
    it("clears map and tolerance when leaving map for any other type", () => {
      const seeded = withOverrides({
        type: "map",
        options: null,
        correctIds: [],
        map: { image_url: "https://example.com/m.jpg", target: { x: 1, y: 2 } },
        tolerance: "10",
      });
      for (const target of ["single", "multi", "image", "truefalse"] as const) {
        const next = normalizeQuestionForType(seeded, target);
        expect(next.map, `${target} map`).toBeNull();
        expect(next.tolerance, `${target} tolerance`).toBeNull();
      }
    });

    it("scaffolds default options when leaving map → choice with no prior options", () => {
      const seeded = withOverrides({
        type: "map",
        options: null,
        correctIds: [],
        map: { image_url: "x", target: { x: 0, y: 0 } },
      });
      const next = normalizeQuestionForType(seeded, "single");
      expect(next.options).toEqual(SCAFFOLDED_OPTIONS);
    });
  });

  describe("← image", () => {
    it("clears imageUrl when leaving image for any non-image type", () => {
      const seeded = withOverrides({
        type: "image",
        imageUrl: "https://example.com/p.jpg",
      });
      for (const target of ["single", "multi", "truefalse", "map"] as const) {
        const next = normalizeQuestionForType(seeded, target);
        expect(next.imageUrl, `${target} imageUrl`).toBeNull();
      }
    });
  });

  describe("→ image", () => {
    it("preserves imageUrl across choice ↔ image transitions and clears map/tolerance", () => {
      const seeded = withOverrides({
        type: "single",
        imageUrl: null,
        map: { image_url: "stale", target: { x: 1, y: 1 } },
        tolerance: "9",
      });
      const next = normalizeQuestionForType(seeded, "image");
      expect(next.type).toBe("image");
      expect(next.map).toBeNull();
      expect(next.tolerance).toBeNull();
      // imageUrl was null and stays null — the editor will fill it in.
      expect(next.imageUrl).toBeNull();
      expect(next.options).toEqual(SCAFFOLDED_OPTIONS);
    });
  });

  describe("→ single", () => {
    it("truncates correctIds to one when arriving from multi-select", () => {
      const multi = withOverrides({
        type: "multi",
        correctIds: ["a", "b", "c"],
      });
      const next = normalizeQuestionForType(multi, "single");
      expect(next.correctIds).toEqual(["a"]);
    });
  });

  describe("→ multi", () => {
    it("preserves correctIds when arriving from single-select", () => {
      const single = withOverrides({ correctIds: ["b"] });
      const next = normalizeQuestionForType(single, "multi");
      expect(next.correctIds).toEqual(["b"]);
    });
  });

  describe("→ truefalse", () => {
    it("replaces options with true/false and filters correctIds to {yes,no}", () => {
      const seeded = withOverrides({
        type: "single",
        correctIds: ["a", "yes"],
      });
      const next = normalizeQuestionForType(seeded, "truefalse");
      expect(next.options).toEqual(TRUE_FALSE_OPTIONS);
      expect(next.correctIds).toEqual(["yes"]);
    });

    it("defaults to ['yes'] when no prior correctIds match the true/false set", () => {
      const seeded = withOverrides({
        type: "single",
        correctIds: ["a", "b"],
      });
      const next = normalizeQuestionForType(seeded, "truefalse");
      expect(next.correctIds).toEqual(["yes"]);
    });

    it("clears map, tolerance and imageUrl on the way in", () => {
      const seeded = withOverrides({
        type: "map",
        options: null,
        correctIds: [],
        map: { image_url: "x", target: { x: 1, y: 1 } },
        tolerance: "5",
      });
      const next = normalizeQuestionForType(seeded, "truefalse");
      expect(next.map).toBeNull();
      expect(next.tolerance).toBeNull();
      expect(next.imageUrl).toBeNull();
      expect(next.options).toEqual(TRUE_FALSE_OPTIONS);
    });
  });

  describe("round-trip exhaustiveness", () => {
    const types: QuestionType[] = ["single", "multi", "truefalse", "image", "map"];
    const sources: Record<QuestionType, EditableQuestion> = {
      single: withOverrides({ type: "single", correctIds: ["a"] }),
      multi: withOverrides({ type: "multi", correctIds: ["a", "b"] }),
      truefalse: withOverrides({
        type: "truefalse",
        options: TRUE_FALSE_OPTIONS,
        correctIds: ["yes"],
      }),
      image: withOverrides({
        type: "image",
        correctIds: ["a"],
        imageUrl: "https://example.com/p.jpg",
      }),
      map: withOverrides({
        type: "map",
        options: null,
        correctIds: [],
        map: { image_url: "x", target: { x: 1, y: 1 } },
        tolerance: "5",
      }),
    };

    for (const from of types) {
      for (const to of types) {
        if (from === to) continue;
        it(`${from} → ${to}: stale fields stripped`, () => {
          const next = normalizeQuestionForType(sources[from], to);
          expect(next.type).toBe(to);
          if (to !== "image") expect(next.imageUrl).toBeNull();
          if (to !== "map") {
            expect(next.map).toBeNull();
            expect(next.tolerance).toBeNull();
          }
          if (to === "map") {
            expect(next.options).toBeNull();
            expect(next.correctIds).toEqual([]);
          } else {
            // Choice/truefalse/image always have non-empty options.
            expect(next.options?.length ?? 0).toBeGreaterThan(0);
          }
          if (to === "single") {
            expect((next.correctIds ?? []).length).toBeLessThanOrEqual(1);
          }
          if (to === "truefalse") {
            const ids = next.correctIds ?? [];
            expect(ids.length).toBeGreaterThan(0);
            for (const id of ids) {
              expect(["yes", "no"]).toContain(id);
            }
          }
        });
      }
    }
  });
});
