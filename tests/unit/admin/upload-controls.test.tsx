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

describe("admin upload controls", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn(),
    });
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
      ),
    );

    const preview = screen.getByTestId("admin-upload-preview");
    expect(preview).toHaveAttribute(
      "src",
      "http://storage.local/brand-logos/admin/logo.png",
    );
  });

  it("shows an error when the upload route rejects a question image", async () => {
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

  it("keeps an external URL fallback for question images", () => {
    const onChange = vi.fn();
    render(<QuestionImageUploader value={null} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText("שימוש בכתובת חיצונית"));
    fireEvent.change(screen.getByTestId("admin-upload-external-url"), {
      target: { value: "https://example.com/photo.jpg" },
    });

    expect(onChange).toHaveBeenCalledWith("https://example.com/photo.jpg");
  });
});
