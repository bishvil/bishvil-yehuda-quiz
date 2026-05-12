import Image from "next/image";
import type { ReactNode } from "react";

import { QuestionVideoPlayer } from "@/src/components/QuestionVideoPlayer";
import { QUESTION_TYPE_LABELS } from "@/src/lib/constants";
import type { QuestionTypeEnum } from "@/src/lib/supabase/database.types";

interface HostQuestionCardProps {
  type: QuestionTypeEnum;
  prompt: string;
  ordinal: number;
  totalQuestions: number;
  imageUrl?: string | null;
  /** Admin-supplied alt text; empty string signals decorative image. */
  imageAlt?: string | null;
  /** Self-hosted video URL (mp4/webm). When set alongside videoEmbedUrl, videoUrl wins. */
  videoUrl?: string | null;
  videoEmbedUrl?: string | null;
  videoProvider?: "self" | "youtube" | "vimeo" | null;
  videoMimeType?: string | null;
  videoPosterUrl?: string | null;
  children?: ReactNode;
}

/**
 * Question prompt card for the host view. Larger type than the participant
 * version since the desktop variant is meant to be projected, but we keep
 * the same paper/cream surface and accent eyebrow for visual continuity.
 *
 * When video props are supplied, the video player renders in place of the
 * image. When both image and video are set (impossible per DB CHECK): video wins.
 */
export function HostQuestionCard({
  type,
  prompt,
  ordinal,
  totalQuestions,
  imageUrl,
  imageAlt,
  videoUrl,
  videoEmbedUrl,
  videoProvider,
  videoMimeType,
  videoPosterUrl,
  children,
}: HostQuestionCardProps) {
  const hasVideo = Boolean(videoUrl ?? videoEmbedUrl);
  const imageSrc = type === "image" ? imageUrl : null;

  return (
    <div className="rounded-md border border-bsy-stone-100 bg-white p-5 shadow-[0_1px_2px_rgba(74,63,38,0.06)] md:p-6">
      <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-bsy-forest">
        <span>{QUESTION_TYPE_LABELS[type]}</span>
        <span className="text-bsy-stone-400">
          תחנה {ordinal} מתוך {totalQuestions}
        </span>
      </div>
      {hasVideo ? (
        <div className="relative mb-3 aspect-video overflow-hidden rounded-md bg-black">
          <QuestionVideoPlayer
            videoUrl={videoUrl}
            videoEmbedUrl={videoEmbedUrl}
            videoProvider={videoProvider}
            videoMimeType={videoMimeType}
            videoPosterUrl={videoPosterUrl}
          />
        </div>
      ) : imageSrc ? (
        <div className="relative mb-3 aspect-[16/9] overflow-hidden rounded-md bg-bsy-paper-warm">
          <Image
            src={imageSrc}
            alt={imageAlt ?? ""}
            fill
            sizes="(max-width: 1024px) 100vw, 800px"
            className="object-cover"
          />
        </div>
      ) : null}
      {children}
      <h3 className="m-0 font-[var(--font-display)] text-[24px] leading-tight text-bsy-brown md:text-[32px] lg:text-[36px]">
        {prompt}
      </h3>
    </div>
  );
}
