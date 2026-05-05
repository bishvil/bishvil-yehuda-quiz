"use client";

import { createBrowserSupabaseClient } from "@/src/lib/supabase/browser";

export type AdminUploadKind = "logo" | "question-image" | "question-video";

export interface UploadViaSignedUrlInput {
  kind: AdminUploadKind;
  /** Must have a non-empty `.type` — the helper uses it for both validation and the PUT Content-Type. */
  blob: Blob;
}

export interface UploadViaSignedUrlSuccess {
  ok: true;
  url: string;
  path: string;
}

export interface UploadViaSignedUrlFailure {
  ok: false;
  message: string;
  /** Discriminator for the caller to decide whether to clear the preview, etc. */
  stage: "sign" | "upload" | "network";
}

interface SignSuccessBody {
  bucket: string;
  path: string;
  token: string;
  publicUrl: string;
  maxBytes: number;
}

interface SignErrorBody {
  error?: string;
  message?: string;
}

const NETWORK_ERROR_MESSAGE = "ההעלאה נכשלה. בדקו את החיבור ונסו שוב.";
const GENERIC_UPLOAD_FAILURE = "שמירת הקובץ נכשלה.";

/**
 * Run the full direct-to-Supabase upload dance for admin assets:
 *
 *   1. POST /api/admin/uploads/sign with `{ kind, mimeType, size }`.
 *   2. PUT the blob directly to the signed URL using the browser Supabase
 *      client's `uploadToSignedUrl(path, token, blob)`.
 *   3. Return the public URL the server already computed for us.
 *
 * Bytes never traverse Vercel's serverless function boundary, so the 4.5 MB
 * platform body limit no longer applies.
 */
export async function uploadViaSignedUrl(
  input: UploadViaSignedUrlInput,
): Promise<UploadViaSignedUrlSuccess | UploadViaSignedUrlFailure> {
  const contentType = input.blob.type;

  let signResponse: Response;
  try {
    signResponse = await fetch("/api/admin/uploads/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: input.kind,
        mimeType: contentType,
        size: input.blob.size,
      }),
    });
  } catch {
    return { ok: false, stage: "network", message: NETWORK_ERROR_MESSAGE };
  }

  let signBody: SignSuccessBody | SignErrorBody | null = null;
  try {
    signBody = (await signResponse.json()) as SignSuccessBody | SignErrorBody;
  } catch {
    signBody = null;
  }

  if (!signResponse.ok || !signBody || !("token" in signBody)) {
    return {
      ok: false,
      stage: "sign",
      message:
        (signBody as SignErrorBody | null)?.message ?? GENERIC_UPLOAD_FAILURE,
    };
  }

  const { bucket, path, token, publicUrl } = signBody;

  const supabase = createBrowserSupabaseClient();
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(path, token, input.blob, {
      contentType,
      cacheControl: "31536000",
    });

  if (uploadError) {
    return { ok: false, stage: "upload", message: GENERIC_UPLOAD_FAILURE };
  }

  return { ok: true, url: publicUrl, path };
}
