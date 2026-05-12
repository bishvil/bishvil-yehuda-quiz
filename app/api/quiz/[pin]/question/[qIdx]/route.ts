import { type NextRequest } from "next/server";

import { PUBLIC_QUESTION_CONTENT_CACHE_HEADER } from "@/src/lib/constants";
import { publicCachedJson } from "@/src/lib/http/responses";
import { validateStoredQuestionContent } from "@/src/lib/schemas/question-content";
import { findPublicSessionByPin } from "@/src/lib/sessions/lookup";
import { writeLog } from "@/src/lib/logging";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";
import type { QuestionTypeEnum } from "@/src/lib/supabase/database.types";

interface PublicQuestionRouteContext {
  params: Promise<{ pin: string; qIdx: string }>;
}

interface PublicQuestionSuccessBody {
  index: number;
  type: QuestionTypeEnum;
  prompt: string;
  options: Array<{ id: string; text: string; image_url?: string }> | null;
  imageUrl: string | null;
  imageAlt: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  /**
   * Public-safe slice. The correct target lives in the reveal payload
   * (ADR-0008 §2). The geo `target` is stripped here (ADR-0011 §6.1).
   */
  map: {
    geo: {
      center?: { lat: number; lng: number };
      zoom?: number;
      toleranceKm: number;
      styleHint?: "maptiler-streets" | "israel-hiking" | "osm-liberty";
    };
  } | null;
  timeSeconds: number;
  points: number;
}

interface PublicQuestionErrorBody {
  error: "SESSION_NOT_FOUND" | "QUESTION_NOT_FOUND" | "INVALID_INDEX";
  message: string;
}

type PublicQuestionResponseBody =
  | PublicQuestionSuccessBody
  | PublicQuestionErrorBody;

export async function GET(
  _request: NextRequest,
  context: PublicQuestionRouteContext,
) {
  const { pin, qIdx } = await context.params;
  const ordinal = Number.parseInt(qIdx, 10);

  if (!Number.isFinite(ordinal) || ordinal < 1) {
    return publicCachedJson<PublicQuestionResponseBody>(
      {
        error: "INVALID_INDEX",
        message: "Question index must be a positive integer.",
      },
      { status: 400, cacheControl: PUBLIC_QUESTION_CONTENT_CACHE_HEADER },
    );
  }

  const serviceSupabase = await createServiceRoleSupabaseClient();
  const { data: session } = await findPublicSessionByPin(serviceSupabase, pin);

  if (!session) {
    return publicCachedJson<PublicQuestionResponseBody>(
      {
        error: "SESSION_NOT_FOUND",
        message: "No session exists for this PIN.",
      },
      { status: 404, cacheControl: PUBLIC_QUESTION_CONTENT_CACHE_HEADER },
    );
  }

  const { data: question } = await serviceSupabase
    .from("questions")
    .select(
      "type, prompt, options, map, image_url, image_alt, image_width, image_height, time_seconds, points",
    )
    .eq("quiz_id", session.quiz_id)
    .eq("ordinal", ordinal)
    .maybeSingle();

  if (!question) {
    return publicCachedJson<PublicQuestionResponseBody>(
      {
        error: "QUESTION_NOT_FOUND",
        message: "Question not found in this quiz.",
      },
      { status: 404, cacheControl: PUBLIC_QUESTION_CONTENT_CACHE_HEADER },
    );
  }

  const parsedContent = validateStoredQuestionContent({
    type: question.type,
    options: question.options,
    map: question.map,
  });

  if (!parsedContent.success) {
    writeLog({
      level: "error",
      message: "Stored question JSON failed public serialization",
      context: {
        pin,
        quizId: session.quiz_id,
        ordinal,
        issues: JSON.stringify(parsedContent.issues),
      },
    });

    return publicCachedJson<PublicQuestionResponseBody>(
      {
        error: "QUESTION_NOT_FOUND",
        message: "Question content is unavailable.",
      },
      { status: 404, cacheControl: PUBLIC_QUESTION_CONTENT_CACHE_HEADER },
    );
  }

  const options =
    parsedContent.data.options?.map((option) => ({
      id: option.id,
      text: option.text,
      image_url: option.image_url,
    })) ?? null;

  // ADR-0008 §2: never expose `target` coordinates pre-reveal — strip the
  // geo target. ADR-0011 §6.1.
  const parsedMap = parsedContent.data.map;
  const mapPayload: PublicQuestionSuccessBody["map"] = parsedMap
    ? {
        geo: {
          center: parsedMap.geo.center,
          zoom: parsedMap.geo.zoom,
          toleranceKm: parsedMap.geo.toleranceKm,
          styleHint: parsedMap.geo.styleHint,
        },
      }
    : null;

  return publicCachedJson<PublicQuestionResponseBody>(
    {
      index: ordinal,
      type: question.type,
      prompt: question.prompt,
      options,
      imageUrl: question.type === "image" ? question.image_url : null,
      imageAlt: question.type === "image" ? question.image_alt : null,
      imageWidth: question.type === "image" ? question.image_width : null,
      imageHeight: question.type === "image" ? question.image_height : null,
      map: mapPayload,
      timeSeconds: question.time_seconds,
      points: question.points,
    },
    { cacheControl: PUBLIC_QUESTION_CONTENT_CACHE_HEADER },
  );
}
