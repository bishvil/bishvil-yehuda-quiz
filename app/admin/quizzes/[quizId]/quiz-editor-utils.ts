import type {
  AdminQuestionCreateRequest,
  AdminQuestionListItem,
  AdminQuestionUpdateRequest,
} from "@/src/lib/admin/api-client";
import {
  nextClientId,
  type EditableQuestion,
} from "@/src/lib/admin/quiz-editor";

export type QuizEditorStatus = "loading" | "ready" | "error";
export type QuizEditorMobileView = "list" | "edit";

export function rowToEditable(row: AdminQuestionListItem): EditableQuestion {
  return {
    id: row.id,
    clientId: nextClientId(),
    ordinal: row.ordinal,
    type: row.type,
    prompt: row.prompt,
    options: row.options ?? null,
    correctIds: row.correctIds ?? null,
    map: row.map ?? null,
    imageUrl: row.imageUrl ?? null,
    imageAlt: row.imageAlt ?? null,
    imageWidth: row.imageWidth ?? null,
    imageHeight: row.imageHeight ?? null,
    imagePath: row.imagePath ?? null,
    explanation: row.explanation ?? null,
    timeSeconds: row.timeSeconds,
    points: row.points,
    videoUrl: row.videoUrl ?? null,
    videoPath: row.videoPath ?? null,
    videoEmbedUrl: row.videoEmbedUrl ?? null,
    videoProvider: row.videoProvider ?? null,
    videoMimeType: row.videoMimeType ?? null,
    videoDurationSeconds: row.videoDurationSeconds ?? null,
    videoPosterUrl: row.videoPosterUrl ?? null,
    videoPosterPath: row.videoPosterPath ?? null,
    videoWidth: row.videoWidth ?? null,
    videoHeight: row.videoHeight ?? null,
    mediaLeadSeconds: row.mediaLeadSeconds ?? 0,
  };
}

export function buildQuestionCreateRequest(
  q: EditableQuestion,
): AdminQuestionCreateRequest {
  return {
    ordinal: q.ordinal,
    type: q.type,
    prompt: q.prompt,
    ...(q.options ? { options: q.options } : {}),
    ...(q.correctIds ? { correctIds: q.correctIds } : {}),
    ...(q.map ? { map: q.map } : {}),
    ...(q.imageUrl ? { imageUrl: q.imageUrl } : {}),
    ...(q.imageAlt ? { imageAlt: q.imageAlt } : {}),
    ...(q.imageWidth != null ? { imageWidth: q.imageWidth } : {}),
    ...(q.imageHeight != null ? { imageHeight: q.imageHeight } : {}),
    ...(q.imagePath ? { imagePath: q.imagePath } : {}),
    ...(q.explanation ? { explanation: q.explanation } : {}),
    ...(q.videoUrl ? { videoUrl: q.videoUrl } : {}),
    ...(q.videoPath ? { videoPath: q.videoPath } : {}),
    ...(q.videoEmbedUrl ? { videoEmbedUrl: q.videoEmbedUrl } : {}),
    ...(q.videoProvider ? { videoProvider: q.videoProvider } : {}),
    ...(q.videoMimeType ? { videoMimeType: q.videoMimeType } : {}),
    ...(q.videoDurationSeconds != null
      ? { videoDurationSeconds: q.videoDurationSeconds }
      : {}),
    ...(q.videoPosterUrl ? { videoPosterUrl: q.videoPosterUrl } : {}),
    ...(q.videoWidth != null ? { videoWidth: q.videoWidth } : {}),
    ...(q.videoHeight != null ? { videoHeight: q.videoHeight } : {}),
    mediaLeadSeconds: q.mediaLeadSeconds,
    timeSeconds: q.timeSeconds,
    points: q.points,
  };
}

export function buildQuestionUpdateRequest(
  q: EditableQuestion,
): AdminQuestionUpdateRequest {
  return {
    ordinal: q.ordinal,
    type: q.type,
    prompt: q.prompt,
    options: q.options ?? undefined,
    correctIds: q.correctIds ?? undefined,
    map: q.map ?? undefined,
    imageUrl: q.imageUrl ?? undefined,
    imageAlt: q.imageAlt ?? undefined,
    imageWidth: q.imageWidth ?? undefined,
    imageHeight: q.imageHeight ?? undefined,
    imagePath: q.imagePath ?? undefined,
    explanation: q.explanation ?? undefined,
    videoUrl: q.videoUrl,
    videoPath: q.videoPath,
    videoEmbedUrl: q.videoEmbedUrl,
    videoProvider: q.videoProvider,
    videoMimeType: q.videoMimeType,
    videoDurationSeconds: q.videoDurationSeconds,
    videoPosterUrl: q.videoPosterUrl,
    videoWidth: q.videoWidth,
    videoHeight: q.videoHeight,
    mediaLeadSeconds: q.mediaLeadSeconds,
    timeSeconds: q.timeSeconds,
    points: q.points,
  };
}

export function isOrdinalOnlyChange(
  prev: EditableQuestion[] | null,
  next: EditableQuestion[],
): boolean {
  if (!prev || prev.length !== next.length || next.some((q) => q.id === null)) {
    return false;
  }

  const prevById = new Map<string, EditableQuestion>();
  for (const row of prev) {
    if (row.id === null) return false;
    prevById.set(row.id, row);
  }

  let ordinalDiff = false;
  for (const row of next) {
    const prevRow = prevById.get(row.id!);
    if (!prevRow) return false;
    if (prevRow.ordinal !== row.ordinal) ordinalDiff = true;
    if (
      prevRow.type !== row.type ||
      prevRow.prompt !== row.prompt ||
      prevRow.timeSeconds !== row.timeSeconds ||
      prevRow.points !== row.points ||
      prevRow.imageUrl !== row.imageUrl ||
      prevRow.explanation !== row.explanation ||
      prevRow.videoUrl !== row.videoUrl ||
      prevRow.videoPath !== row.videoPath ||
      prevRow.videoEmbedUrl !== row.videoEmbedUrl ||
      prevRow.videoProvider !== row.videoProvider ||
      prevRow.videoMimeType !== row.videoMimeType ||
      prevRow.videoDurationSeconds !== row.videoDurationSeconds ||
      prevRow.videoPosterUrl !== row.videoPosterUrl ||
      prevRow.videoWidth !== row.videoWidth ||
      prevRow.videoHeight !== row.videoHeight ||
      prevRow.mediaLeadSeconds !== row.mediaLeadSeconds ||
      JSON.stringify(prevRow.options) !== JSON.stringify(row.options) ||
      JSON.stringify(prevRow.correctIds) !== JSON.stringify(row.correctIds) ||
      JSON.stringify(prevRow.map) !== JSON.stringify(row.map)
    ) {
      return false;
    }
  }
  return ordinalDiff;
}

export function removeQuestionFromList(
  questions: EditableQuestion[],
  clientId: string,
): EditableQuestion[] {
  return questions
    .filter((q) => q.clientId !== clientId)
    .map((q, idx) => ({ ...q, ordinal: idx + 1 }));
}
