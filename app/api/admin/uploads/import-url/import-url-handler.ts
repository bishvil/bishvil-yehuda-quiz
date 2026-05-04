import { randomUUID } from "node:crypto";

import { requireRole } from "@/src/lib/auth/server-auth";
import { getRequiredEnvironmentVariable } from "@/src/lib/env";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { writeLog } from "@/src/lib/logging";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";
import { consumeUploadToken } from "../rate-limit";
import { extensionForMime } from "../upload-handler";

const QUESTION_IMAGES_BUCKET = "question-images";
const MAX_BYTES = 2 * 1024 * 1024;
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Hostname of the project's own Supabase instance — blocked to prevent SSRF. */
function getSupabaseHostname(): string {
  try {
    return new URL(
      getRequiredEnvironmentVariable("NEXT_PUBLIC_SUPABASE_URL"),
    ).hostname.toLowerCase();
  } catch {
    return "";
  }
}

const SUPABASE_HOSTNAME = getSupabaseHostname();

// ---- Response body types -----------------------------------------------

interface ImportUrlSuccessBody {
  url: string;
  path: string;
}

interface ImportUrlErrorBody {
  error:
    | "INVALID_REQUEST"
    | "UNAUTHORIZED"
    | "RATE_LIMITED"
    | "FILE_TOO_LARGE"
    | "UNSUPPORTED_MEDIA_TYPE"
    | "FETCH_FAILED"
    | "SSRF_BLOCKED"
    | "UPLOAD_FAILED";
  message: string;
}

// ---- SSRF guard -------------------------------------------------------

/**
 * Checks whether a dotted-decimal IPv4 string falls within a private/reserved
 * range. Returns `true` when the address must be blocked.
 *
 * Covered ranges: 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8, 169.254.0.0/16,
 * 172.16.0.0/12, 192.168.0.0/16.
 */
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map(Number);
  if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) {
    return false;
  }
  const a = octets[0]!;
  const b = octets[1]!;
  if (a === 0) return true;                        // 0.0.0.0/8
  if (a === 10) return true;                       // 10.0.0.0/8
  if (a === 127) return true;                      // 127.0.0.0/8
  if (a === 169 && b === 254) return true;         // 169.254.0.0/16 (link-local)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true;         // 192.168.0.0/16
  return false;
}

/**
 * Returns `true` when the hostname string looks like an IPv6 address in a
 * private or link-local range that should be blocked.
 *
 * Covered: ::1 (loopback), fe80::/10 (link-local), fc00::/7 (ULA).
 * Brackets are stripped before comparison.
 */
function isBlockedIpv6(hostname: string): boolean {
  const raw = hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (raw === "::1") return true;
  // fe80::/10 covers fe80–febf
  if (raw.startsWith("fe8") || raw.startsWith("fe9") ||
      raw.startsWith("fea") || raw.startsWith("feb")) return true;
  // fc00::/7 covers fc00–fdff (ULA)
  if (raw.startsWith("fc") || raw.startsWith("fd")) return true;
  return false;
}

/** Discriminated result from the URL validator. */
export type UrlValidationError =
  | { kind: "invalid"; message: string }
  | { kind: "scheme"; message: string }
  | { kind: "blocked"; message: string };

/**
 * Performs synchronous (pre-network) SSRF validation of a URL.
 * Returns `null` when the URL passes all checks.
 *
 * NOTE: DNS rebinding (resolve-then-compare) is not feasible with the
 * standard `fetch` API in Vercel's Node runtime — there is no hook between
 * DNS resolution and connection. The static blocks below (RFC 1918, loopback,
 * link-local, Supabase hostname) are the primary defense.
 */
