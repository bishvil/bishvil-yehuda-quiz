"use client";

/**
 * Spotlight overlay for `video` question type.
 *
 * Behaviour:
 * - Dims the background and centres the video player or embed iframe.
 * - Shows the question prompt above the player for context.
 * - Hides the skip/confirm action until the participant has watched enough:
 *   - Self-hosted: once `currentTime >= 0.8 * duration` (80 % rule).
 *   - Embed: once `mediaLeadSeconds` wall-clock seconds have elapsed
 *     (iframe `currentTime` is not reliably accessible cross-origin).
 * - The `Escape` key confirms/skips once eligible.
 * - `mediaSettled` is LOCAL React state — a page reload re-engages the
 *   spotlight. This is a deliberate v1 simplification (no server persistence).
 */

import { useEffect, useRef, useState } from "react";

import { QuestionVideoPlayer } from "@/src/components/QuestionVideoPlayer";

export interface QuestionMediaSpotlightProps {
  prompt: string;
  videoUrl: string | null;
  videoEmbedUrl: string | null;
  videoProvider: "self" | "youtube" | "vimeo" | null;
  videoMimeType: string | null;
  videoPosterUrl: string | null;
  /** Admin-entered duration for self-hosted video; used as fallback when the
   *  native `<video>.duration` is not yet known. */
  videoDurationSeconds: number | null;
  /** Server-stored offset that was added to `deadline_at`. Used only as
   *  the wall-clock gate for embed iframes. */
  mediaLeadSeconds: number;
  /** Called when the participant ends, skips, or confirms watching. */
  onSettle: () => void;
}

export function QuestionMediaSpotlight({
  prompt,
  videoUrl,
  videoEmbedUrl,
  videoProvider,
  videoMimeType,
  videoPosterUrl,
  videoDurationSeconds,
  mediaLeadSeconds,
  onSettle,
}: QuestionMediaSpotlightProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [skipEligible, setSkipEligible] = useState(false);

  const isEmbed = Boolean(videoEmbedUrl) && videoProvider !== "self";
  const isSelfHosted = videoProvider === "self" && Boolean(videoUrl);

  useEffect(() => {
    if (!isSelfHosted) return;
    const video = videoRef.current;
    if (!video) return;

    function handleTimeUpdate() {
      const v = videoRef.current;
      if (!v) return;
      const duration =
        Number.isFinite(v.duration) && v.duration > 0
          ? v.duration
          : (videoDurationSeconds ?? 0);
      if (duration > 0 && v.currentTime >= 0.8 * duration) {
        // Stop listening once eligible — avoids a setState-per-tick (~4 Hz)
        // and sidesteps the stale-closure on `skipEligible`.
        v.removeEventListener("timeupdate", handleTimeUpdate);
        setSkipEligible(true);
      }
    }

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", onSettle);
    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", onSettle);
    };
  }, [isSelfHosted, videoDurationSeconds, onSettle]);

  // --- Embed: wall-clock gate. Clamp lead to at least 1 second. ---
  useEffect(() => {
    if (!isEmbed) return;
    const clampedLead = Math.max(1, mediaLeadSeconds);
    const timer = window.setTimeout(() => {
      setSkipEligible(true);
    }, clampedLead * 1000);
    return () => window.clearTimeout(timer);
  }, [isEmbed, mediaLeadSeconds]);

  // --- Escape key: confirm once eligible ---
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && skipEligible) {
        onSettle();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [skipEligible, onSettle]);

  const skipLabel = isEmbed ? "אישור צפייה ←" : "דלג לשאלה ←";

  return (
    <div
      dir="rtl"
      data-testid="participant-spotlight"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="צפו בסרטון לפני המענה"
    >
      <div className="flex max-h-full w-full max-w-3xl flex-col gap-3 rounded-md bg-bsy-paper p-4">
        {/* Question prompt for context */}
        <p className="m-0 font-[var(--font-display)] text-[20px] leading-snug text-bsy-brown">
          {prompt}
        </p>

        {/* Video player / embed iframe */}
        <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
          <QuestionVideoPlayer
            videoUrl={videoUrl}
            videoEmbedUrl={videoEmbedUrl}
            videoProvider={videoProvider}
            videoMimeType={videoMimeType}
            videoPosterUrl={videoPosterUrl}
            videoRef={videoRef}
          />
        </div>

        {/* Skip / confirm row */}
        <div className="flex items-center justify-between gap-2">
          <p className="m-0 text-[11px] text-bsy-stone-400">
            לאחר סיום הצפייה תוצג השאלה והטיימר יתחיל
          </p>
          {skipEligible ? (
            <button
              type="button"
              onClick={onSettle}
              className="rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[12px] font-bold text-bsy-forest"
            >
              {skipLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
