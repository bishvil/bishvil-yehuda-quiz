import { describe, expect, it } from "vitest";

import {
  buildParticipantAnswerPayload,
  buildParticipantQuestionPayload,
} from "@/src/lib/sessions/participant-payload";
import type { Database } from "@/src/lib/supabase/database.types";

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

describe("buildParticipantAnswerPayload", () => {
  it("includes elapsed answer seconds when timing context is available", () => {
    const payload = buildParticipantAnswerPayload(
      {
        id: "answer-1",
        session_id: "session-1",
        question_id: "question-1",
        participant_id: "participant-1",
        submitted_at: "2026-05-12T00:00:18.100Z",
        selected_ids: ["a"],
        pin_lat: null,
        pin_lng: null,
        is_correct: true,
        time_bonus: 10,
        score: 100,
        distance_km: null,
        correctness_ratio: null,
      } satisfies Database["public"]["Tables"]["answers"]["Row"],
      true,
      {
        deadlineAt: "2026-05-12T00:00:45.000Z",
        timeSeconds: 45,
      },
    );

    expect(payload).toMatchObject({
      status: "revealed",
      answerSeconds: 19,
      score: 100,
    });
  });
});
