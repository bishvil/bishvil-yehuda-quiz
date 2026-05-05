"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { parseVideoEmbed } from "@/src/lib/admin/video-embed";
import type { VideoEmbedProvider } from "@/src/lib/admin/video-embed";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VideoUploadMeta {
  /** Storage path (self-hosted uploads). */
  path?: string;
  /** MIME type of the uploaded file. */
  mimeType?: string;
  /** Duration in seconds (ceil'd from video metadata). */
  durationSeconds?: number;
  /** Natural video width. */
  width?: number;
  /** Natural video height. */
  height?: number;
  /** Poster image URL (auto-extracted from self-hosted clip). */
  posterUrl?: string;
  /** Storage path of the poster image. */
  posterPath?: string;
  /**
   * Discriminator:
   *  - 'self'  — file was uploaded to question-videos bucket
   *  - 'embed' — user supplied a YouTube/Vimeo URL
   *  - null    — user removed the video
   */
  kind: "self" | "embed" | null;
  /** Provider (embed mode only). */
  provider?: VideoEmbedProvider;
}

/**
 * Pending upload state — stores everything from the server response so
 * the loadedmetadata useEffect can emit a richer onChange call later.
 */
interface PendingUpload {
  uploadedUrl: string;
  uploadedPath: string;
  mimeType: string;
  file: File;
}

interface AdminVideoUploadControlProps {
  value: string | null;
  onChange: (url: string | null, meta: VideoUploadMeta) => void;
  endpoint: string;
  title: string;
  help: string;
  buttonText: string;
  replaceText: string;
  removeText: string;
  embedUrlLabel?: string;
  disabled?: boolean;
  /**
   * Poster extraction function. Defaults to `extractPosterFrame`. Inject in
   * tests to avoid jsdom hanging on video element media events.
   */
  _extractPosterFrame?: (
    file: File,
  ) => Promise<{ blob: Blob; width: number; height: number } | null>;
}

type UploadStatus = "idle" | "dragging" | "uploading" | "error";

const ALLOWED_MIME_TYPES = new Set(["video/mp4", "video/webm"]);
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const POSTER_MAX_LONG_SIDE = 1280;

// ---------------------------------------------------------------------------
// Poster extraction helper
// ---------------------------------------------------------------------------

/**
 * Seeks to a representative frame, draws it to a canvas, and returns the
 * resulting Blob plus its dimensions. Best-effort — returns null on any
 * failure so the video upload is never blocked.
 *
 * Exported for unit-test mocking.
 */
