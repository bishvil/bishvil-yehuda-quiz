/**
 * Video-specific assertions for `normalizeQuestionForType`. The general
 * round-trip exhaustiveness test in `normalize-question-type.test.ts`
 * already covers most stripping; these tests focus on the cases the
 * `video` type itself introduces.
 */
import { describe, expect, it } from "vitest";

import {
  makeBlankQuestion,
  normalizeQuestionForType,
  type EditableQuestion,
} from "@/src/lib/admin/quiz-editor";
import type { QuestionType } from "@/src/lib/constants";

function withVideo(
  overrides: Partial<EditableQuestion> = {},
): EditableQuestion {
  return {
    ...makeBlankQuestion(1),
    type: "video",
    videoUrl: "https://cdn.example.com/question-videos/admin/clip.mp4",
    videoPath: "admin/clip.mp4",
    videoProvider: "self",
    videoMimeType: "video/mp4",
    videoDurationSeconds: 23,
    videoPosterUrl: "https://cdn.example.com/question-images/admin/poster.webp",
    videoPosterPath: "admin/poster.webp",
    videoWidth: 1920,
    videoHeight: 1080,
    mediaLeadSeconds: 23,
    ...overrides,
  };
}

const NON_VIDEO_TYPES: QuestionType[] = [
  "single",
  "multi",
  "truefalse",
  "image",
  "map",
];

describe("normalizeQuestionForType — video type", () => {
  for (const to of NON_VIDEO_TYPES) {
    it(`video → ${to} strips every video field`, () => {
      const source = withVideo();
      const next = normalizeQuestionForType(source, to);

      expect(next.type).toBe(to);
      expect(next.videoUrl).toBeNull();
      expect(next.videoPath).toBeNull();
      expect(next.videoEmbedUrl).toBeNull();
      expect(next.videoProvider).toBeNull();
      expect(next.videoMimeType).toBeNull();
      expect(next.videoDurationSeconds).toBeNull();
      expect(next.videoPosterUrl).toBeNull();
      expect(next.videoPosterPath).toBeNull();
      expect(next.videoWidth).toBeNull();
      expect(next.videoHeight).toBeNull();
      expect(next.mediaLeadSeconds).toBe(0);
    });
  }

  it("non-video → video carries video fields verbatim, scaffolds options", () => {
    // Stale leftover video fields on a single-type row (would normally be
    // wiped by the previous transition into `single`, but test the carry).
    const single: EditableQuestion = {
      ...makeBlankQuestion(1),
      type: "single",
      correctIds: ["b"],
      videoUrl: "https://example.com/clip.mp4",
      videoProvider: "self",
      videoMimeType: "video/mp4",
      videoDurationSeconds: 18,
      videoWidth: 1280,
      videoHeight: 720,
      mediaLeadSeconds: 18,
    };

    const next = normalizeQuestionForType(single, "video");

    expect(next.type).toBe("video");
    expect(next.options?.length ?? 0).toBeGreaterThan(0);
    expect(next.correctIds).toEqual(["b"]);
    expect(next.imageUrl).toBeNull();
    expect(next.map).toBeNull();
    expect(next.videoUrl).toBe("https://example.com/clip.mp4");
    expect(next.videoProvider).toBe("self");
    expect(next.videoMimeType).toBe("video/mp4");
    expect(next.videoDurationSeconds).toBe(18);
    expect(next.videoWidth).toBe(1280);
    expect(next.videoHeight).toBe(720);
    expect(next.mediaLeadSeconds).toBe(18);
  });

  it("preserves YouTube embed fields when entering the video type", () => {
    const source: EditableQuestion = {
      ...makeBlankQuestion(1),
      type: "single",
      videoEmbedUrl:
        "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1",
      videoProvider: "youtube",
      mediaLeadSeconds: 30,
    };

    const next = normalizeQuestionForType(source, "video");
    expect(next.videoEmbedUrl).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1",
    );
    expect(next.videoProvider).toBe("youtube");
    expect(next.mediaLeadSeconds).toBe(30);
  });

  it("makeBlankQuestion initialises all video fields to null/0", () => {
    const q = makeBlankQuestion(1);
    expect(q.videoUrl).toBeNull();
    expect(q.videoPath).toBeNull();
    expect(q.videoEmbedUrl).toBeNull();
    expect(q.videoProvider).toBeNull();
    expect(q.videoMimeType).toBeNull();
    expect(q.videoDurationSeconds).toBeNull();
    expect(q.videoPosterUrl).toBeNull();
    expect(q.videoPosterPath).toBeNull();
    expect(q.videoWidth).toBeNull();
    expect(q.videoHeight).toBeNull();
    expect(q.mediaLeadSeconds).toBe(0);
  });
});
