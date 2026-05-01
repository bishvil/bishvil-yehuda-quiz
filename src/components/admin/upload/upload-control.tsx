"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

interface UploadResult {
  url: string;
  path: string;
}

interface UploadError {
  message?: string;
}

interface AdminImageUploadControlProps {
  value: string | null;
  onChange: (url: string | null) => void;
  endpoint: string;
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
}

type UploadStatus = "idle" | "dragging" | "uploading" | "error";

export function AdminImageUploadControl({
  value,
  onChange,
  endpoint,
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
}: AdminImageUploadControlProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [useExternalUrl, setUseExternalUrl] = useState(false);

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

      if (!allowedSet.has(file.type)) {
        setStatus("error");
        setErrorMessage(`סוג הקובץ אינו נתמך. ניתן להעלות ${allowedLabel}.`);
        return;
      }
      if (file.size > maxBytes) {
        setStatus("error");
        setErrorMessage(
          `הקובץ גדול מדי. הגודל המרבי הוא ${Math.floor(maxBytes / 1024)}KB.`,
        );
        return;
      }

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
        return;
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
        return;
      }

      onChange(body.url);
      setStatus("idle");
      clearLocalPreview();
    },
    [allowedLabel, allowedSet, clearLocalPreview, endpoint, maxBytes, onChange],
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
            // eslint-disable-next-line @next/next/no-img-element -- Admin previews use arbitrary uploaded/external URLs, including SVG logos, so Next Image remote config is not a good fit here.
            <img
              src={previewUrl}
              alt={previewAlt}
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
              onChange(null);
            }}
            disabled={disabled}
          >
            {removeText}
          </button>
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
        <input
          className="w-full rounded-md border border-bsy-stone-200 bg-white px-3 py-2 font-mono text-[12px]"
          dir="ltr"
          value={value ?? ""}
          placeholder={externalUrlPlaceholder}
          onChange={(event) => {
            clearLocalPreview();
            setErrorMessage(null);
            onChange(event.target.value || null);
          }}
          disabled={disabled}
          data-testid="admin-upload-external-url"
        />
      ) : null}
    </div>
  );
}
