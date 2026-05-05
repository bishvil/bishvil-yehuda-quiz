/**
 * Tests for QuestionMediaSpotlight.
 *
 * jsdom's HTMLMediaElement does not emit media events natively. We simulate
 * them by setting properties (currentTime, duration) and dispatching events
 * manually via fireEvent.
 *
 * For embed wall-clock tests we use vi.useFakeTimers() so we can advance
 * time synchronously without real setTimeout delays.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  act,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QuestionMediaSpotlight } from "@/src/components/participant/QuestionMediaSpotlight";

/**
 * jsdom's HTMLMediaElement properties (duration, currentTime) are read-only
 * in the DOM spec typing. We stub them via defineProperty at runtime, cast to
 * `unknown` first to satisfy tsc's strict checks in test code only.
 */
function defineMediaProp(el: HTMLMediaElement, prop: string, value: unknown) {
  Object.defineProperty(el, prop, { configurable: true, writable: true, value });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

import type { QuestionMediaSpotlightProps } from "@/src/components/participant/QuestionMediaSpotlight";

const BASE_PROPS: QuestionMediaSpotlightProps = {
  prompt: "מה רואים בסרטון?",
  videoUrl: null,
  videoEmbedUrl: null,
  videoProvider: null,
  videoMimeType: null,
  videoPosterUrl: null,
  videoDurationSeconds: null,
  mediaLeadSeconds: 30,
  onSettle: vi.fn(),
};

function selfHostedProps(overrides?: Partial<QuestionMediaSpotlightProps>) {
  return {
    ...BASE_PROPS,
    videoUrl: "https://cdn.example.com/video.mp4",
    videoProvider: "self" as const,
    videoMimeType: "video/mp4",
    videoDurationSeconds: 30,
    onSettle: vi.fn(),
    ...overrides,
  };
}

function embedProps(overrides?: Partial<QuestionMediaSpotlightProps>) {
  return {
    ...BASE_PROPS,
    videoEmbedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    videoProvider: "youtube" as const,
    mediaLeadSeconds: 20,
    onSettle: vi.fn(),
    ...overrides,
  };
}

describe("QuestionMediaSpotlight — self-hosted", () => {
  it("renders a <video> element with a <source> for self-hosted", () => {
    render(<QuestionMediaSpotlight {...selfHostedProps()} />);
    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    const source = video?.querySelector("source");
    expect(source?.getAttribute("src")).toBe("https://cdn.example.com/video.mp4");
    expect(source?.getAttribute("type")).toBe("video/mp4");
  });

  it("does not render an <iframe> for self-hosted", () => {
    render(<QuestionMediaSpotlight {...selfHostedProps()} />);
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("renders the prompt text", () => {
    render(<QuestionMediaSpotlight {...selfHostedProps()} />);
    expect(screen.getByText("מה רואים בסרטון?")).toBeTruthy();
  });

  it("skip link is hidden before 80% playback", () => {
    render(<QuestionMediaSpotlight {...selfHostedProps()} />);
    // The skip button should not yet be in the document.
    expect(screen.queryByText(/דלג לשאלה/)).toBeNull();
  });

  it("reveals skip link once currentTime >= 0.8 * duration", () => {
    const props = selfHostedProps({ videoDurationSeconds: 30 });
    render(<QuestionMediaSpotlight {...props} />);

    const video = document.querySelector("video") as HTMLVideoElement;
    expect(video).not.toBeNull();

    // Simulate playback at 80% of 30s = 24s.
    defineMediaProp(video, "duration", 30);
    defineMediaProp(video, "currentTime", 24);

    fireEvent(video, new Event("timeupdate"));

    expect(screen.getByText(/דלג לשאלה/)).toBeTruthy();
  });

  it("does not reveal skip link before 80% threshold", () => {
    const props = selfHostedProps({ videoDurationSeconds: 30 });
    render(<QuestionMediaSpotlight {...props} />);

    const video = document.querySelector("video") as HTMLVideoElement;
    defineMediaProp(video, "duration", 30);
    defineMediaProp(video, "currentTime", 23);

    fireEvent(video, new Event("timeupdate"));

    // 23 / 30 = 0.767 — still below 0.8
    expect(screen.queryByText(/דלג לשאלה/)).toBeNull();
  });

  it("calls onSettle when 'ended' event fires", () => {
    const onSettle = vi.fn();
    render(<QuestionMediaSpotlight {...selfHostedProps({ onSettle })} />);

    const video = document.querySelector("video") as HTMLVideoElement;
    fireEvent(video, new Event("ended"));

    expect(onSettle).toHaveBeenCalledOnce();
  });

  it("skip button click calls onSettle once skip is eligible", () => {
    const onSettle = vi.fn();
    const props = selfHostedProps({ onSettle, videoDurationSeconds: 10 });
    render(<QuestionMediaSpotlight {...props} />);

    const video = document.querySelector("video") as HTMLVideoElement;
    defineMediaProp(video, "duration", 10);
    defineMediaProp(video, "currentTime", 8);
    fireEvent(video, new Event("timeupdate"));

    const btn = screen.getByText(/דלג לשאלה/);
    fireEvent.click(btn);

    expect(onSettle).toHaveBeenCalledOnce();
  });

  it("Escape key calls onSettle once skip is eligible", () => {
    const onSettle = vi.fn();
    const props = selfHostedProps({ onSettle, videoDurationSeconds: 10 });
    render(<QuestionMediaSpotlight {...props} />);

    const video = document.querySelector("video") as HTMLVideoElement;
    defineMediaProp(video, "duration", 10);
    defineMediaProp(video, "currentTime", 8);
    fireEvent(video, new Event("timeupdate"));

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onSettle).toHaveBeenCalledOnce();
  });

  it("Escape key does NOT call onSettle before skip is eligible", () => {
    const onSettle = vi.fn();
    render(<QuestionMediaSpotlight {...selfHostedProps({ onSettle })} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onSettle).not.toHaveBeenCalled();
  });

  it("falls back to videoDurationSeconds when video.duration is not finite", () => {
    const onSettle = vi.fn();
    const props = selfHostedProps({ onSettle, videoDurationSeconds: 20 });
    render(<QuestionMediaSpotlight {...props} />);

    const video = document.querySelector("video") as HTMLVideoElement;
    // Leave duration as NaN (default jsdom value) so the fallback kicks in.
    defineMediaProp(video, "duration", NaN);
    defineMediaProp(video, "currentTime", 16);

    fireEvent(video, new Event("timeupdate"));

    // 16 / 20 = 0.8 — exactly at threshold, eligible.
    expect(screen.getByText(/דלג לשאלה/)).toBeTruthy();
  });
});

describe("QuestionMediaSpotlight — embed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("renders an <iframe> with the embed URL", () => {
    render(<QuestionMediaSpotlight {...embedProps()} />);
    const iframe = document.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
  });

  it("does not render a <video> element for embeds", () => {
    render(<QuestionMediaSpotlight {...embedProps()} />);
    expect(document.querySelector("video")).toBeNull();
  });

  it("confirm button is hidden before mediaLeadSeconds have elapsed", () => {
    render(<QuestionMediaSpotlight {...embedProps({ mediaLeadSeconds: 20 })} />);
    expect(screen.queryByText(/אישור צפייה/)).toBeNull();
  });

  it("confirm button appears after mediaLeadSeconds wall-clock seconds", async () => {
    render(<QuestionMediaSpotlight {...embedProps({ mediaLeadSeconds: 20 })} />);

    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });

    expect(screen.getByText(/אישור צפייה/)).toBeTruthy();
  });

  it("confirm button does NOT appear before the wall-clock gate expires", async () => {
    render(<QuestionMediaSpotlight {...embedProps({ mediaLeadSeconds: 20 })} />);

    await act(async () => {
      vi.advanceTimersByTime(19_999);
    });

    expect(screen.queryByText(/אישור צפייה/)).toBeNull();
  });

  it("clamps mediaLeadSeconds to at least 1 second", async () => {
    // mediaLeadSeconds: 0 should still gate for at least 1 second.
    render(<QuestionMediaSpotlight {...embedProps({ mediaLeadSeconds: 0 })} />);

    // Button should not yet appear.
    expect(screen.queryByText(/אישור צפייה/)).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });

    expect(screen.getByText(/אישור צפייה/)).toBeTruthy();
  });

  it("confirm button click calls onSettle", async () => {
    const onSettle = vi.fn();
    render(<QuestionMediaSpotlight {...embedProps({ mediaLeadSeconds: 5, onSettle })} />);

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    fireEvent.click(screen.getByText(/אישור צפייה/));

    expect(onSettle).toHaveBeenCalledOnce();
  });

  it("Escape key calls onSettle after gate expires for embed", async () => {
    const onSettle = vi.fn();
    render(<QuestionMediaSpotlight {...embedProps({ mediaLeadSeconds: 5, onSettle })} />);

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onSettle).toHaveBeenCalledOnce();
  });

  it("shows 'אישור צפייה' (not 'דלג') for embed type", async () => {
    render(<QuestionMediaSpotlight {...embedProps({ mediaLeadSeconds: 1 })} />);

    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });

    const btn = screen.getByText(/אישור צפייה/);
    expect(btn).toBeTruthy();
    expect(screen.queryByText(/דלג/)).toBeNull();
  });
});

describe("QuestionMediaSpotlight — data-testid", () => {
  it("renders with data-testid participant-spotlight", () => {
    render(<QuestionMediaSpotlight {...selfHostedProps()} />);
    expect(screen.getByTestId("participant-spotlight")).toBeTruthy();
  });
});
