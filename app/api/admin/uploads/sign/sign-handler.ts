import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { requireRole } from "@/src/lib/auth/server-auth";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { writeLog } from "@/src/lib/logging";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";

import { consumeUploadToken } from "../rate-limit";
import {
  extensionForMime,
  UPLOAD_CONFIG_BY_KIND,
  type UploadKind,
} from "../_shared";

interface SignSuccessBody {
  bucket: string;
  path: string;
  token: string;
  publicUrl: string;
  maxBytes: number;
}

interface SignErrorBody {
  error:
    | "INVALID_REQUEST"
    | "UNAUTHORIZED"
    | "RATE_LIMITED"
    | "FILE_TOO_LARGE"
    | "UNSUPPORTED_MEDIA_TYPE"
    | "SIGN_FAILED";
  message: string;
}

interface SignRequestBody {
  kind?: unknown;
  mimeType?: unknown;
  size?: unknown;
}

const VALID_KINDS = new Set<UploadKind>([
  "logo",
  "question-image",
  "question-video",
]);

export async function handleAdminUploadSign(request: NextRequest) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  let payload: SignRequestBody;
  try {
    payload = (await request.json()) as SignRequestBody;
  } catch {
    return invalid("גוף הבקשה חייב להיות JSON תקין.");
  }

  const { kind, mimeType, size } = payload;
  if (typeof kind !== "string" || !VALID_KINDS.has(kind as UploadKind)) {
    return invalid("שדה kind חסר או לא חוקי.");
  }
  if (typeof mimeType !== "string" || mimeType.length === 0) {
    return invalid("שדה mimeType חסר.");
  }
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    return invalid("שדה size חסר או לא חוקי.");
  }

  const config = UPLOAD_CONFIG_BY_KIND[kind as UploadKind];

  if (!config.allowedMimeTypes.has(mimeType)) {
    return privateNoStoreJson<SignErrorBody>(
      {
        error: "UNSUPPORTED_MEDIA_TYPE",
        message: messageForUnsupportedMime(config.kind),
      },
      { status: 415 },
    );
  }

  if (size > config.maxBytes) {
    return privateNoStoreJson<SignErrorBody>(
      { error: "FILE_TOO_LARGE", message: sizeMessage(config.maxBytes) },
      { status: 413 },
    );
  }

  if (!consumeUploadToken(`${config.kind}:${auth.claims.userId}`)) {
    return privateNoStoreJson<SignErrorBody>(
      {
        error: "RATE_LIMITED",
        message: "יותר מדי העלאות בפרק זמן קצר. נסו שוב בעוד רגע.",
      },
      { status: 429 },
    );
  }

  const path = `${auth.claims.userId}/${randomUUID()}.${extensionForMime(mimeType)}`;
  const supabase = await createServiceRoleSupabaseClient();
  const storage = supabase.storage.from(config.bucket);

  const { data, error } = await storage.createSignedUploadUrl(path, {
    upsert: false,
  });

  if (error || !data) {
    writeLog({
      level: "error",
      message: "Admin upload sign failed",
      context: {
        kind: config.kind,
        bucket: config.bucket,
        error: error?.message ?? "no data returned",
      },
    });
    return privateNoStoreJson<SignErrorBody>(
      { error: "SIGN_FAILED", message: "החתימה נכשלה. נסו שוב." },
      { status: 500 },
    );
  }

  const { data: publicUrlData } = storage.getPublicUrl(path);

  return privateNoStoreJson<SignSuccessBody>(
    {
      bucket: config.bucket,
      path,
      token: data.token,
      publicUrl: publicUrlData.publicUrl,
      maxBytes: config.maxBytes,
    },
    { status: 200 },
  );
}

function invalid(message: string) {
  return privateNoStoreJson<SignErrorBody>(
    { error: "INVALID_REQUEST", message },
    { status: 400 },
  );
}

function sizeMessage(maxBytes: number): string {
  if (maxBytes >= 1024 * 1024) {
    return `הקובץ גדול מדי. הגודל המרבי הוא ${Math.floor(maxBytes / (1024 * 1024))}MB.`;
  }
  return `הקובץ גדול מדי. הגודל המרבי הוא ${Math.floor(maxBytes / 1024)}KB.`;
}

function messageForUnsupportedMime(kind: UploadKind): string {
  switch (kind) {
    case "logo":
      return "סוג הקובץ אינו נתמך. ניתן להעלות PNG, JPG, WEBP או SVG.";
    case "question-video":
      return "סוג הקובץ אינו נתמך. ניתן להעלות MP4 או WEBM.";
    case "question-image":
      return "סוג הקובץ אינו נתמך. ניתן להעלות PNG, JPG או WEBP.";
  }
}
