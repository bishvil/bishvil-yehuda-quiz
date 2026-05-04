import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LogoUploader } from "@/src/components/admin/upload/LogoUploader";
import { QuestionImageUploader } from "@/src/components/admin/upload/QuestionImageUploader";

const fetchMock = vi.fn();

/**
 * Minimal ImageBitmap stub. jsdom does not implement createImageBitmap or
 * canvas drawing, so we stub them globally for tests that exercise the
 * QuestionImageUploader's optimizer path.
 */
function makeImageBitmapStub(width = 100, height = 100) {
  return {
    width,
    height,
    close: vi.fn(),
  } as unknown as ImageBitmap;
}

describe("admin upload controls", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    // jsdom does not implement URL.createObjectURL / revokeObjectURL.
    // Attach them as own properties on the real URL constructor so the
    // constructor itself stays callable for next/image's internal
    // `new URL(...)` under jsdom.
    (URL as unknown as { createObjectURL: () => string }).createObjectURL =
      vi.fn(() => "blob:preview");
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL =
      vi.fn();

    // Stub createImageBitmap so the optimizer can run in jsdom.
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(makeImageBitmapStub()));

    // Stub OffscreenCanvas with a convertToBlob that returns a tiny webp blob.
    const tinyBlob = new Blob(["fake-webp"], { type: "image/webp" });
    vi.stubGlobal(
      "OffscreenCanvas",
      vi.fn().mockImplementation(() => ({
        getContext: vi.fn().mockReturnValue({ drawImage: vi.fn() }),
        convertToBlob: vi.fn().mockResolvedValue(tinyBlob),
      })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uploads a logo and renders the returned preview URL", async () => {
    const onChange = vi.fn();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          url: "http://storage.local/brand-logos/admin/logo.png",
          path: "admin/logo.png",
        }),
        { status: 201 },
      ),
    );

    render(
      <LogoUploader
        value="http://storage.local/brand-logos/admin/logo.png"
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByTestId("admin-upload-input"), {
      target: {
        files: [new File(["logo"], "לוגו.png", { type: "image/png" })],
      },
    });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/uploads/logo",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        "http://storage.local/brand-logos/admin/logo.png",
        expect.objectContaining({ path: "admin/logo.png" }),
      ),
    );

    const preview = screen.getByTestId("admin-upload-preview");
    expect(preview).toHaveAttribute(
      "src",
      "http://storage.local/brand-logos/admin/logo.png",
    );
  });

  it("shows an error when the upload route rejects a question image", async () => {
    // The optimizer runs but the server rejects — the error message from the
    // server should surface in the UI.
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "UNSUPPORTED_MEDIA_TYPE",
          message: "סוג הקובץ אינו נתמך.",
        }),
        { status: 415 },
      ),
    );

    render(<QuestionImageUploader value={null} onChange={vi.fn()} />);

    fireEvent.change(screen.getByTestId("admin-upload-input"), {
      target: {
        files: [new File(["image"], "station.png", { type: "image/png" })],
      },
    });

    expect(await screen.findByTestId("admin-upload-error")).toHaveTextContent(
      "סוג הקובץ אינו נתמך.",
    );
  });

  it("validates client-side size before uploading", async () => {
    render(<LogoUploader value={null} onChange={vi.fn()} />);

    fireEvent.change(screen.getByTestId("admin-upload-input"), {
      target: {
        files: [
          new File([new Uint8Array(512 * 1024 + 1)], "large.png", {
            type: "image/png",
          }),
        ],
      },
    });

    expect(await screen.findByTestId("admin-upload-error")).toHaveTextContent(
      "הקובץ גדול מדי",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("imports an external URL via the import endpoint and calls onChange with the mirrored URL", async () => {
    const onChange = vi.fn();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          url: "https://cdn.example.com/question-images/admin/abc.jpg",
          path: "admin/abc.jpg",
        }),
        { status: 201 },
      ),
    );

    render(<QuestionImageUploader value={null} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText("שימוש בכתובת חיצונית"));
    fireEvent.change(screen.getByTestId("admin-upload-external-url"), {
      target: { value: "https://example.com/photo.jpg" },
    });

    fireEvent.click(screen.getByTestId("admin-upload-import-button"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/uploads/import-url",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        "https://cdn.example.com/question-images/admin/abc.jpg",
        expect.objectContaining({ path: "admin/abc.jpg" }),
      ),
    );
  });

  it("shows keep-original-quality checkbox only for question images (not logo)", () => {
    const { unmount: unmountQ } = render(
      <QuestionImageUploader value={null} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText("שמור איכות מלאה")).toBeInTheDocument();
    unmountQ();

    render(<LogoUploader value={null} onChange={vi.fn()} />);
    expect(screen.queryByLabelText("שמור איכות מלאה")).not.toBeInTheDocument();
  });

  it("passes optimized dimensions to onChange after a successful question image upload", async () => {
    const onChange = vi.fn();

    // Return a large file so the optimizer actually re-encodes (100×100 < 2400 but
    // file.size > maxBytes triggers compression in the stub).
    // The bitmap stub returns 100×100, OffscreenCanvas returns a tiny webp blob.
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          url: "http://storage.local/question-images/admin/upload.webp",
          path: "admin/upload.webp",
          width: 100,
          height: 100,
        }),
        { status: 201 },
      ),
    );

    render(<QuestionImageUploader value={null} onChange={onChange} />);

    // Use a file larger than 2 MB to trigger the optimizer resize path.
    fireEvent.change(screen.getByTestId("admin-upload-input"), {
      target: {
        files: [
          new File(
            [new Uint8Array(3 * 1024 * 1024)],
            "big-photo.jpg",
            { type: "image/jpeg" },
          ),
        ],
      },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        "http://storage.local/question-images/admin/upload.webp",
        expect.objectContaining({ path: "admin/upload.webp", width: 100, height: 100 }),
      ),
    );
  });
});
