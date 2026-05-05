/**
 * Tests for AdminVideoUploadControl.
 *
 * The direct-to-Supabase upload helper (`uploadViaSignedUrl`) is fully mocked
 * — these tests cover only the component's UI behavior, callback contract,
 * and metadata enrichment via the `loadedmetadata` event.
 *
 * jsdom does not fire loadedmetadata automatically; we simulate it by
 * setting duration/videoWidth/videoHeight on the video element and
 * dispatching the event manually.
 *
 * The extractPosterFrame helper is stubbed to return null throughout —
 * poster extraction is tested at the integration level, not here.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const uploadViaSignedUrlMock = vi.hoisted(() => vi.fn());

vi.mock("@/src/lib/admin/upload-via-signed-url", () => ({
  uploadViaSignedUrl: uploadViaSignedUrlMock,
}));

import { AdminVideoUploadControl } from "@/src/components/admin/upload/video-upload-control";

beforeEach(() => {
  uploadViaSignedUrlMock.mockReset();
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL =
    vi.fn(() => "blob:video-preview");
  (
    URL as unknown as { revokeObjectURL: (u: string) => void }
  ).revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Returns null immediately so tests don't hang on jsdom video stubs. */
const noPosterExtraction = vi.fn().mockResolvedValue(null);

function makeDefaultProps(
  overrides: Partial<React.ComponentProps<typeof AdminVideoUploadControl>> = {},
) {
  return {
    value: null,
    onChange: vi.fn(),
    title: "סרטון שאלה",
    help: "גררו קובץ",
    buttonText: "בחירת סרטון",
    replaceText: "החלפת סרטון",
    removeText: "הסרת סרטון",
    embedUrlLabel: "YouTube / Vimeo",
    _extractPosterFrame: noPosterExtraction,
    ...overrides,
  };
}

describe("AdminVideoUploadControl — file upload", () => {
  it("rejects files with an unsupported MIME type without calling the upload helper", async () => {
    render(<AdminVideoUploadControl {...makeDefaultProps()} />);

    fireEvent.change(screen.getByTestId("admin-video-upload-input"), {
      target: {
        files: [new File(["data"], "clip.avi", { type: "video/avi" })],
      },
    });

    expect(await screen.findByTestId("admin-video-upload-error")).toHaveTextContent(
      "סוג הקובץ אינו נתמך",
    );
    expect(uploadViaSignedUrlMock).not.toHaveBeenCalled();
  });

  it("rejects files exceeding 25 MB without calling the upload helper", async () => {
    render(<AdminVideoUploadControl {...makeDefaultProps()} />);

    fireEvent.change(screen.getByTestId("admin-video-upload-input"), {
      target: {
        files: [
          new File([new Uint8Array(26 * 1024 * 1024)], "big.mp4", {
            type: "video/mp4",
          }),
        ],
      },
    });

    expect(await screen.findByTestId("admin-video-upload-error")).toHaveTextContent(
      "הקובץ גדול מדי",
    );
    expect(uploadViaSignedUrlMock).not.toHaveBeenCalled();
  });

  it("uploads via signed URL and fires onChange with url+path on success", async () => {
    const onChange = vi.fn();
    uploadViaSignedUrlMock.mockResolvedValue({
      ok: true,
      url: "https://cdn.example.com/question-videos/admin/clip.mp4",
      path: "admin/clip.mp4",
    });

    render(<AdminVideoUploadControl {...makeDefaultProps({ onChange })} />);

    fireEvent.change(screen.getByTestId("admin-video-upload-input"), {
      target: {
        files: [new File(["video-data"], "clip.mp4", { type: "video/mp4" })],
      },
    });

    await waitFor(() =>
      expect(uploadViaSignedUrlMock).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "question-video",
          blob: expect.objectContaining({ type: "video/mp4" }),
        }),
      ),
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        "https://cdn.example.com/question-videos/admin/clip.mp4",
        expect.objectContaining({
          kind: "self",
          path: "admin/clip.mp4",
          mimeType: "video/mp4",
        }),
      ),
    );
  });

  it("surfaces an error message when the upload helper fails", async () => {
    uploadViaSignedUrlMock.mockResolvedValue({
      ok: false,
      stage: "sign",
      message: "קובץ גדול מדי.",
    });

    render(<AdminVideoUploadControl {...makeDefaultProps()} />);

    fireEvent.change(screen.getByTestId("admin-video-upload-input"), {
      target: {
        files: [new File(["v"], "clip.mp4", { type: "video/mp4" })],
      },
    });

    expect(await screen.findByTestId("admin-video-upload-error")).toHaveTextContent(
      "קובץ גדול מדי.",
    );
  });
});

