import type { Ref } from "react";

export interface QuestionVideoPlayerProps {
  videoUrl: string | null | undefined;
  videoEmbedUrl: string | null | undefined;
  videoProvider: "self" | "youtube" | "vimeo" | null | undefined;
  videoMimeType?: string | null;
  videoPosterUrl?: string | null;
  /** Optional ref forwarded to the `<video>` element for self-hosted clips. */
  videoRef?: Ref<HTMLVideoElement>;
  /** iframe accessible name. Defaults to "סרטון השאלה". */
  iframeTitle?: string;
}

/**
 * Renders either a self-hosted `<video>` (provider === "self") or an
 * iframe embed (YouTube/Vimeo) sized to fill its (`absolute inset-0`)
 * container. Caller owns the aspect-ratio wrapper.
 *
 * Returns null when no playable URL is available.
 */
export function QuestionVideoPlayer({
  videoUrl,
  videoEmbedUrl,
  videoProvider,
  videoMimeType,
  videoPosterUrl,
  videoRef,
  iframeTitle = "סרטון השאלה",
}: QuestionVideoPlayerProps) {
  if (videoUrl && videoProvider === "self") {
    return (
      <video
        ref={videoRef}
        controls
        playsInline
        preload="metadata"
        poster={videoPosterUrl ?? undefined}
        className="absolute inset-0 h-full w-full"
      >
        <source src={videoUrl} type={videoMimeType ?? undefined} />
      </video>
    );
  }
  if (videoEmbedUrl) {
    return (
      <iframe
        src={videoEmbedUrl}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="absolute inset-0 h-full w-full"
        title={iframeTitle}
      />
    );
  }
  return null;
}
