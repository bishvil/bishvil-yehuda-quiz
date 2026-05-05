import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { requireRole } from "@/src/lib/auth/server-auth";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { writeLog } from "@/src/lib/logging";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";
import { consumeUploadToken, resetRateLimitsForTests } from "./rate-limit";

export { resetRateLimitsForTests as resetUploadRateLimitsForTests };

type UploadKind = "logo" | "question-image" | "question-video";

interface UploadConfig {
  kind: UploadKind;
  bucket: "brand-logos" | "question-images" | "question-videos";
  maxBytes: number;
  allowedMimeTypes: ReadonlySet<string>;
}

interface AdminUploadSuccessBody {
  url: string;
  path: string;
  width?: number;
  height?: number;
}

interface AdminUploadErrorBody {
  error:
    | "INVALID_REQUEST"
    | "UNAUTHORIZED"
    | "RATE_LIMITED"
    | "FILE_TOO_LARGE"
    | "UNSUPPORTED_MEDIA_TYPE"
    | "UPLOAD_FAILED";
  message: string;
}

const LOGO_UPLOAD_CONFIG: UploadConfig = {
  kind: "logo",
  bucket: "brand-logos",
  maxBytes: 512 * 1024,
  allowedMimeTypes: new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/svg+xml",
  ]),
};

const QUESTION_IMAGE_UPLOAD_CONFIG: UploadConfig = {
  kind: "question-image",
  bucket: "question-images",
  maxBytes: 2 * 1024 * 1024,
  allowedMimeTypes: new Set(["image/png", "image/jpeg", "image/webp"]),
};

// 25 MB cap is intentional. The whole file is buffered via
// `await file.arrayBuffer()` below; if this cap is raised, switch the upload
// path to streaming (Supabase storage SDK accepts a ReadableStream too).
const QUESTION_VIDEO_UPLOAD_CONFIG: UploadConfig = {
  kind: "question-video",
  bucket: "question-videos",
  maxBytes: 25 * 1024 * 1024,
  allowedMimeTypes: new Set(["video/mp4", "video/webm"]),
};

const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export function POST_LOGO_UPLOAD(request: NextRequest) {
  return handleAdminUpload(request, LOGO_UPLOAD_CONFIG);
}

export function POST_QUESTION_IMAGE_UPLOAD(request: NextRequest) {
  return handleAdminUpload(request, QUESTION_IMAGE_UPLOAD_CONFIG);
}

export function POST_QUESTION_VIDEO_UPLOAD(request: NextRequest) {
  return handleAdminUpload(request, QUESTION_VIDEO_UPLOAD_CONFIG);
}

async function handleAdminUpload(request: NextRequest, config: UploadConfig) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  if (!consumeUploadToken(`${config.kind}:${auth.claims.userId}`)) {
    return privateNoStoreJson<AdminUploadErrorBody>(
      {
        error: "RATE_LIMITED",
        message: "יותר מדי העלאות בפרק זמן קצר. נסו שוב בעוד רגע.",
      },
      { status: 429 },
    );
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (!Number.isFinite(parsedLength) || parsedLength < 0) {
      return invalidRequest("כותרת Content-Length אינה תקינה.");
    }
    if (parsedLength > config.maxBytes + MULTIPART_OVERHEAD_BYTES) {
      return privateNoStoreJson<AdminUploadErrorBody>(
        { error: "FILE_TOO_LARGE", message: sizeMessage(config.maxBytes) },
        { status: 413 },
      );
    }
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (caught) {
    writeLog({
      level: "warn",
      message: "Admin upload multipart parse failed",
      context: {
        kind: config.kind,
        error: caught instanceof Error ? caught.message : "unknown",
      },
    });
    return invalidRequest("בקשת ההעלאה אינה תקינה.");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return invalidRequest("יש לצרף קובץ בשדה file.");
  }

  const dimensions = parseDimensions(
    formData.get("width"),
    formData.get("height"),
  );

  if (!config.allowedMimeTypes.has(file.type)) {
    return privateNoStoreJson<AdminUploadErrorBody>(
      {
        error: "UNSUPPORTED_MEDIA_TYPE",
        message:
          config.kind === "logo"
            ? "סוג הקובץ אינו נתמך. ניתן להעלות PNG, JPG, WEBP או SVG."
            : config.kind === "question-video"
              ? "סוג הקובץ אינו נתמך. ניתן להעלות MP4 או WEBM."
              : "סוג הקובץ אינו נתמך. ניתן להעלות PNG, JPG או WEBP.",
      },
      { status: 415 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0) {
    return invalidRequest("הקובץ ריק.");
  }
  if (bytes.byteLength > config.maxBytes) {
    return privateNoStoreJson<AdminUploadErrorBody>(
      { error: "FILE_TOO_LARGE", message: sizeMessage(config.maxBytes) },
      { status: 413 },
    );
  }

  const path = `${auth.claims.userId}/${randomUUID()}.${extensionForMime(file.type)}`;
  const serviceSupabase = await createServiceRoleSupabaseClient();
  const { error } = await serviceSupabase.storage
    .from(config.bucket)
    .upload(path, new Blob([bytes], { type: file.type }), {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });

  if (error) {
    writeLog({
      level: "error",
      message: "Admin upload failed",
      context: {
        kind: config.kind,
        bucket: config.bucket,
        error: error.message,
      },
    });
    return privateNoStoreJson<AdminUploadErrorBody>(
      { error: "UPLOAD_FAILED", message: "שמירת הקובץ נכשלה." },
      { status: 500 },
    );
  }

  const { data } = serviceSupabase.storage.from(config.bucket).getPublicUrl(path);
  return privateNoStoreJson<AdminUploadSuccessBody>(
    { url: data.publicUrl, path, ...dimensions },
    { status: 201 },
  );
}

function invalidRequest(message: string) {
  return privateNoStoreJson<AdminUploadErrorBody>(
    { error: "INVALID_REQUEST", message },
    { status: 400 },
  );
}

function sizeMessage(maxBytes: number): string {
  return `הקובץ גדול מדי. הגודל המרבי הוא ${Math.floor(maxBytes / 1024)}KB.`;
}

/**
 * Parses optional `width` and `height` multipart fields supplied by the
 * client optimizer. Returns a partial object to spread into the success body,
 * or an empty object when the fields are absent or invalid.
 */
function parseDimensions(
  rawW: FormDataEntryValue | null,
  rawH: FormDataEntryValue | null,
): { width?: number; height?: number } {
  if (rawW === null && rawH === null) return {};
  const w = Number.parseInt(String(rawW ?? ""), 10);
  const h = Number.parseInt(String(rawH ?? ""), 10);
  if (
    Number.isNaN(w) || Number.isNaN(h) ||
    w < 1 || h < 1 || w > 20_000 || h > 20_000
  ) {
    return {};
  }
  return { width: w, height: h };
}

export function extensionForMime(
  mime: string,
): "png" | "jpg" | "webp" | "svg" | "mp4" | "webm" {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    default:
      throw new Error(`Unsupported MIME type: ${mime}`);
  }
}
