/**
 * Client-side image optimizer for admin question uploads.
 *
 * Smart resize — only re-encodes when the file exceeds the size OR dimension
 * thresholds, preserving crispness for sign/place-identification puzzles.
 * Uses createImageBitmap (applies EXIF orientation natively) with an
 * HTMLImageElement fallback for older Safari.
 */

export interface OptimizeResult {
  blob: Blob;
  /** Output width in pixels (post-resize, same as natural when resized: false). */
  width: number;
  /** Output height in pixels (post-resize, same as natural when resized: false). */
  height: number;
  /** Natural width of the decoded image BEFORE any resize. */
  naturalWidth: number;
  /** Natural height of the decoded image BEFORE any resize. */
  naturalHeight: number;
  beforeBytes: number;
  afterBytes: number;
  resized: boolean;
  outputType: string;
}

let warnedFallback = false;

async function decodeToBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    // imageOrientation: "from-image" is the default per MDN spec but we pass
    // it explicitly for clarity — applies EXIF rotation from phone photos.
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }

  // Fallback: HTMLImageElement + Image.decode() — EXIF rotation not applied.
  if (!warnedFallback) {
    console.warn(
      "[client-image-optimizer] createImageBitmap unavailable — " +
        "falling back to Image.decode(). EXIF orientation will not be corrected.",
    );
    warnedFallback = true;
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return createImageBitmap(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function blobViaCanvas(
  bitmap: ImageBitmap,
  targetW: number,
  targetH: number,
): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(targetW, targetH);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("[client-image-optimizer] OffscreenCanvas 2d context unavailable");
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.85 });
    if (!blob) throw new Error("[client-image-optimizer] OffscreenCanvas.convertToBlob returned null");
    return blob;
  }

  // HTMLCanvasElement fallback (main thread)
  return new Promise<Blob>((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("[client-image-optimizer] Canvas 2d context unavailable"));
      return;
    }
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("[client-image-optimizer] canvas.toBlob returned null"));
      },
      "image/webp",
      0.85,
    );
  });
}

export async function optimizeForUpload(
  file: File,
  options: { maxBytes: number; maxLongSide: number },
): Promise<OptimizeResult> {
  const { maxBytes, maxLongSide } = options;
  const beforeBytes = file.size;

  const bitmap = await decodeToBitmap(file);
  const naturalW = bitmap.width;
  const naturalH = bitmap.height;

  try {
    const longSide = Math.max(naturalW, naturalH);
    if (beforeBytes <= maxBytes && longSide <= maxLongSide) {
      // Fast path: return the original file unchanged — preserves crispness.
      return {
        blob: file,
        width: naturalW,
        height: naturalH,
        naturalWidth: naturalW,
        naturalHeight: naturalH,
        beforeBytes,
        afterBytes: file.size,
        resized: false,
        outputType: file.type,
      };
    }

    // Scale so the longest side equals maxLongSide, preserving aspect ratio.
    const scale = Math.min(1, maxLongSide / longSide);
    const targetW = Math.round(naturalW * scale);
    const targetH = Math.round(naturalH * scale);

    const blob = await blobViaCanvas(bitmap, targetW, targetH);

    return {
      blob,
      width: targetW,
      height: targetH,
      naturalWidth: naturalW,
      naturalHeight: naturalH,
      beforeBytes,
      afterBytes: blob.size,
      resized: true,
      outputType: "image/webp",
    };
  } finally {
    bitmap.close();
  }
}
