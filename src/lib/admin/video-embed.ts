/**
 * YouTube / Vimeo embed URL parser.
 *
 * Used by both the admin UI (preview the normalized URL before save) and
 * the question-save route handler (defence in depth against arbitrary URLs
 * being persisted to `questions.video_embed_url`). Hostname allowlist is the
 * primary safety net — we never construct an iframe `src` from anything that
 * doesn't pass through here.
 *
 * v1 scope: extract a video id, normalise to the provider's canonical
 * `<embed-host>/<id>` URL. We do NOT mirror the third-party clip into our
 * bucket (TOS), and we do NOT attempt to detect playlists or timestamps —
 * those are stripped to keep the player chrome predictable.
 */

export type VideoEmbedProvider = "youtube" | "vimeo";

export interface VideoEmbedParseSuccess {
  provider: VideoEmbedProvider;
  embedUrl: string;
}

export type VideoEmbedParseError =
  | "INVALID_URL"
  | "UNSUPPORTED_HOST"
  | "MISSING_VIDEO_ID";

export interface VideoEmbedParseFailure {
  error: VideoEmbedParseError;
}

export type VideoEmbedParseResult = VideoEmbedParseSuccess | VideoEmbedParseFailure;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);

const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID_PATTERN = /^[0-9]{6,}$/;

export function parseVideoEmbed(input: string): VideoEmbedParseResult {
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) {
    return { error: "INVALID_URL" };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { error: "INVALID_URL" };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { error: "INVALID_URL" };
  }
  // Reject userinfo bypass (https://x@malicious.example/...)
  if (parsed.username !== "" || parsed.password !== "") {
    return { error: "INVALID_URL" };
  }

  const host = parsed.hostname.toLowerCase();

  if (YOUTUBE_HOSTS.has(host)) {
    const id = extractYouTubeId(parsed);
    if (!id) return { error: "MISSING_VIDEO_ID" };
    return {
      provider: "youtube",
      embedUrl: `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`,
    };
  }

  if (VIMEO_HOSTS.has(host)) {
    const id = extractVimeoId(parsed);
    if (!id) return { error: "MISSING_VIDEO_ID" };
    return {
      provider: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${id}`,
    };
  }

  return { error: "UNSUPPORTED_HOST" };
}

export type VideoProvider = "self" | "youtube" | "vimeo";

export type ResolveVideoEmbedResult =
  | { ok: true; embedUrl: string | null; provider: VideoProvider | null }
  | { ok: false; reason: "BOTH_URLS" | "INVALID_EMBED" };

/**
 * Shared validation/normalisation for question-save route handlers.
 * - Mirrors the DB CHECK that forbids supplying both videoUrl and videoEmbedUrl.
 * - When videoEmbedUrl is present, normalises it via {@link parseVideoEmbed}
 *   and overrides the caller's provider with the parser's verdict.
 * - When videoEmbedUrl is absent, returns the caller's values untouched.
 */
export function resolveVideoEmbedFields(input: {
  videoUrl?: string | null;
  videoEmbedUrl?: string | null;
  videoProvider?: VideoProvider | null;
}): ResolveVideoEmbedResult {
  if (input.videoUrl && input.videoEmbedUrl) {
    return { ok: false, reason: "BOTH_URLS" };
  }
  if (!input.videoEmbedUrl) {
    return {
      ok: true,
      embedUrl: input.videoEmbedUrl ?? null,
      provider: input.videoProvider ?? null,
    };
  }
  const parsed = parseVideoEmbed(input.videoEmbedUrl);
  if ("error" in parsed) {
    return { ok: false, reason: "INVALID_EMBED" };
  }
  return { ok: true, embedUrl: parsed.embedUrl, provider: parsed.provider };
}

function extractYouTubeId(url: URL): string | null {
  const host = url.hostname.toLowerCase();

  // youtu.be/<id>
  if (host === "youtu.be") {
    const id = url.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
    return YOUTUBE_ID_PATTERN.test(id) ? id : null;
  }

  // youtube.com/watch?v=<id>
  const v = url.searchParams.get("v");
  if (v && YOUTUBE_ID_PATTERN.test(v)) return v;

  // youtube.com/embed/<id>  |  youtube.com/shorts/<id>  |  youtube.com/v/<id>
  const segments = url.pathname.split("/").filter(Boolean);
  const head = segments[0];
  const candidate = segments[1];
  if (
    candidate &&
    (head === "embed" || head === "shorts" || head === "v") &&
    YOUTUBE_ID_PATTERN.test(candidate)
  ) {
    return candidate;
  }

  return null;
}

function extractVimeoId(url: URL): string | null {
  // vimeo.com/<id>
  // vimeo.com/<id>/<hash>           (private link form — id is still the first segment)
  // player.vimeo.com/video/<id>
  const segments = url.pathname.split("/").filter(Boolean);
  const first = segments[0];
  if (!first) return null;

  if (url.hostname.toLowerCase() === "player.vimeo.com") {
    const second = segments[1];
    if (first !== "video" || !second) return null;
    return VIMEO_ID_PATTERN.test(second) ? second : null;
  }

  return VIMEO_ID_PATTERN.test(first) ? first : null;
}