export function validateUrlForImport(raw: string): UrlValidationError | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { kind: "invalid", message: "כתובת לא תקינה." };
  }

  // Enforce https-only — reject http, data:, file:, javascript:, etc.
  if (parsed.protocol !== "https:") {
    return { kind: "scheme", message: "כתובת לא נתמכת — חובה https." };
  }

  // Reject userinfo (e.g. https://user@10.0.0.1/) — bypass vector.
  if (parsed.username !== "" || parsed.password !== "") {
    return { kind: "invalid", message: "כתובת לא תקינה." };
  }

  // Strip trailing dot for hostname comparisons.
  const hostname = parsed.hostname.replace(/\.$/, "").toLowerCase();

  // Block localhost and *.localhost.
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { kind: "blocked", message: "כתובת חסומה." };
  }

  // Block the project's own Supabase host (and any subdomain).
  if (
    SUPABASE_HOSTNAME &&
    (hostname === SUPABASE_HOSTNAME || hostname.endsWith(`.${SUPABASE_HOSTNAME}`))
  ) {
    return { kind: "blocked", message: "כתובת חסומה." };
  }

  // Block private IPv4 ranges.
  if (isPrivateIpv4(hostname)) {
    return { kind: "blocked", message: "כתובת חסומה." };
  }

  // Block private/link-local IPv6.
  if (isBlockedIpv6(hostname)) {
    return { kind: "blocked", message: "כתובת חסומה." };
  }

  return null;
}

// ---- Streaming byte-capped GET ----------------------------------------

/**
 * Fetches the URL with a hard byte cap. Returns the accumulated bytes and
 * the final response Content-Type header.
 *
 * Throws with `{ code: "FILE_TOO_LARGE" | "FETCH_FAILED" }` on failure.
 */
async function fetchWithCap(
  url: string,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const controller = new AbortController();
  const timeoutSignal = AbortSignal.timeout(15_000);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.any([timeoutSignal, controller.signal]),
      redirect: "follow",
      cache: "no-store",
      headers: { Accept: "image/png, image/jpeg, image/webp" },
    });
  } catch (err) {
    throw { code: "FETCH_FAILED", cause: err };
  }

  if (!response.ok || !response.body) {
    throw { code: "FETCH_FAILED", cause: `HTTP ${response.status}` };
  }

  const contentType = (
    (response.headers.get("content-type") ?? "").split(";")[0] ?? ""
  )
    .trim()
    .toLowerCase();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        controller.abort();
        throw { code: "FILE_TOO_LARGE" };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  // Merge chunks into a single Uint8Array.
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { bytes, contentType };
}

// ---- Main handler -----------------------------------------------------

