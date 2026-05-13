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

  it("renders the configured question timer instead of the default", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-12T00:00:00.000Z"));
    mock.state = buildChoiceState({
      timeSeconds: 45,
      deadlineAt: "2026-05-12T00:00:45.000Z",
      status: "answering",
    });

    render(
      <PlayScreen
        pin="123456"
        brand={BRAND}
        customLogo={null}
        customLogoLabel={null}
        gameMode="sync"
      />,
    );

    expect(screen.getByText("0:45")).toBeInTheDocument();
  });

  it("keeps the question timer running after the participant submits", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-12T00:00:10.000Z"));
    mock.state = buildChoiceState({
      timeSeconds: 45,
      deadlineAt: "2026-05-12T00:00:45.000Z",
      serverNow: "2026-05-12T00:00:10.000Z",
      status: "answering",
      myAnswer: {
        submittedAt: "2026-05-12T00:00:08.000Z",
        status: "submitted_awaiting_reveal",
        answerSeconds: 8,
        selectedIds: ["a"],
      },
    });

    render(
      <PlayScreen
        pin="123456"
        brand={BRAND}
        customLogo={null}
        customLogoLabel={null}
        gameMode="sync"
      />,
    );

    expect(screen.getByText("0:35")).toBeInTheDocument();
    expect(screen.getByText("זמן מענה: 8 שניות")).toBeInTheDocument();
  });

  it("shows answer time with revealed scoring", () => {
    mock.state = buildChoiceState({
      status: "revealed",
      myAnswer: {
        submittedAt: "2026-05-12T00:00:12.100Z",
        status: "revealed",
        answerSeconds: 13,
        selectedIds: ["a"],
        isCorrect: true,
        score: 100,
        timeBonus: 20,
      },
      reveal: {
        correctIds: ["a"],
        explanation: null,
        mapGeoTarget: null,
      },
    });

    render(
      <PlayScreen
        pin="123456"
        brand={BRAND}
        customLogo={null}
        customLogoLabel={null}
        gameMode="sync"
      />,
    );

    expect(screen.getByText("100/100 נקודות")).toBeInTheDocument();
    expect(screen.getByText("זמן מענה: 13 שניות")).toBeInTheDocument();
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

function buildChoiceState(
  overrides: {
    timeSeconds?: number;
    deadlineAt?: string;
    serverNow?: string;
    status?: "answering" | "revealed";
    myAnswer?: ParticipantStateResponse["myAnswer"];
    reveal?: ParticipantStateResponse["reveal"];
  } = {},
): ParticipantStateResponse {
  const timeSeconds = overrides.timeSeconds ?? 30;
  return {
    session: {
      status: "live",
      gameMode: "sync",
      quizTitle: "חידון בדיקה",
      brandId: "main",
      customLogo: null,
    },
    question: {
      id: "q-choice",
      index: 1,
      total: 1,
      type: "single",
      prompt: "שאלה רגילה",
      options: [
        { id: "a", text: "תשובה א" },
        { id: "b", text: "תשובה ב" },
      ],
      imageUrl: null,
      imageAlt: null,
      imageWidth: null,
      imageHeight: null,
      videoUrl: null,
      videoEmbedUrl: null,
      videoProvider: null,
      videoMimeType: null,
      videoDurationSeconds: null,
      videoPosterUrl: null,
      videoWidth: null,
      videoHeight: null,
      mediaLeadSeconds: 0,
      map: null,
      timeSeconds,
      points: 100,
      status: overrides.status ?? "answering",
      startedAt: "2026-05-12T00:00:00.000Z",
      deadlineAt:
        overrides.deadlineAt ?? `2026-05-12T00:00:${timeSeconds}.000Z`,
      serverNow: overrides.serverNow ?? "2026-05-12T00:00:00.000Z",
    },
    myAnswer: overrides.myAnswer ?? null,
    myScore: 0,
    reveal: overrides.reveal ?? null,
  };
}
