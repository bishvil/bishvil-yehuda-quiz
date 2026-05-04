/**
 * Regression test for the "deleted question reappears" bug (QA item C).
 *
 * Root cause: when a newly-added question (id === null) is deleted while its
 * autosave POST is still in-flight, `removeQuestion` captured `serverId=null`
 * from the stale closure, skipped the DELETE, removed the row from local
 * state, and the POST completed on the server without a matching client-side
 * cleanup — leaving an orphan that reappeared on reload.
 *
 * The fix: `removeQuestion` now awaits `questionsSave.flush()` before
 * deciding whether to issue a DELETE. After flush the POST has either
 * succeeded (id stamped → DELETE issued) or failed (question never persisted
 * → just drop locally).
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  isAdminApiError: vi.fn((v: unknown) =>
    typeof v === "object" && v !== null && "error" in (v as object),
  ),
  getAdminQuiz: vi.fn(),
  listAdminQuestions: vi.fn(),
  createAdminQuestion: vi.fn(),
  updateAdminQuestion: vi.fn(),
  deleteAdminQuestion: vi.fn(),
  reorderAdminQuestions: vi.fn(),
  updateAdminQuiz: vi.fn(),
  createAdminSession: vi.fn(),
}));

// DND-kit needs a working pointer-events model; stub it in jsdom.
vi.mock("@dnd-kit/core", async () => {
  const actual = await vi.importActual<typeof import("@dnd-kit/core")>(
    "@dnd-kit/core",
  );
  return {
    ...actual,
    DndContext: ({ children }: { children: React.ReactNode }) => children,
    useSensor: () => ({}),
    useSensors: (...sensors: unknown[]) => sensors,
  };
});
vi.mock("@dnd-kit/sortable", async () => {
  const actual =
    await vi.importActual<typeof import("@dnd-kit/sortable")>("@dnd-kit/sortable");
  return {
    ...actual,
    SortableContext: ({ children }: { children: React.ReactNode }) => children,
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      transform: null,
      transition: null,
      isDragging: false,
    }),
  };
});

import React from "react";
import {
  createAdminQuestion,
  deleteAdminQuestion,
  getAdminQuiz,
  listAdminQuestions,
  updateAdminQuiz,
} from "@/src/lib/admin/api-client";

import { QuizEditorScreen } from "@/app/admin/quizzes/[quizId]/quiz-editor-screen";

const QUIZ_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SERVER_QUESTION_ID = "qqqqqqqq-qqqq-4qqq-8qqq-qqqqqqqqqqqq";

const BRANDS_FIXTURE = [
  {
    id: "yehuda",
    name: "בשביל יהודה",
    tagline: "מורשת בדרך ערך",
    logoUrl: "/logos/logo_yehuda.png",
    primary: "#306030",
    accent: "#A0C040",
  },
];

const QUIZ_FIXTURE = {
  quiz: {
    id: QUIZ_ID,
    title: "Test Quiz",
    brandId: "default",
    defaultGameMode: "sync" as const,
    customLogo: null,
    customLogoLabel: null,
    customLogoActive: false,
    joinFields: ["name", "phone"],
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
  },
};

const SERVER_QUESTION_FIXTURE = {
  question: {
    id: SERVER_QUESTION_ID,
    ordinal: 1,
    type: "single" as const,
    prompt: "",
    options: null,
    correctIds: null,
    map: null,
    imageUrl: null,
    imageAlt: null,
    imageWidth: null,
    imageHeight: null,
    imagePath: null,
    explanation: null,
    timeSeconds: 25,
    points: 1500,
    createdAt: "2026-01-01T00:00:00Z",
  },
};

describe("QuizEditorScreen — delete-while-POST-in-flight race (QA-C)", () => {
  beforeEach(() => {
    vi.mocked(getAdminQuiz).mockResolvedValue(QUIZ_FIXTURE);
    vi.mocked(listAdminQuestions).mockResolvedValue({ questions: [] });
    vi.mocked(updateAdminQuiz).mockResolvedValue(QUIZ_FIXTURE);
    vi.mocked(deleteAdminQuestion).mockResolvedValue({ status: "deleted" });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it(
    "DELETEs the server row when the user removes a question whose POST was in-flight at delete time",
    async () => {
      // POST will resolve only when we call `resolvePost`.
      let resolvePost!: (v: typeof SERVER_QUESTION_FIXTURE) => void;
      const postPromise = new Promise<typeof SERVER_QUESTION_FIXTURE>(
        (resolve) => {
          resolvePost = resolve;
        },
      );
      vi.mocked(createAdminQuestion).mockReturnValue(postPromise);

      render(<QuizEditorScreen quizId={QUIZ_ID} brands={BRANDS_FIXTURE} />);

      // Wait for initial load to finish (data fetched, editor renders).
      const addBtn = await screen.findByTestId("admin-add-question", {}, { timeout: 5000 });

      // Add a new question — this triggers the autosave debounce.
      act(() => {
        fireEvent.click(addBtn);
      });

      // Wait for autosave debounce to fire and POST to start (800 ms).
      // We use real timers + waitFor here to avoid fake-timer complexity with RTL.
      await waitFor(
        () => {
          expect(vi.mocked(createAdminQuestion)).toHaveBeenCalledTimes(1);
        },
        { timeout: 3000 },
      );

      // POST is in-flight. Delete is called before the POST resolves.
      expect(deleteAdminQuestion).not.toHaveBeenCalled();

      const deleteBtn = screen.getByText("מחיקת תחנה");

      // Fire delete click. The fix flushes the pending POST, resolving postPromise.
      // We resolve it immediately after the click to simulate the POST completing
      // during the flush wait.
      act(() => {
        fireEvent.click(deleteBtn);
      });

      // Resolve the POST so flush() can complete.
      await act(async () => {
        resolvePost(SERVER_QUESTION_FIXTURE);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      // After flush + id-stamp, removeQuestion must issue a DELETE with the
      // server-assigned id — not silently skip because serverId was null.
      await waitFor(
        () => {
          expect(deleteAdminQuestion).toHaveBeenCalledWith(QUIZ_ID, SERVER_QUESTION_ID);
        },
        { timeout: 3000 },
      );
    },
    15000,
  );

  it(
    "does NOT call deleteAdminQuestion when the POST failed (question was never persisted)",
    async () => {
      // POST always rejects — question never reaches server.
      vi.mocked(createAdminQuestion).mockRejectedValue(
        new Error("network error"),
      );

      render(<QuizEditorScreen quizId={QUIZ_ID} brands={BRANDS_FIXTURE} />);

      const addBtn = await screen.findByTestId("admin-add-question", {}, { timeout: 5000 });

      act(() => {
        fireEvent.click(addBtn);
      });

      // Wait for autosave to fire and fail.
      await waitFor(
        () => {
          expect(createAdminQuestion).toHaveBeenCalledTimes(1);
        },
        { timeout: 3000 },
      );

      // Wait for the POST rejection to propagate.
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      const deleteBtn = screen.getByText("מחיקת תחנה");
      await act(async () => {
        fireEvent.click(deleteBtn);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      // The question was never on the server → no DELETE.
      expect(deleteAdminQuestion).not.toHaveBeenCalled();
    },
    15000,
  );
});
