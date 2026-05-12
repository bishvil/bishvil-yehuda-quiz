import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlayScreen } from "@/app/[pin]/play/play-screen";
import type { ParticipantBrand } from "@/src/lib/participant/brands";
import type { ParticipantStateResponse } from "@/src/lib/sessions/participant-payload";

const mock = vi.hoisted(() => ({
  state: null as ParticipantStateResponse | null,
  refetch: vi.fn(async () => {}),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mock.replace,
  }),
}));

vi.mock("@/src/lib/hooks/useParticipantState", () => ({
  useParticipantState: () => ({
    state: mock.state,
    status: "success",
    error: null,
    refetch: mock.refetch,
  }),
}));

vi.mock("@/src/lib/participant/api-client", () => ({
  advanceParticipant: vi.fn(),
  submitAnswer: vi.fn(),
}));

const BRAND: ParticipantBrand = {
  id: "main",
  name: "בשביל יהודה",
  tagline: "",
  logoUrl: "/logos/logo_main.png",
  primary: "#2f5d50",
  accent: "#d19a2a",
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mock.state = null;
  mock.refetch.mockClear();
  mock.replace.mockClear();
});

describe("PlayScreen video questions", () => {
  it("opens the async video spotlight immediately for every new video question", () => {
    vi.useFakeTimers();
    mock.state = buildState("q1", 1);

    const view = render(
      <PlayScreen
        pin="123456"
        brand={BRAND}
        customLogo={null}
        customLogoLabel={null}
        gameMode="async"
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "צפו בסרטון לפני המענה" }),
    ).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1000));
    fireEvent.click(screen.getByRole("button", { name: "אישור צפייה ←" }));

    expect(screen.queryByTestId("participant-spotlight")).toBeNull();

    mock.state = buildState("q2", 2);
    view.rerender(
      <PlayScreen
        pin="123456"
        brand={BRAND}
        customLogo={null}
        customLogoLabel={null}
        gameMode="async"
      />,
    );

    expect(screen.getByTestId("participant-spotlight")).toBeInTheDocument();
  });
});

function buildState(
  questionId: string,
  index: number,
): ParticipantStateResponse {
  return {
    session: {
      status: "live",
      gameMode: "async",
      quizTitle: "חידון בדיקה",
      brandId: "main",
      customLogo: null,
    },
    question: {
      id: questionId,
      index,
      total: 2,
      type: "video",
      prompt: `שאלת וידאו ${index}`,
      options: [
        { id: "a", text: "תשובה א" },
        { id: "b", text: "תשובה ב" },
      ],
      imageUrl: null,
      imageAlt: null,
      imageWidth: null,
      imageHeight: null,
      videoUrl: `https://cdn.example.com/${questionId}.mp4`,
      videoEmbedUrl: null,
      videoProvider: "self",
      videoMimeType: "video/mp4",
      videoDurationSeconds: 12,
      videoPosterUrl: null,
      videoWidth: 1280,
      videoHeight: 720,
      mediaLeadSeconds: 1,
      map: null,
      timeSeconds: 30,
      points: 100,
      status: "answering",
      startedAt: "2026-05-12T00:00:00.000Z",
      deadlineAt: "2026-05-12T00:00:31.000Z",
      serverNow: "2026-05-12T00:00:00.000Z",
    },
    myAnswer: null,
    myScore: 0,
    reveal: null,
  };
}