describe("AdminVideoUploadControl — loadedmetadata simulation", () => {
  it("populates duration, width and height via onChange after loadedmetadata fires", async () => {
    const onChange = vi.fn();
    uploadViaSignedUrlMock.mockResolvedValue({
      ok: true,
      url: "https://cdn.example.com/question-videos/admin/clip.mp4",
      path: "admin/clip.mp4",
    });

    render(<AdminVideoUploadControl {...makeDefaultProps({ onChange })} />);

    fireEvent.change(screen.getByTestId("admin-video-upload-input"), {
      target: {
        files: [new File(["v"], "clip.mp4", { type: "video/mp4" })],
      },
    });

    await waitFor(() => expect(onChange).toHaveBeenCalled());

    const videoEl = await screen.findByTestId("admin-video-preview") as HTMLVideoElement;

    Object.defineProperty(videoEl, "duration", { value: 22.7, configurable: true });
    Object.defineProperty(videoEl, "videoWidth", { value: 1920, configurable: true });
    Object.defineProperty(videoEl, "videoHeight", { value: 1080, configurable: true });
    Object.defineProperty(videoEl, "readyState", { value: 0, configurable: true });

    fireEvent(videoEl, new Event("loadedmetadata"));

    await waitFor(() => {
      const calls = onChange.mock.calls;
      const metaCall = calls.find(
        ([, meta]) =>
          meta.durationSeconds !== undefined && meta.durationSeconds > 0,
      );
      expect(metaCall).toBeDefined();
      expect(metaCall![1]).toMatchObject({
        kind: "self",
        durationSeconds: 23,
        width: 1920,
        height: 1080,
      });
    });
  });
});

describe("AdminVideoUploadControl — embed URL", () => {
  it("shows the embed input when the checkbox is ticked", async () => {
    render(<AdminVideoUploadControl {...makeDefaultProps()} />);

    fireEvent.click(screen.getByLabelText("YouTube / Vimeo"));
    expect(await screen.findByTestId("admin-video-embed-url-input")).toBeInTheDocument();
  });

  it("shows an error for an invalid embed URL and does not call onChange", async () => {
    const onChange = vi.fn();
    render(<AdminVideoUploadControl {...makeDefaultProps({ onChange })} />);

    fireEvent.click(screen.getByLabelText("YouTube / Vimeo"));
    const input = await screen.findByTestId("admin-video-embed-url-input");

    fireEvent.change(input, {
      target: { value: "not-a-url" },
    });
    fireEvent.click(screen.getByTestId("admin-video-embed-url-submit"));

    expect(await screen.findByTestId("admin-video-embed-url-error")).toHaveTextContent(
      "כתובת לא חוקית",
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows UNSUPPORTED_HOST error for an unrecognised host", async () => {
    const onChange = vi.fn();
    render(<AdminVideoUploadControl {...makeDefaultProps({ onChange })} />);

    fireEvent.click(screen.getByLabelText("YouTube / Vimeo"));
    const input = await screen.findByTestId("admin-video-embed-url-input");

    fireEvent.change(input, {
      target: { value: "https://malicious.example.com/watch?v=dQw4w9WgXcQ" },
    });
    fireEvent.click(screen.getByTestId("admin-video-embed-url-submit"));

    expect(await screen.findByTestId("admin-video-embed-url-error")).toHaveTextContent(
      "הספק לא נתמך",
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows MISSING_VIDEO_ID error for youtube.com without v param", async () => {
    const onChange = vi.fn();
    render(<AdminVideoUploadControl {...makeDefaultProps({ onChange })} />);

    fireEvent.click(screen.getByLabelText("YouTube / Vimeo"));
    const input = await screen.findByTestId("admin-video-embed-url-input");

    fireEvent.change(input, {
      target: { value: "https://youtube.com/" },
    });
    fireEvent.click(screen.getByTestId("admin-video-embed-url-submit"));

    expect(await screen.findByTestId("admin-video-embed-url-error")).toHaveTextContent(
      "מזהה הסרטון חסר",
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("calls onChange with normalized embedUrl and provider for a valid YouTube URL", async () => {
    const onChange = vi.fn();
    render(<AdminVideoUploadControl {...makeDefaultProps({ onChange })} />);

    fireEvent.click(screen.getByLabelText("YouTube / Vimeo"));
    const input = await screen.findByTestId("admin-video-embed-url-input");

    fireEvent.change(input, {
      target: { value: "https://youtu.be/dQw4w9WgXcQ" },
    });
    fireEvent.click(screen.getByTestId("admin-video-embed-url-submit"));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenCalledWith(
      expect.stringContaining("youtube.com/embed/dQw4w9WgXcQ"),
      expect.objectContaining({
        kind: "embed",
        provider: "youtube",
      }),
    );
  });

  it("calls onChange with normalized embedUrl and provider for a valid Vimeo URL", async () => {
    const onChange = vi.fn();
    render(<AdminVideoUploadControl {...makeDefaultProps({ onChange })} />);

    fireEvent.click(screen.getByLabelText("YouTube / Vimeo"));
    const input = await screen.findByTestId("admin-video-embed-url-input");

    fireEvent.change(input, {
      target: { value: "https://vimeo.com/123456789" },
    });
    fireEvent.click(screen.getByTestId("admin-video-embed-url-submit"));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenCalledWith(
      expect.stringContaining("player.vimeo.com/video/123456789"),
      expect.objectContaining({
        kind: "embed",
        provider: "vimeo",
      }),
    );
  });
});
