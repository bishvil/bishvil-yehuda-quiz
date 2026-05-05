/**
 * Shared configuration and helpers for admin upload endpoints.
 *
 * Both the legacy multipart `import-url` route and the signed-upload-URL
 * route use these constants so that bucket names, MIME allowlists, and size
 * caps stay in sync across the codebase.
 */

export type UploadKind = "logo" | "question-image" | "question-video";

export type UploadBucket =
  | "brand-logos"
  | "question-images"
  | "question-videos";

export interface UploadConfig {
  kind: UploadKind;
  bucket: UploadBucket;
  maxBytes: number;
  allowedMimeTypes: ReadonlySet<string>;
}

export const LOGO_UPLOAD_CONFIG: UploadConfig = {
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

export const QUESTION_IMAGE_UPLOAD_CONFIG: UploadConfig = {
  kind: "question-image",
  bucket: "question-images",
  maxBytes: 2 * 1024 * 1024,
  allowedMimeTypes: new Set(["image/png", "image/jpeg", "image/webp"]),
};

export const QUESTION_VIDEO_UPLOAD_CONFIG: UploadConfig = {
  kind: "question-video",
  bucket: "question-videos",
  maxBytes: 25 * 1024 * 1024,
  allowedMimeTypes: new Set(["video/mp4", "video/webm"]),
};

export const UPLOAD_CONFIG_BY_KIND: Record<UploadKind, UploadConfig> = {
  "logo": LOGO_UPLOAD_CONFIG,
  "question-image": QUESTION_IMAGE_UPLOAD_CONFIG,
  "question-video": QUESTION_VIDEO_UPLOAD_CONFIG,
};

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
