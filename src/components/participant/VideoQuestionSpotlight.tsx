"use client";

import { useEffect, useMemo, useState } from "react";

import { QuestionVideoPlayer } from "@/src/components/QuestionVideoPlayer";

type SpotlightMode = "host_gated" | "self_paced";

export interface VideoQuestionSpotlightProps {
  mode: SpotlightMode;
  prompt: string;
  videoUrl: string | null;
  videoEmbedUrl: string | null;
  videoProvider: "self" | "youtube" | "vimeo" | null;
  videoMimeType: string | null;
  videoPosterUrl: string | null;
  mediaLeadSeconds: number;
  onConfirm?: () => void;
  hintText?: string;
}

export function VideoQuestionSpotlight({
  mode,
  prompt,
  videoUrl,
  videoEmbedUrl,
  videoProvider,
  videoMimeType,
  videoPosterUrl,
  mediaLeadSeconds,
  onConfirm,
  hintText,
}: VideoQuestionSpotlightProps) {
  const [confirmEligible, setConfirmEligible] = useState(false);

  const isPlayable = Boolean(videoUrl || videoEmbedUrl);
  const canConfirm = mode === "host_gated" ? Boolean(onConfirm) : Boolean(onConfirm) && confirmEligible;

  const defaultHint = useMemo(() => {
    if (mode === "host_gated") return "ממתינים לאישור המדריך — כולכם תתחילו יחד";
    return "לאחר סיום הצפייה תוצג השאלה והטיימר יתחיל";
  }, [mode]);

  useEffect(() => {
    if (mode !== "self_paced") return;
    const clampedLead = Math.max(1, mediaLeadSeconds);
    const timer = window.setTimeout(() => setConfirmEligible(true), clampedLead * 1000);
    return () => window.clearTimeout(timer);
  }, [mode, mediaLeadSeconds]);

  useEffect(() => {
    if (!canConfirm || !onConfirm) return;
    const confirm = onConfirm;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") confirm();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canConfirm, onConfirm]);

  if (!isPlayable) return null;

  return (
    <div
      dir="rtl"
      data-testid="participant-spotlight"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="צפו בסרטון לפני המענה"
    >
      <div className="flex max-h-full w-full max-w-3xl flex-col gap-3 rounded-md bg-bsy-paper p-4">
        <p className="m-0 font-[var(--font-display)] text-[20px] leading-snug text-bsy-brown">
          {prompt}
        </p>

        <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
          <QuestionVideoPlayer
            videoUrl={videoUrl}
            videoEmbedUrl={videoEmbedUrl}
            videoProvider={videoProvider}
            videoMimeType={videoMimeType}
            videoPosterUrl={videoPosterUrl}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="m-0 text-[11px] text-bsy-stone-400">
            {hintText ?? defaultHint}
          </p>
          {onConfirm ? (
            <button
              type="button"
              onClick={canConfirm ? onConfirm : undefined}
              disabled={!canConfirm}
              className="rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[12px] font-bold text-bsy-forest disabled:opacity-40"
            >
              {mode === "host_gated" ? "סיום צפייה ←" : "אישור צפייה ←"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

