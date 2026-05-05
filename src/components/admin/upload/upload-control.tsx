"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  uploadViaSignedUrl,
  type AdminUploadKind,
} from "@/src/lib/admin/upload-via-signed-url";

import { optimizeForUpload, type OptimizeResult } from "./client-image-optimizer";
import { OptimizerStatusLine } from "./OptimizerStatusLine";

interface UploadMeta {
  path?: string;
  width?: number;
  height?: number;
}

interface OptimizerConfig {
  maxBytes: number;
  maxLongSide: number;
}

interface AdminImageUploadControlProps {
  value: string | null;
  onChange: (url: string | null, meta?: UploadMeta) => void;
  /** Upload bucket category — drives validation, rate-limit key, and bucket. */
  kind: Extract<AdminUploadKind, "logo" | "question-image">;
  title: string;
  help: string;
  buttonText: string;
  replaceText: string;
  removeText: string;
  externalUrlLabel?: string;
  externalUrlPlaceholder?: string;
  maxBytes: number;
  allowedMimeTypes: readonly string[];
  allowedLabel: string;
  previewAlt: string;
  disabled?: boolean;
  /** When set, the optimizer runs before upload; omit or null to disable. */
  optimizer?: OptimizerConfig | null;
}

type UploadStatus = "idle" | "dragging" | "uploading" | "error";

