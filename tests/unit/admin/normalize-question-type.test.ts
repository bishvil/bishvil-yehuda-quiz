import { describe, expect, it } from "vitest";

import {
  makeBlankQuestion,
  normalizeQuestionForType,
  SCAFFOLDED_OPTIONS,
  TRUE_FALSE_OPTIONS,
  type EditableQuestion,
} from "@/src/lib/admin/quiz-editor";
import type { QuestionType } from "@/src/lib/constants";

const SEED_GEO_MAP = {
  geo: {
    target: { lat: 31.5, lng: 34.9 } as const,
    toleranceKm: 5,
  },
} as const;

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
      expect(next.map).toEqual({
        geo: {
          target: { lat: 31.5, lng: 34.9 },
          toleranceKm: 5,
        },
      });
    });

    it("re-seeds the default map after a no-op chain through another type", () => {
      const map: EditableQuestion = withOverrides({
        type: "map",
        options: null,
        correctIds: [],
        map: { ...SEED_GEO_MAP },
      });
      const single = normalizeQuestionForType(map, "single");
      expect(single.map).toBeNull();
      const back = normalizeQuestionForType(single, "map");
      expect(back.map).toEqual({
        geo: {
          target: { lat: 31.5, lng: 34.9 },
          toleranceKm: 5,
        },
      });
    });
  });

  describe("← map", () => {
    it("clears map when leaving map for any other type", () => {
      const seeded = withOverrides({
        type: "map",
        options: null,
        correctIds: [],
        map: { ...SEED_GEO_MAP },
      });
      for (const target of ["single", "multi", "image", "truefalse"] as const) {
        const next = normalizeQuestionForType(seeded, target);
        expect(next.map, `${target} map`).toBeNull();
      }
    });

    it("scaffolds default options when leaving map → choice with no prior options", () => {
      const seeded = withOverrides({
        type: "map",
        options: null,
        correctIds: [],
        map: { ...SEED_GEO_MAP },
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
    it("preserves imageUrl across choice ↔ image transitions and clears map", () => {
      const seeded = withOverrides({
        type: "single",
        imageUrl: null,
        map: { ...SEED_GEO_MAP },
      });
      const next = normalizeQuestionForType(seeded, "image");
      expect(next.type).toBe("image");
      expect(next.map).toBeNull();
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

    it("clears map and imageUrl on the way in", () => {
      const seeded = withOverrides({
        type: "map",
        options: null,
        correctIds: [],
        map: { ...SEED_GEO_MAP },
      });
      const next = normalizeQuestionForType(seeded, "truefalse");
      expect(next.map).toBeNull();
      expect(next.imageUrl).toBeNull();
      expect(next.options).toEqual(TRUE_FALSE_OPTIONS);
    });
  });

  describe("round-trip exhaustiveness", () => {
    const types: QuestionType[] = [
      "single",
      "multi",
      "truefalse",
      "image",
      "video",
      "map",
    ];
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
      video: withOverrides({
        type: "video",
        correctIds: ["a"],
        videoUrl: "https://example.com/p.mp4",
        videoProvider: "self",
        videoMimeType: "video/mp4",
        videoDurationSeconds: 20,
        mediaLeadSeconds: 20,
      }),
      map: withOverrides({
        type: "map",
        options: null,
        correctIds: [],
        map: { ...SEED_GEO_MAP },
      }),
    };

    for (const from of types) {
      for (const to of types) {
        if (from === to) continue;
        it(`${from} → ${to}: stale fields stripped`, () => {
          const next = normalizeQuestionForType(sources[from], to);
          expect(next.type).toBe(to);
          if (to !== "image") expect(next.imageUrl).toBeNull();
          if (to !== "video") {
            expect(next.videoUrl).toBeNull();
            expect(next.videoEmbedUrl).toBeNull();
            expect(next.videoProvider).toBeNull();
            expect(next.videoMimeType).toBeNull();
            expect(next.videoDurationSeconds).toBeNull();
            expect(next.videoPosterUrl).toBeNull();
            expect(next.videoPosterPath).toBeNull();
            expect(next.videoWidth).toBeNull();
            expect(next.videoHeight).toBeNull();
            expect(next.videoPath).toBeNull();
            expect(next.mediaLeadSeconds).toBe(0);
          }
          if (to !== "map") {
            expect(next.map).toBeNull();
          }
          if (to === "map") {
            expect(next.options).toBeNull();
            expect(next.correctIds).toEqual([]);
          } else {
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

  describe("→ video", () => {
    it("scaffolds options + carries video fields verbatim from a non-video source", () => {
      const single = withOverrides({
        type: "single",
        correctIds: ["a"],
        // Stale-leftover video fields shouldn't survive a non-video source —
        // but if they did somehow leak in, they'd carry forward into video.
        videoUrl: "https://example.com/clip.mp4",
        videoProvider: "self",
        videoMimeType: "video/mp4",
        mediaLeadSeconds: 18,
      });
      const next = normalizeQuestionForType(single, "video");
      expect(next.type).toBe("video");
      expect(next.options?.length ?? 0).toBeGreaterThan(0);
      expect(next.imageUrl).toBeNull();
      expect(next.map).toBeNull();
      expect(next.videoUrl).toBe("https://example.com/clip.mp4");
      expect(next.videoProvider).toBe("self");
      expect(next.videoMimeType).toBe("video/mp4");
      expect(next.mediaLeadSeconds).toBe(18);
    });

    it("from image → video: imageUrl wiped, options carried", () => {
      const image = withOverrides({
        type: "image",
        correctIds: ["b"],
        imageUrl: "https://example.com/p.jpg",
        imageAlt: "תיאור",
      });
      const next = normalizeQuestionForType(image, "video");
      expect(next.type).toBe("video");
      expect(next.imageUrl).toBeNull();
      expect(next.imageAlt).toBeNull();
      expect(next.correctIds).toEqual(["b"]);
    });
  });
});
