import { describe, expect, it } from "vitest";

import { buildParticipantQuestionPayload } from "@/src/lib/sessions/participant-payload";

describe("buildParticipantQuestionPayload", () => {
  it("strips stale image metadata from map questions", () => {
    const payload = buildParticipantQuestionPayload({
      ordinal: 1,
      totalQuestions: 1,
      question: {
        id: "q-map",
        type: "map",
        prompt: "איפה המקום?",
        options: null,
        map: {
          geo: {
            target: { lat: 31.6092, lng: 35.1014 },
            toleranceKm: 5,
          },
        },
        image_url: "https://example.com/test.png",
        image_alt: "A green test image",
        image_width: 640,
        image_height: 400,
        video_url: null,
        video_embed_url: null,
        video_provider: null,
        video_mime_type: null,
        video_duration_seconds: null,
        video_poster_url: null,
        video_width: null,
        video_height: null,
        media_lead_seconds: 0,
        time_seconds: 30,
        points: 10,
      },
      status: "answering",
      startedAt: null,
      deadlineAt: null,
      serverNow: new Date("2026-05-12T00:00:00.000Z"),
    });

    expect(payload).toMatchObject({
      type: "map",
      imageUrl: null,
      imageAlt: null,
      imageWidth: null,
      imageHeight: null,
    });
  });
});