export function AdminImageUploadControl({
  value,
  onChange,
  kind,
  title,
  help,
  buttonText,
  replaceText,
  removeText,
  externalUrlLabel,
  externalUrlPlaceholder = "https://...",
  maxBytes,
  allowedMimeTypes,
  allowedLabel,
  previewAlt,
  disabled = false,
  optimizer = null,
}: AdminImageUploadControlProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [useExternalUrl, setUseExternalUrl] = useState(false);
  const [keepOriginalQuality, setKeepOriginalQuality] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<OptimizeResult | null>(null);
  const [externalUrlInput, setExternalUrlInput] = useState("");
  const [importStatus, setImportStatus] = useState<"idle" | "importing">("idle");

  const allowedSet = useMemo(
    () => new Set<string>(allowedMimeTypes),
    [allowedMimeTypes],
  );
  const previewUrl = localPreviewUrl ?? value;
  const canUpload = !disabled && status !== "uploading";

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

  const uploadFile = useCallback(
    async (file: File) => {
      setErrorMessage(null);
      setOptimizeResult(null);

      if (!allowedSet.has(file.type)) {
        setStatus("error");
        setErrorMessage(`סוג הקובץ אינו נתמך. ניתן להעלות ${allowedLabel}.`);
        return;
      }

      // Run optimizer when configured and not bypassed by the checkbox.
      let uploadBlob: Blob = file;
      let uploadWidth: number | undefined;
      let uploadHeight: number | undefined;

      if (optimizer && !keepOriginalQuality) {
        let result: OptimizeResult;
        try {
          result = await optimizeForUpload(file, optimizer);
        } catch (err) {
          setStatus("error");
          setErrorMessage(
            err instanceof Error
              ? err.message
              : "שגיאה בעיבוד התמונה. נסו קובץ אחר.",
          );
          return;
        }
        setOptimizeResult(result);
        uploadBlob = result.blob;
        uploadWidth = result.width;
        uploadHeight = result.height;
      }

      // Client-side size guard (runs on original when optimizer is off or bypassed).
      if (uploadBlob.size > maxBytes) {
        setStatus("error");
        setErrorMessage(
          `הקובץ גדול מדי. הגודל המרבי הוא ${Math.floor(maxBytes / 1024)}KB.`,
        );
        return;
      }

      clearLocalPreview();
      const objectUrl = URL.createObjectURL(uploadBlob);
      setLocalPreviewUrl(objectUrl);
      setStatus("uploading");

      // The browser uploads directly to Supabase Storage via a server-issued
      // signed URL. This bypasses Vercel's 4.5 MB function body limit.
      const result = await uploadViaSignedUrl({ kind, blob: uploadBlob });

      if (!result.ok) {
        setStatus("error");
        setErrorMessage(result.message);
        return;
      }

      onChange(result.url, {
        path: result.path,
        width: uploadWidth,
        height: uploadHeight,
      });
      setStatus("idle");
      clearLocalPreview();
    },
    [allowedLabel, allowedSet, clearLocalPreview, keepOriginalQuality, kind, maxBytes, onChange, optimizer],
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0] ?? files?.item(0);
      if (!file) return;
      void uploadFile(file);
      if (inputRef.current) inputRef.current.value = "";
    },
    [uploadFile],
  );

  const openPicker = useCallback(() => {
    if (canUpload) inputRef.current?.click();
  }, [canUpload]);

  const handleImport = useCallback(async () => {
    const url = externalUrlInput.trim();
    if (!url) return;

    setErrorMessage(null);
    setImportStatus("importing");

    let response: Response;
    try {
      response = await fetch("/api/admin/uploads/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
    } catch {
      setImportStatus("idle");
      setErrorMessage("ייבוא הקישור נכשל.");
      return;
    }

    interface ImportBody {
      url?: string;
      path?: string;
      error?: string;
      message?: string;
    }
    let data: ImportBody | null = null;
    try {
      data = (await response.json()) as ImportBody;
    } catch {
      data = null;
    }

    setImportStatus("idle");

    if (!response.ok || !data || !data.url) {
      const code = data?.error;
      let friendly: string;
      if (code === "FILE_TOO_LARGE") {
        friendly = "התמונה גדולה מדי.";
      } else if (code === "UNSUPPORTED_MEDIA_TYPE") {
        friendly = "סוג הקובץ אינו נתמך.";
      } else if (code === "SSRF_BLOCKED") {
        friendly = "כתובת חסומה.";
      } else if (code === "INVALID_REQUEST" && data?.message) {
        // Server returns distinct Hebrew messages for scheme vs. parse errors.
        friendly = data.message;
      } else {
        friendly = "ייבוא הקישור נכשל.";
      }
      setErrorMessage(friendly);
      return;
    }

    setExternalUrlInput("");
    onChange(data.url, { path: data.path });
  }, [externalUrlInput, onChange]);

  return (
    <div className="flex flex-col gap-3" dir="rtl">
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
        data-testid="admin-upload-dropzone"
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={allowedMimeTypes.join(",")}
          className="sr-only"
          disabled={!canUpload}
          onChange={(event) => handleFiles(event.target.files)}
          data-testid="admin-upload-input"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {previewUrl ? (
            <Image
              src={previewUrl}
              alt={previewAlt}
              width={112}
              height={80}
              unoptimized
              className="h-20 w-28 rounded-md border border-bsy-stone-100 object-contain"
              data-testid="admin-upload-preview"
            />
          ) : (
            <div className="flex h-20 w-28 items-center justify-center rounded-md border border-bsy-stone-100 bg-bsy-stone-50 text-[12px] text-bsy-stone-400">
              אין תמונה
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-bsy-ink">{title}</div>
            <div className="mt-1 text-[12px] text-bsy-stone-700">{help}</div>
            <div className="mt-1 text-[11px] text-bsy-stone-400">
              עד {Math.floor(maxBytes / 1024)}KB ·{" "}
              <bdi dir="ltr">{allowedLabel}</bdi>
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

      {optimizeResult ? (
        <OptimizerStatusLine result={optimizeResult} />
      ) : null}

      {errorMessage ? (
        <p className="text-[12px] text-bsy-error" data-testid="admin-upload-error">
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
              setOptimizeResult(null);
              onChange(null);
            }}
            disabled={disabled}
          >
            {removeText}
          </button>
        ) : null}

        {optimizer ? (
          <label className="inline-flex items-center gap-2 text-[12px] text-bsy-stone-700">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-bsy-forest"
              checked={keepOriginalQuality}
              onChange={(event) => setKeepOriginalQuality(event.target.checked)}
              disabled={disabled}
            />
            <span>שמור איכות מלאה</span>
          </label>
        ) : null}

        {externalUrlLabel ? (
          <label className="inline-flex items-center gap-2 text-[12px] text-bsy-stone-700">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-bsy-forest"
              checked={useExternalUrl}
              onChange={(event) => setUseExternalUrl(event.target.checked)}
              disabled={disabled}
            />
            <span>{externalUrlLabel}</span>
          </label>
        ) : null}
      </div>

      {externalUrlLabel && useExternalUrl ? (
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-md border border-bsy-stone-200 bg-white px-3 py-2 font-mono text-[12px]"
            dir="ltr"
            value={externalUrlInput}
            placeholder={externalUrlPlaceholder}
            onChange={(event) => {
              setExternalUrlInput(event.target.value);
              setErrorMessage(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleImport();
              }
            }}
            disabled={disabled || importStatus === "importing"}
            data-testid="admin-upload-external-url"
          />
          <button
            type="button"
            className="shrink-0 rounded-md border border-bsy-stone-200 px-3 py-2 text-[12px] font-bold text-bsy-forest disabled:opacity-60"
            onClick={() => void handleImport()}
            disabled={disabled || importStatus === "importing" || !externalUrlInput.trim()}
            data-testid="admin-upload-import-button"
          >
            {importStatus === "importing" ? "מאמת קישור…" : "ייבוא"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
