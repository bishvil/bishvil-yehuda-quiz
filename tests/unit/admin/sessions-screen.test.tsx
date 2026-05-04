import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("@/src/lib/admin/api-client", () => ({
  isAdminApiError: vi.fn(() => false),
  getAdminQuiz: vi.fn(),
  listAdminSessions: vi.fn(),
  listAdminQuestions: vi.fn(),
  listAdminTeam: vi.fn(),
  createAdminSession: vi.fn(),
  updateAdminSessionHost: vi.fn(),
}));

import {
  createAdminSession,
  getAdminQuiz,
  isAdminApiError,
  listAdminQuestions,
  listAdminSessions,
  listAdminTeam,
} from "@/src/lib/admin/api-client";
import { SessionsScreen } from "@/app/admin/quizzes/[quizId]/sessions/sessions-screen";

const QUIZ_ID = "11111111-1111-4111-8111-111111111111";

const QUIZ_DETAIL = {
  quiz: {
    id: QUIZ_ID,
    title: "Wave-3 fixture quiz",
    brandId: "default",
    defaultGameMode: "sync" as const,
    customLogo: null,
    customLogoLabel: null,
    customLogoActive: false,
    joinFields: ["name", "phone"],
    archivedAt: null,
    createdAt: "2026-04-30T20:00:00Z",
  },
};

const EMPTY_SESSIONS = { sessions: [] };

describe("SessionsScreen — non-empty quiz launch enforcement (M2)", () => {
  beforeEach(() => {
    vi.mocked(isAdminApiError).mockImplementation(() => false);
    vi.mocked(getAdminQuiz).mockResolvedValue(QUIZ_DETAIL);
    vi.mocked(listAdminSessions).mockResolvedValue(EMPTY_SESSIONS);
    vi.mocked(createAdminSession).mockResolvedValue({
      session: {
        id: "sess-1",
        pin: "123456",
        quizId: QUIZ_ID,
        status: "scheduled",
        gameMode: "sync",
        autoReveal: false,
        hostId: "admin-1",
        hostEmail: "admin@example.com",
        endedAt: null,
        createdAt: "2026-04-30T20:01:00Z",
      },
    });
    vi.mocked(listAdminTeam).mockResolvedValue({
      members: [
        {
          id: "admin-1",
          email: "admin@example.com",
          role: "admin",
          lastSignInAt: null,
          createdAt: "2026-04-30T20:00:00Z",
        },
      ],
      currentUserId: "admin-1",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("disables the launch button and shows the empty-quiz warning when the quiz has zero questions", async () => {
    vi.mocked(listAdminQuestions).mockResolvedValue({ questions: [] });

    render(<SessionsScreen quizId={QUIZ_ID} />);

    const button = await screen.findByTestId("admin-create-session");
    await waitFor(() => expect(button).toBeDisabled());

    const warning = screen.getByTestId("admin-no-questions-warning");
    expect(warning.textContent).toContain("הוסיפו לפחות תחנה אחת");

    // Even if the user clicks the disabled button, no API call is made.
    expect(createAdminSession).not.toHaveBeenCalled();
  });

  it("enables the launch button once the quiz has at least one question", async () => {
    vi.mocked(listAdminQuestions).mockResolvedValue({
      questions: [
        {
          id: "q1",
          ordinal: 1,
          type: "single",
          prompt: "?",
          options: [
            { id: "a", text: "A" },
            { id: "b", text: "B" },
          ],
          correctIds: ["a"],
          map: null,
          imageUrl: null,
          explanation: null,
          timeSeconds: 25,
          points: 1500,
        },
      ],
    });

    render(<SessionsScreen quizId={QUIZ_ID} />);

    const button = await screen.findByTestId("admin-create-session");
    await waitFor(() => expect(button).not.toBeDisabled());

    expect(screen.queryByTestId("admin-no-questions-warning")).toBeNull();
  });
});
