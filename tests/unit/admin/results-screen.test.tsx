import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/components/admin/AdminTopBar", () => ({
  AdminTopBar: () => null,
}));
vi.mock("@/src/lib/admin/api-client", () => ({
  getAdminSessionResults: vi.fn(),
  listAdminQuestions: vi.fn(),
  isAdminApiError: (body: unknown) =>
    Boolean(body && typeof body === "object" && "error" in body),
}));

import { ResultsScreen } from "@/app/admin/quizzes/[quizId]/sessions/[sessionId]/results/results-screen";
import {
  getAdminSessionResults,
  listAdminQuestions,
  type AdminQuestionListItem,
  type AdminSessionResultsResponse,
} from "@/src/lib/admin/api-client";

const questions = [
  { id: "content", ordinal: 1, type: "content", prompt: "מידע למסלול" },
  { id: "unanswered", ordinal: 2, type: "single", prompt: "שאלה שטרם נענתה" },
  { id: "answered", ordinal: 3, type: "open", prompt: "שאלה שנענתה" },
] as AdminQuestionListItem[];
const fixture: AdminSessionResultsResponse = {
  session: {
    id: "s1",
    pin: "123456",
    status: "live",
    gameMode: "async",
    startedAt: null,
    endedAt: null,
  },
  players: [
    {
      id: "p1",
      firstName: "אורי",
      lastName: "כהן",
      phone: "0500000000",
      identityProvider: "phone",
      identityKey: null,
      profileFields: {},
      unit: null,
      team: null,
      status: "in_progress",
      totalScore: 0,
      correctCount: 0,
      streak: 0,
      joinedAt: "2026-11-10",
      locationLockedQuestionId: "unanswered",
    },
  ],
  answers: [
    {
      questionId: "answered",
      participantId: "p1",
      submittedAt: "2026-11-10",
      selectedIds: [],
      pinLat: null,
      pinLng: null,
      textAnswer: "תשובה לבדיקה",
      isCorrect: false,
      score: 0,
      timeBonus: 0,
    },
  ],
};

beforeEach(() => {
  vi.mocked(getAdminSessionResults).mockResolvedValue(structuredClone(fixture));
  vi.mocked(listAdminQuestions).mockResolvedValue({ questions });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("admin result interpretation and operator actions", () => {
  it("labels interim results and distinguishes content, unanswered, and incorrect answers", async () => {
    render(<ResultsScreen quizId="q1" sessionId="s1" />);
    expect(await screen.findByText(/תוצאות ביניים ·/)).toBeInTheDocument();
    expect(screen.getAllByText("במהלך המשחק")).toHaveLength(2);
    expect(screen.queryByText("in_progress")).not.toBeInTheDocument();
    expect(screen.getByText("תוכן בלבד · ללא מדד דיוק")).toBeInTheDocument();
    expect(screen.getByText("טרם נענתה")).toBeInTheDocument();
    expect(screen.getByText("0% · 0 מתוך 1 תשובות נכונות")).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
  });

  it("prevents duplicate override requests and reports a failed request", async () => {
    let rejectRequest!: (error: Error) => void;
    const request = vi.fn(
      () =>
        new Promise<Response>((_resolve, reject) => {
          rejectRequest = reject;
        }),
    );
    vi.stubGlobal("fetch", request);
    render(<ResultsScreen quizId="q1" sessionId="s1" />);
    const button = await screen.findByRole("button", {
      name: "פתיחת התחנה על ידי מפעיל",
    });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(request).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    rejectRequest(new Error("offline"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "פתיחת התחנה נכשלה",
    );
    await waitFor(() => expect(button).toBeEnabled());
  });

  it("preserves loaded results and shows a read error when refresh fails", async () => {
    render(<ResultsScreen quizId="q1" sessionId="s1" />);
    await screen.findByText(/תוצאות ביניים ·/);
    vi.mocked(getAdminSessionResults).mockRejectedValueOnce(
      new Error("offline"),
    );
    fireEvent.click(screen.getByRole("button", { name: "רענון תוצאות" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "לא הצלחנו לטעון את התוצאות",
    );
    expect(screen.getByText(/תוצאות ביניים ·/)).toBeInTheDocument();
  });

  it("shows a retryable read error rather than an empty report on initial failure", async () => {
    vi.mocked(getAdminSessionResults).mockRejectedValueOnce(
      new Error("offline"),
    );
    render(<ResultsScreen quizId="q1" sessionId="s1" />);
    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByRole("button", { name: "ניסיון נוסף" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("אין משתתפים במשחק.")).not.toBeInTheDocument();
  });
});
