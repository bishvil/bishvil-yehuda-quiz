"use client";

import { AdminVideoUploadControl } from "./video-upload-control";
import type { VideoUploadMeta } from "./video-upload-control";
import { VIDEO_WIPE, type EditableQuestion } from "@/src/lib/admin/quiz-editor";

interface QuestionVideoUploaderProps {
  question: Pick<
    EditableQuestion,
    | "videoUrl"
    | "videoEmbedUrl"
    | "videoProvider"
    | "videoDurationSeconds"
    | "mediaLeadSeconds"
  >;
  onPatch: (patch: Partial<EditableQuestion>) => void;
  disabled?: boolean;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function QuestionVideoUploader({
  question,
  onPatch,
  disabled,
}: QuestionVideoUploaderProps) {
  const hasVideo = Boolean(question.videoUrl || question.videoEmbedUrl);
  const isEmbed = Boolean(question.videoEmbedUrl && !question.videoUrl);
  const isSelf = Boolean(question.videoUrl && !question.videoEmbedUrl);

  const currentValue = question.videoUrl ?? question.videoEmbedUrl ?? null;

  const handleChange = (url: string | null, meta: VideoUploadMeta) => {
    if (meta.kind === null || url === null) {
      onPatch({ ...VIDEO_WIPE });
      return;
    }

    if (meta.kind === "embed") {
      // Preserve existing mediaLeadSeconds — admin may have typed it already.
      onPatch({
        ...VIDEO_WIPE,
        mediaLeadSeconds: question.mediaLeadSeconds,
        videoEmbedUrl: url,
        videoProvider: meta.provider ?? null,
      });
      return;
    }

    onPatch({
      ...VIDEO_WIPE,
      videoUrl: url,
      videoPath: meta.path ?? null,
      videoProvider: "self",
      videoMimeType: meta.mimeType ?? null,
      videoDurationSeconds: meta.durationSeconds ?? null,
      videoPosterUrl: meta.posterUrl ?? null,
      videoPosterPath: meta.posterPath ?? null,
      videoWidth: meta.width ?? null,
      videoHeight: meta.height ?? null,
      mediaLeadSeconds: meta.durationSeconds ?? 0,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <AdminVideoUploadControl
        value={currentValue}
        onChange={handleChange}
        endpoint="/api/admin/uploads/question-video"
        title="סרטון שאלה"
        help="גררו קובץ וידאו לכאן או לחצו לבחירה מהמחשב."
        buttonText="בחירת סרטון"
        replaceText="החלפת סרטון"
        removeText="הסרת סרטון"
        embedUrlLabel="שימוש בסרטון YouTube / Vimeo"
        disabled={disabled}
      />

      {isEmbed ? (
        <div className="rounded-md border border-bsy-stone-200 bg-bsy-stone-50 px-3 py-2 text-[12px] text-bsy-stone-700">
          סרטוני YouTube ו-Vimeo: יש להזין באופן ידני את משך הסרטון בשניות.
          המערכת לא תאכוף סיום הצפייה לפני הצגת התשובות.
        </div>
      ) : null}

      {hasVideo ? (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
            משך סרטון (שניות)
            {question.videoDurationSeconds != null
              ? ` — ${formatDuration(question.videoDurationSeconds)}`
              : null}
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={600}
              className="w-24 rounded-md border border-bsy-stone-200 bg-white px-3 py-2 font-mono text-[13px] disabled:cursor-not-allowed disabled:bg-bsy-stone-50 disabled:text-bsy-stone-400"
              value={
                Number.isFinite(question.mediaLeadSeconds)
                  ? question.mediaLeadSeconds
                  : 0
              }
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next) && next >= 0 && next <= 600) {
                  onPatch({ mediaLeadSeconds: next });
                }
              }}
              disabled={disabled}
              readOnly={isSelf}
              data-testid="video-media-lead-seconds"
            />
            {isSelf ? (
              <span className="text-[11px] text-bsy-stone-400">
                מתמלא אוטומטית מקובץ הסרטון
              </span>
            ) : null}
          </div>
        </label>
      ) : null}
    </div>
  );
}
