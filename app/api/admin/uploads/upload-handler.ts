import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { requireRole } from "@/src/lib/auth/server-auth";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { writeLog } from "@/src/lib/logging";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";

type UploadKind = "logo" | "question-image";

interface UploadConfig {
  kind: UploadKind;
  bucket: "brand-logos" | "question-images";
  maxBytes: number;
  allowedMimeTypes: ReadonlySet<string>;
}

interface AdminUploadSuccessBody {
  url: string;
  path: string;
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

interface TokenBucket {
  tokens: number;
  updatedAt: number;
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

const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const RATE_LIMIT_CAPACITY = 10;
const RATE_LIMIT_REFILL_INTERVAL_MS = 10_000;
const rateLimitBuckets = new Map<string, TokenBucket>();

export function POST_LOGO_UPLOAD(request: NextRequest) {
  return handleAdminUpload(request, LOGO_UPLOAD_CONFIG);
}

export function POST_QUESTION_IMAGE_UPLOAD(request: NextRequest) {
  return handleAdminUpload(request, QUESTION_IMAGE_UPLOAD_CONFIG);
}

export function resetUploadRateLimitsForTests() {
  rateLimitBuckets.clear();
}

async function handleAdminUpload(request: NextRequest, config: UploadConfig) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  if (!consumeUploadToken(auth.claims.userId, config.kind)) {
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

  if (!config.allowedMimeTypes.has(file.type)) {
    return privateNoStoreJson<AdminUploadErrorBody>(
      {
        error: "UNSUPPORTED_MEDIA_TYPE",
        message:
          config.kind === "logo"
            ? "סוג הקובץ אינו נתמך. ניתן להעלות PNG, JPG, WEBP או SVG."
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
    { url: data.publicUrl, path },
    { status: 201 },
  );
}

function consumeUploadToken(userId: string, kind: UploadKind): boolean {
  const now = Date.now();
  const key = `${kind}:${userId}`;
  const current = rateLimitBuckets.get(key) ?? {
    tokens: RATE_LIMIT_CAPACITY,
    updatedAt: now,
  };
  const refill = Math.floor(
    (now - current.updatedAt) / RATE_LIMIT_REFILL_INTERVAL_MS,
  );
  const tokens = Math.min(RATE_LIMIT_CAPACITY, current.tokens + refill);
  const updatedAt =
    refill > 0 ? current.updatedAt + refill * RATE_LIMIT_REFILL_INTERVAL_MS : now;

  if (tokens <= 0) {
    rateLimitBuckets.set(key, { tokens: 0, updatedAt });
    return false;
  }

  rateLimitBuckets.set(key, { tokens: tokens - 1, updatedAt });
  return true;
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

function extensionForMime(mime: string): "png" | "jpg" | "webp" | "svg" {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    default:
      throw new Error(`Unsupported MIME type: ${mime}`);
  }
}
