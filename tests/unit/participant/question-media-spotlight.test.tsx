import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuestionMediaSpotlight } from "@/src/components/participant/QuestionMediaSpotlight";
import type { QuestionMediaSpotlightProps } from "@/src/components/participant/QuestionMediaSpotlight";

const BASE_PROPS: QuestionMediaSpotlightProps = {
  mode: "self_paced",
  prompt: "מה רואים בסרטון?",
  videoUrl: "https://cdn.example.com/video.mp4",
  videoEmbedUrl: null,
  videoProvider: "self",
  videoMimeType: "video/mp4",
  videoPosterUrl: null,
  mediaLeadSeconds: 5,
  onConfirm: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("QuestionMediaSpotlight", () => {
  it("renders self-hosted video in an opaque dialog", () => {
    render(<QuestionMediaSpotlight {...BASE_PROPS} />);

    const dialog = screen.getByRole("dialog", { name: "צפו בסרטון לפני המענה" });
    expect(dialog.className).toContain("bg-black");
    expect(dialog.className).toContain("backdrop-blur-sm");
    expect(document.querySelector("video source")?.getAttribute("src")).toBe(
      "https://cdn.example.com/video.mp4",
    );
  });

  it("renders embed videos via iframe", () => {
    render(
      <QuestionMediaSpotlight
        {...BASE_PROPS}
        videoUrl={null}
        videoEmbedUrl="https://www.youtube.com/embed/video"
        videoProvider="youtube"
      />,
    );

    const iframe = document.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe("https://www.youtube.com/embed/video");
  });

  it("self-paced mode unlocks confirmation only after mediaLeadSeconds", () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    render(<QuestionMediaSpotlight {...BASE_PROPS} mediaLeadSeconds={3} onConfirm={onConfirm} />);

    const button = screen.getByRole("button", { name: "אישור צפייה ←" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onConfirm).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(3000));

    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("does not unlock early from video timeupdate events", () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    render(<QuestionMediaSpotlight {...BASE_PROPS} mediaLeadSeconds={10} onConfirm={onConfirm} />);

    const video = document.querySelector("video") as HTMLVideoElement;
    fireEvent(video, new Event("timeupdate"));

    expect(screen.getByRole("button", { name: "אישור צפייה ←" })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("host-gated mode shows host copy and hides participant confirmation", () => {
    render(<QuestionMediaSpotlight {...BASE_PROPS} mode="host_gated" onConfirm={undefined} />);

    expect(screen.getByText("ממתינים לאישור המדריך — כולכם תתחילו יחד")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "אישור צפייה ←" })).toBeNull();
  });

  it("host-gated mode can render a host confirmation action", () => {
    const onConfirm = vi.fn();
    render(<QuestionMediaSpotlight {...BASE_PROPS} mode="host_gated" onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "סיום צפייה ←" }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