export async function handleImportUrl(body: unknown) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  if (!consumeUploadToken(`import-url:${auth.claims.userId}`)) {
    return privateNoStoreJson<ImportUrlErrorBody>(
      {
        error: "RATE_LIMITED",
        message: "יותר מדי ייבואים בפרק זמן קצר. נסו שוב בעוד רגע.",
      },
      { status: 429 },
    );
  }

  // Input validation.
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).url !== "string"
  ) {
    return privateNoStoreJson<ImportUrlErrorBody>(
      { error: "INVALID_REQUEST", message: "כתובת לא תקינה." },
      { status: 400 },
    );
  }

  const rawUrl = ((body as Record<string, unknown>).url as string).trim();

  const validationError = validateUrlForImport(rawUrl);
  if (validationError) {
    if (validationError.kind === "blocked") {
      return privateNoStoreJson<ImportUrlErrorBody>(
        { error: "SSRF_BLOCKED", message: validationError.message },
        { status: 422 },
      );
    }
    // "invalid" or "scheme"
    return privateNoStoreJson<ImportUrlErrorBody>(
      { error: "INVALID_REQUEST", message: validationError.message },
      { status: 400 },
    );
  }

  // --- HEAD preflight: fast bail-out on known-oversized Content-Length ---
  try {
    const headRes = await fetch(rawUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(5_000),
      redirect: "follow",
      cache: "no-store",
    });

    if (headRes.ok) {
      const headLength = Number(headRes.headers.get("content-length") ?? "");
      if (Number.isFinite(headLength) && headLength > MAX_BYTES + MULTIPART_OVERHEAD_BYTES) {
        return privateNoStoreJson<ImportUrlErrorBody>(
          {
            error: "FILE_TOO_LARGE",
            message: `התמונה גדולה מדי. הגודל המרבי הוא ${Math.floor(MAX_BYTES / 1024)}KB.`,
          },
          { status: 413 },
        );
      }
    }
  } catch {
    // HEAD failed — fall through to streaming GET.
  }

  // --- Streaming GET with hard byte cap ---
  // HEAD is not a trust grant for the body — re-validate MIME and byte count
  // regardless of what HEAD returned.
  let bytes: Uint8Array;
  let contentType: string;
  try {
    ({ bytes, contentType } = await fetchWithCap(rawUrl, MAX_BYTES));
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "FILE_TOO_LARGE") {
      return privateNoStoreJson<ImportUrlErrorBody>(
        {
          error: "FILE_TOO_LARGE",
          message: `התמונה גדולה מדי. הגודל המרבי הוא ${Math.floor(MAX_BYTES / 1024)}KB.`,
        },
        { status: 413 },
      );
    }
    writeLog({
      level: "warn",
      message: "import-url fetch failed",
      context: {
        kind: "import-url",
        url: rawUrl.slice(0, 200),
      },
    });
    return privateNoStoreJson<ImportUrlErrorBody>(
      { error: "FETCH_FAILED", message: "לא ניתן לאחזר את הכתובת." },
      { status: 502 },
    );
  }

  if (bytes.byteLength === 0) {
    return privateNoStoreJson<ImportUrlErrorBody>(
      { error: "FETCH_FAILED", message: "לא ניתן לאחזר את הכתובת." },
      { status: 502 },
    );
  }

  // MIME check — parity with upload-handler.ts which trusts Content-Type
  // header (no magic-bytes sniffing). Deliberate: matches in-house upload behaviour.
  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    return privateNoStoreJson<ImportUrlErrorBody>(
      {
        error: "UNSUPPORTED_MEDIA_TYPE",
        message: "סוג הקובץ אינו נתמך. ניתן לייבא PNG, JPG או WEBP.",
      },
      { status: 415 },
    );
  }

  let ext: "png" | "jpg" | "webp";
  try {
    const derived = extensionForMime(contentType);
    if (derived === "svg") throw new Error("SVG not allowed for question images");
    ext = derived;
  } catch {
    return privateNoStoreJson<ImportUrlErrorBody>(
      {
        error: "UNSUPPORTED_MEDIA_TYPE",
        message: "סוג הקובץ אינו נתמך. ניתן לייבא PNG, JPG או WEBP.",
      },
      { status: 415 },
    );
  }

  const path = `${auth.claims.userId}/${randomUUID()}.${ext}`;
  const serviceSupabase = await createServiceRoleSupabaseClient();
  const { error: uploadError } = await serviceSupabase.storage
    .from(QUESTION_IMAGES_BUCKET)
    .upload(path, new Blob([bytes.buffer as ArrayBuffer], { type: contentType }), {
      contentType,
      cacheControl: "31536000",
      upsert: false,
    });

  if (uploadError) {
    writeLog({
      level: "error",
      message: "import-url storage upload failed",
      context: {
        kind: "import-url",
        bucket: QUESTION_IMAGES_BUCKET,
        error: uploadError.message,
      },
    });
    return privateNoStoreJson<ImportUrlErrorBody>(
      { error: "UPLOAD_FAILED", message: "שמירת הקובץ נכשלה." },
      { status: 500 },
    );
  }

  const { data } = serviceSupabase.storage
    .from(QUESTION_IMAGES_BUCKET)
    .getPublicUrl(path);

  return privateNoStoreJson<ImportUrlSuccessBody>(
    { url: data.publicUrl, path },
    { status: 201 },
  );
}