export async function extractPosterFrame(
  file: File,
): Promise<{ blob: Blob; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => URL.revokeObjectURL(objectUrl);

    video.addEventListener(
      "loadedmetadata",
      () => {
        const seekTime = Math.min(1, (video.duration || 0) / 4);
        video.currentTime = seekTime;
      },
      { once: true },
    );

    video.addEventListener(
      "seeked",
      () => {
        try {
          const naturalW = video.videoWidth;
          const naturalH = video.videoHeight;
          if (!naturalW || !naturalH) {
            cleanup();
            resolve(null);
            return;
          }

          // Scale down if needed
          const scale =
            Math.max(naturalW, naturalH) > POSTER_MAX_LONG_SIDE
              ? POSTER_MAX_LONG_SIDE / Math.max(naturalW, naturalH)
              : 1;
          const w = Math.round(naturalW * scale);
          const h = Math.round(naturalH * scale);

          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            cleanup();
            resolve(null);
            return;
          }
          ctx.drawImage(video, 0, 0, w, h);
          canvas.toBlob(
            (blob) => {
              cleanup();
              if (!blob) {
                resolve(null);
                return;
              }
              resolve({ blob, width: w, height: h });
            },
            "image/webp",
            0.8,
          );
        } catch {
          cleanup();
          resolve(null);
        }
      },
      { once: true },
    );

    video.addEventListener(
      "error",
      () => {
        cleanup();
        resolve(null);
      },
      { once: true },
    );

    video.src = objectUrl;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminVideoUploadControl({
  value,
  onChange,
  endpoint,
  title,
  help,
  buttonText,
  replaceText,
  removeText,
  embedUrlLabel,
  disabled = false,
  _extractPosterFrame = extractPosterFrame,
}: AdminVideoUploadControlProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [status, setStatus] = useState<UploadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [useEmbedUrl, setUseEmbedUrl] = useState(false);
  const [embedUrlInput, setEmbedUrlInput] = useState("");
  const [embedUrlError, setEmbedUrlError] = useState<string | null>(null);

  /**
   * After the server responds successfully, we store the upload result here.
   * A useEffect watches this and — once the video element is in the DOM and
   * fires loadedmetadata — emits a richer onChange with duration/dimensions.
   */
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);

  const canUpload = !disabled && status !== "uploading";
  const previewUrl = localPreviewUrl ?? value;

  // Revoke local preview URL on unmount / on change
  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  const clearLocalPreview = useCallback(() => {
    setLocalPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }, []);

  /**
   * Once we have a pending upload AND the video element is in the DOM,
   * register a loadedmetadata listener to emit the richer metadata callback.
   */
  useEffect(() => {
    if (!pendingUpload) return;
    const video = videoRef.current;
    if (!video) return;

    const { uploadedUrl, uploadedPath, mimeType, file } = pendingUpload;

    const handleMeta = () => {
      const durationSeconds = Math.ceil(video.duration || 0) || null;
      const naturalWidth = video.videoWidth || null;
      const naturalHeight = video.videoHeight || null;

      // Try to extract poster asynchronously; emit richer onChange when done.
      _extractPosterFrame(file)
        .then(async (posterResult) => {
          let posterUrl: string | undefined;
          let posterPath: string | undefined;

          if (posterResult) {
            try {
              const posterFile = new File(
                [posterResult.blob],
                "poster.webp",
                { type: "image/webp" },
              );
              const posterForm = new FormData();
              posterForm.set("file", posterFile);
              if (posterResult.width !== undefined)
                posterForm.set("width", String(posterResult.width));
              if (posterResult.height !== undefined)
                posterForm.set("height", String(posterResult.height));

              const posterRes = await fetch("/api/admin/uploads/question-image", {
                method: "POST",
                body: posterForm,
              });
              if (posterRes.ok) {
                const posterBody = (await posterRes.json()) as {
                  url?: string;
                  path?: string;
                };
                posterUrl = posterBody.url;
                posterPath = posterBody.path;
              }
            } catch {
              // Poster extraction failed — not blocking
            }
          }

          onChange(uploadedUrl, {
            kind: "self",
            path: uploadedPath,
            mimeType,
            durationSeconds: durationSeconds ?? undefined,
            width: naturalWidth ?? undefined,
            height: naturalHeight ?? undefined,
            posterUrl,
            posterPath,
          });
        })
        .catch(() => {
          onChange(uploadedUrl, {
            kind: "self",
            path: uploadedPath,
            mimeType,
            durationSeconds: durationSeconds ?? undefined,
            width: naturalWidth ?? undefined,
            height: naturalHeight ?? undefined,
          });
        })
        .finally(() => {
          setPendingUpload(null);
        });
    };

    // If metadata is already loaded (unlikely but guard for it)
    if (video.readyState >= 1 && video.duration) {
      handleMeta();
    } else {
      video.addEventListener("loadedmetadata", handleMeta, { once: true });
      return () => {
        video.removeEventListener("loadedmetadata", handleMeta);
      };
    }
  // onChange and _extractPosterFrame are callbacks from parent — stable refs,
  // omit from deps to avoid spurious re-runs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingUpload]);

  const uploadFile = useCallback(
    async (file: File) => {
      setErrorMessage(null);

      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        setStatus("error");
        setErrorMessage("סוג הקובץ אינו נתמך. ניתן להעלות MP4, WEBM.");
        return;
      }

      if (file.size > MAX_BYTES) {
        setStatus("error");
        setErrorMessage("הקובץ גדול מדי. הגודל המרבי הוא 25MB.");
        return;
      }

      // Create a local object URL for the preview
      clearLocalPreview();
      const objectUrl = URL.createObjectURL(file);
      setLocalPreviewUrl(objectUrl);
      setStatus("uploading");

      const formData = new FormData();
      formData.set("file", file);

      let response: Response;
      try {
        response = await fetch(endpoint, { method: "POST", body: formData });
      } catch {
        setStatus("error");
        setErrorMessage("ההעלאה נכשלה. בדקו את החיבור ונסו שוב.");
        clearLocalPreview();
        return;
      }

      interface UploadResult {
        url: string;
        path: string;
        width?: number;
        height?: number;
      }
      interface UploadError {
        message?: string;
      }

      let body: UploadResult | UploadError | null = null;
      try {
        body = (await response.json()) as UploadResult | UploadError;
      } catch {
        body = null;
      }

      if (!response.ok || !body || !("url" in body)) {
        setStatus("error");
        setErrorMessage(
          body && "message" in body && body.message
            ? body.message
            : "שמירת הקובץ נכשלה.",
        );
        clearLocalPreview();
        return;
      }

      const uploadedUrl = body.url;
      const uploadedPath = body.path;

      setStatus("idle");

      // Emit initial onChange with what the server returned
      onChange(uploadedUrl, {
        kind: "self",
        path: uploadedPath,
        mimeType: file.type,
        width: body.width,
        height: body.height,
      });

      // Schedule the richer loadedmetadata pass (runs in useEffect once video
      // element is in the DOM after the upcoming re-render).
      setPendingUpload({
        uploadedUrl,
        uploadedPath,
        mimeType: file.type,
        file,
      });
    },
    [clearLocalPreview, endpoint, onChange],
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      void uploadFile(file);
      if (inputRef.current) inputRef.current.value = "";
    },
    [uploadFile],
  );

  const openPicker = useCallback(() => {
    if (canUpload) inputRef.current?.click();
  }, [canUpload]);

  const handleEmbedCommit = useCallback(() => {
    const raw = embedUrlInput.trim();
    if (!raw) return;

    setEmbedUrlError(null);
    const result = parseVideoEmbed(raw);

    if ("error" in result) {
      const msgs: Record<typeof result.error, string> = {
        INVALID_URL: "כתובת לא חוקית",
        UNSUPPORTED_HOST: "הספק לא נתמך",
        MISSING_VIDEO_ID: "מזהה הסרטון חסר",
      };
      setEmbedUrlError(msgs[result.error]);
      return;
    }

    setEmbedUrlInput("");
    onChange(result.embedUrl, {
      kind: "embed",
      provider: result.provider,
    });
  }, [embedUrlInput, onChange]);

  return (
    <div className="flex flex-col gap-3" dir="rtl">
      {/* Dropzone */}
      <div
        role="button"
        tabIndex={canUpload ? 0 : -1}
        aria-disabled={!canUpload}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (canUpload) setStatus("dragging");
        }}
        onDragLeave={() => {
          if (status === "dragging") setStatus("idle");
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (!canUpload) return;
          setStatus("idle");
          handleFiles(event.dataTransfer.files);
        }}
        className={[
          "rounded-md border border-dashed bg-white p-4 text-start transition-colors",
          canUpload ? "cursor-pointer" : "cursor-not-allowed opacity-60",
          status === "dragging"
            ? "border-bsy-forest bg-bsy-forest/10"
            : "border-bsy-stone-200 hover:border-bsy-forest",
        ].join(" ")}
        data-testid="admin-video-upload-dropzone"
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="video/mp4,video/webm"
          className="sr-only"
          disabled={!canUpload}
          onChange={(event) => handleFiles(event.target.files)}
          data-testid="admin-video-upload-input"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {previewUrl &&
          !previewUrl.includes("youtube") &&
          !previewUrl.includes("vimeo") ? (
            /* Self-hosted video preview */
            <video
              ref={videoRef}
              src={previewUrl}
              controls
              preload="metadata"
              playsInline
              className="h-20 w-28 rounded-md border border-bsy-stone-100 object-contain bg-black"
              data-testid="admin-video-preview"
            />
          ) : previewUrl ? (
            /* Embed preview placeholder */
            <div
              className="flex h-20 w-28 items-center justify-center rounded-md border border-bsy-stone-100 bg-bsy-stone-50 text-[11px] text-bsy-stone-400"
              data-testid="admin-video-embed-preview"
            >
              סרטון מוטמע
            </div>
          ) : (
            <div className="flex h-20 w-28 items-center justify-center rounded-md border border-bsy-stone-100 bg-bsy-stone-50 text-[12px] text-bsy-stone-400">
              אין סרטון
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-bsy-ink">{title}</div>
            <div className="mt-1 text-[12px] text-bsy-stone-700">{help}</div>
            <div className="mt-1 text-[11px] text-bsy-stone-400">
              עד 25MB · <bdi dir="ltr">MP4, WEBM</bdi>
            </div>
          </div>
          <span className="rounded-md border border-bsy-stone-200 px-3 py-2 text-center text-[12px] font-bold text-bsy-forest">
            {status === "uploading"
              ? "מעלה..."
              : value
                ? replaceText
                : buttonText}
          </span>
        </div>
      </div>

      {errorMessage ? (
        <p
          className="text-[12px] text-bsy-error"
          data-testid="admin-video-upload-error"
        >
          {errorMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {value ? (
          <button
            type="button"
            className="text-[12px] font-bold text-bsy-error hover:underline"
            onClick={() => {
              clearLocalPreview();
              setErrorMessage(null);
              setEmbedUrlError(null);
              setPendingUpload(null);
              onChange(null, { kind: null });
            }}
            disabled={disabled}
          >
            {removeText}
          </button>
        ) : null}

        {embedUrlLabel ? (
          <label className="inline-flex items-center gap-2 text-[12px] text-bsy-stone-700">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-bsy-forest"
              checked={useEmbedUrl}
              onChange={(event) => {
                setUseEmbedUrl(event.target.checked);
                setEmbedUrlError(null);
              }}
              disabled={disabled}
              aria-label={embedUrlLabel}
            />
            <span>{embedUrlLabel}</span>
          </label>
        ) : null}
      </div>

      {embedUrlLabel && useEmbedUrl ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-md border border-bsy-stone-200 bg-white px-3 py-2 font-mono text-[12px]"
              dir="ltr"
              value={embedUrlInput}
              placeholder="https://youtube.com/watch?v=... / https://vimeo.com/..."
              onChange={(event) => {
                setEmbedUrlInput(event.target.value);
                setEmbedUrlError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleEmbedCommit();
                }
              }}
              disabled={disabled}
              data-testid="admin-video-embed-url-input"
            />
            <button
              type="button"
              className="shrink-0 rounded-md border border-bsy-stone-200 px-3 py-2 text-[12px] font-bold text-bsy-forest disabled:opacity-60"
              onClick={handleEmbedCommit}
              disabled={disabled || !embedUrlInput.trim()}
              data-testid="admin-video-embed-url-submit"
            >
              אישור
            </button>
          </div>
          {embedUrlError ? (
            <p
              className="text-[12px] text-bsy-error"
              data-testid="admin-video-embed-url-error"
            >
              {embedUrlError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
