/**
 * Unit tests for the client-side image optimizer helper.
 *
 * jsdom provides neither createImageBitmap nor canvas, so we stub them
 * globally and verify the optimizer's logic branches independently of
 * the browser rendering stack.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { optimizeForUpload } from "@/src/components/admin/upload/client-image-optimizer";

const SMALL_PNG_BYTES = 10 * 1024; // 10 KB — below 2 MB threshold
const LARGE_PNG_BYTES = 3 * 1024 * 1024; // 3 MB — above threshold

function makeBitmapStub(width: number, height: number): ImageBitmap {
  return { width, height, close: vi.fn() } as unknown as ImageBitmap;
}

function makeTinyWebpBlob() {
  return new Blob(["fake-webp-data"], { type: "image/webp" });
}

function makeOffscreenCanvasMock(blob: Blob) {
  return vi.fn().mockImplementation(() => ({
    getContext: vi.fn().mockReturnValue({ drawImage: vi.fn() }),
    convertToBlob: vi.fn().mockResolvedValue(blob),
  }));
}

describe("optimizeForUpload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("fast path — file within budget", () => {
    beforeEach(() => {
      vi.stubGlobal(
        "createImageBitmap",
        vi.fn().mockResolvedValue(makeBitmapStub(800, 600)),
      );
    });

    it("returns the original file unchanged when size and dimensions are within limits", async () => {
      const file = new File([new Uint8Array(SMALL_PNG_BYTES)], "photo.png", {
        type: "image/png",
      });

      const result = await optimizeForUpload(file, {
        maxBytes: 2 * 1024 * 1024,
        maxLongSide: 2400,
      });

      expect(result.resized).toBe(false);
      expect(result.blob).toBe(file);
      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
      expect(result.outputType).toBe("image/png");
      expect(result.beforeBytes).toBe(SMALL_PNG_BYTES);
      expect(result.afterBytes).toBe(SMALL_PNG_BYTES);
    });

    it("closes the bitmap even on the fast path", async () => {
      const bitmap = makeBitmapStub(100, 100);
      vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));

      const file = new File([new Uint8Array(SMALL_PNG_BYTES)], "photo.png", {
        type: "image/png",
      });

      await optimizeForUpload(file, { maxBytes: 2 * 1024 * 1024, maxLongSide: 2400 });

      expect(bitmap.close).toHaveBeenCalled();
    });
  });

  describe("resize path — file exceeds size limit", () => {
    let webpBlob: Blob;

    beforeEach(() => {
      webpBlob = makeTinyWebpBlob();
      vi.stubGlobal(
        "createImageBitmap",
        vi.fn().mockResolvedValue(makeBitmapStub(4032, 3024)),
      );
      vi.stubGlobal("OffscreenCanvas", makeOffscreenCanvasMock(webpBlob));
    });

    it("re-encodes to webp when file exceeds maxBytes", async () => {
      const file = new File([new Uint8Array(LARGE_PNG_BYTES)], "phone.jpg", {
        type: "image/jpeg",
      });

      const result = await optimizeForUpload(file, {
        maxBytes: 2 * 1024 * 1024,
        maxLongSide: 2400,
      });

      expect(result.resized).toBe(true);
      expect(result.outputType).toBe("image/webp");
      expect(result.blob).toBe(webpBlob);
      expect(result.beforeBytes).toBe(LARGE_PNG_BYTES);
    });

    it("scales longest side to maxLongSide preserving aspect ratio", async () => {
      // 4032 × 3024 → longest side 4032, scale factor = 2400/4032 ≈ 0.595
      const file = new File([new Uint8Array(LARGE_PNG_BYTES)], "phone.jpg", {
        type: "image/jpeg",
      });

      const result = await optimizeForUpload(file, {
        maxBytes: 2 * 1024 * 1024,
        maxLongSide: 2400,
      });

      const scale = 2400 / 4032;
      expect(result.width).toBe(Math.round(4032 * scale));
      expect(result.height).toBe(Math.round(3024 * scale));
    });

    it("closes the bitmap after resize", async () => {
      const bitmap = makeBitmapStub(4032, 3024);
      vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));

      const file = new File([new Uint8Array(LARGE_PNG_BYTES)], "phone.jpg", {
        type: "image/jpeg",
      });

      await optimizeForUpload(file, { maxBytes: 2 * 1024 * 1024, maxLongSide: 2400 });

      expect(bitmap.close).toHaveBeenCalled();
    });
  });

  describe("resize path — dimensions exceed maxLongSide but size is under limit", () => {
    it("re-encodes a large-dimension but small-byte file", async () => {
      const webpBlob = makeTinyWebpBlob();
      vi.stubGlobal(
        "createImageBitmap",
        vi.fn().mockResolvedValue(makeBitmapStub(3000, 2000)),
      );
      vi.stubGlobal("OffscreenCanvas", makeOffscreenCanvasMock(webpBlob));

      const file = new File([new Uint8Array(SMALL_PNG_BYTES)], "wide.png", {
        type: "image/png",
      });

      const result = await optimizeForUpload(file, {
        maxBytes: 2 * 1024 * 1024,
        maxLongSide: 2400,
      });

      // 3000 > 2400 so it must resize even though file is small
      expect(result.resized).toBe(true);
      expect(result.width).toBe(2400);
      expect(result.height).toBe(Math.round(2000 * (2400 / 3000)));
    });
  });

  describe("error handling", () => {
    it("throws when createImageBitmap rejects", async () => {
      vi.stubGlobal(
        "createImageBitmap",
        vi.fn().mockRejectedValue(new Error("decode failed")),
      );

      const file = new File(["bad"], "bad.jpg", { type: "image/jpeg" });

      await expect(
        optimizeForUpload(file, { maxBytes: 2 * 1024 * 1024, maxLongSide: 2400 }),
      ).rejects.toThrow("decode failed");
    });

    it("throws a descriptive error when convertToBlob returns null/undefined", async () => {
      vi.stubGlobal(
        "createImageBitmap",
        vi.fn().mockResolvedValue(makeBitmapStub(4000, 3000)),
      );
      // Simulate OffscreenCanvas.convertToBlob resolving to null/undefined.
      vi.stubGlobal(
        "OffscreenCanvas",
        vi.fn().mockImplementation(() => ({
          getContext: vi.fn().mockReturnValue({ drawImage: vi.fn() }),
          convertToBlob: vi.fn().mockResolvedValue(null),
        })),
      );

      const file = new File([new Uint8Array(LARGE_PNG_BYTES)], "photo.jpg", {
        type: "image/jpeg",
      });

      await expect(
        optimizeForUpload(file, { maxBytes: 2 * 1024 * 1024, maxLongSide: 2400 }),
      ).rejects.toThrow("convertToBlob returned null");
    });
  });
});
