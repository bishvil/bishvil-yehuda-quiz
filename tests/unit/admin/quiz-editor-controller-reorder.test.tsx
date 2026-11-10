import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AdminQuestionListItem,
  AdminQuizDetailResponse,
} from "@/src/lib/admin/api-types";
import type { EditableQuestion } from "@/src/lib/admin/quiz-editor";

const autosave = vi.hoisted(() => ({
  saveQuestions: null as null | ((rows: EditableQuestion[]) => Promise<void>),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/src/lib/admin/api-client", () => ({
  isAdminApiError: (value: unknown) =>
    typeof value === "object" && value !== null && "error" in value,
  getAdminQuiz: vi.fn(),
  listAdminQuestions: vi.fn(),
  createAdminQuestion: vi.fn(),
  updateAdminQuestion: vi.fn(),
  deleteAdminQuestion: vi.fn(),
  reorderAdminQuestions: vi.fn(),
  updateAdminQuiz: vi.fn(),
  createAdminSession: vi.fn(),
  duplicateAdminQuiz: vi.fn(),
}));
// Control only the debounce boundary. The actual controller, state updates,
// save serialization and server-id recovery all run in these tests.
vi.mock("@/src/lib/hooks/useDebouncedAutoSave", () => ({
  useDebouncedAutoSave: ({
    value,
    save,
  }: {
    value: unknown;
    save: (value: unknown) => Promise<void>;
  }) => {
    if (Array.isArray(value)) autosave.saveQuestions = save;
    return {
      status: "idle",
      dirty: false,
      errorMessage: null,
      flush: () => save(value),
    };
  },
}));

import {
  createAdminQuestion,
  getAdminQuiz,
  listAdminQuestions,
  reorderAdminQuestions,
  updateAdminQuestion,
} from "@/src/lib/admin/api-client";
import { useQuizEditorController } from "@/app/admin/quizzes/[quizId]/use-quiz-editor-controller";

const QUIZ_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const quiz: AdminQuizDetailResponse = {
  quiz: {
    id: QUIZ_ID,
    title: "Local reorder fixture",
    brandId: "default",
    defaultGameMode: "sync",
    customLogo: null,
    customLogoLabel: null,
    customLogoActive: false,
    joinFields: ["name"],
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    hasAnySession: false,
  },
};

function row(id: string, ordinal: number): AdminQuestionListItem {
  return {
    id,
    ordinal,
    type: "content",
    prompt: `Station ${id}`,
    options: null,
    correctIds: null,
    map: null,
    imageUrl: null,
    imageAlt: null,
    imageWidth: null,
    imageHeight: null,
    imagePath: null,
    explanation: null,
    settings: {},
    timeSeconds: 25,
    points: 0,
    videoUrl: null,
    videoPath: null,
    videoEmbedUrl: null,
    videoProvider: null,
    videoMimeType: null,
    videoDurationSeconds: null,
    videoPosterUrl: null,
    videoPosterPath: null,
    videoWidth: null,
    videoHeight: null,
    mediaLeadSeconds: 0,
  };
}

let serverRows: AdminQuestionListItem[];
let writes: string[];

async function mountController() {
  const hook = renderHook(() => useQuizEditorController(QUIZ_ID));
  await waitFor(() => expect(hook.result.current.status).toBe("ready"));
  return hook;
}

async function persist(snapshot: EditableQuestion[]) {
  await act(async () => {
    await autosave.saveQuestions!(snapshot);
  });
}

function serverOrder() {
  return [...serverRows].sort((a, b) => a.ordinal - b.ordinal).map((q) => q.id);
}

describe("quiz editor controller — collision-safe ordinal saves", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    autosave.saveQuestions = null;
    serverRows = [row("first", 1), row("second", 2), row("third", 3)];
    writes = [];
    // These tests are entirely in memory; unexpected network use must fail.
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Unexpected network request"),
    );
    vi.mocked(getAdminQuiz).mockResolvedValue(quiz);
    vi.mocked(listAdminQuestions).mockImplementation(async () => ({
      questions: serverRows.map((q) => ({ ...q })),
    }));
    vi.mocked(updateAdminQuestion).mockImplementation(async (_, id, patch) => {
      if (
        patch.ordinal !== undefined &&
        serverRows.some((q) => q.id !== id && q.ordinal === patch.ordinal)
      ) {
        throw new Error("Duplicate ordinal");
      }
      const index = serverRows.findIndex((q) => q.id === id);
      if (index < 0) throw new Error("Missing question");
      serverRows[index] = {
        ...serverRows[index],
        ...patch,
      } as AdminQuestionListItem;
      writes.push(`update:${id}`);
      return { question: { ...serverRows[index]! } };
    });
    vi.mocked(createAdminQuestion).mockImplementation(async (_, request) => {
      if (serverRows.some((q) => q.ordinal === request.ordinal))
        throw new Error("Duplicate ordinal");
      const created = {
        ...row("new-server-id", request.ordinal),
        ...request,
      } as AdminQuestionListItem;
      serverRows.push(created);
      writes.push(`create:${created.ordinal}`);
      return { question: { ...created } };
    });
    vi.mocked(reorderAdminQuestions).mockImplementation(
      async (_, { ordinals }) => {
        expect(new Set(ordinals.map((q) => q.id))).toEqual(
          new Set(serverRows.map((q) => q.id)),
        );
        serverRows = serverRows.map((q) => ({
          ...q,
          ordinal: ordinals.find((entry) => entry.id === q.id)!.ordinal,
        }));
        writes.push("reorder");
        return { status: "reordered", count: ordinals.length };
      },
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it("atomically saves the very first move after load without individual PATCHes", async () => {
    const { result } = await mountController();
    act(() =>
      result.current.reorderQuestion(
        result.current.questions[2]!.clientId,
        result.current.questions[0]!.clientId,
      ),
    );

    await persist(result.current.questions);

    expect(updateAdminQuestion).not.toHaveBeenCalled();
    expect(createAdminQuestion).not.toHaveBeenCalled();
    expect(reorderAdminQuestions).toHaveBeenCalledExactlyOnceWith(
      QUIZ_ID,
      {
        ordinals: [
          { id: "third", ordinal: 1 },
          { id: "first", ordinal: 2 },
          { id: "second", ordinal: 3 },
        ],
      },
      { allowLockedQuizEdit: false },
    );
    expect(serverOrder()).toEqual(["third", "first", "second"]);
  });

  it("persists a content edit without ordinals before atomically moving the rows", async () => {
    const { result } = await mountController();
    act(() =>
      result.current.updateQuestion({
        ...result.current.questions[2]!,
        prompt: "Edited station",
      }),
    );
    act(() =>
      result.current.reorderQuestion(
        result.current.questions[2]!.clientId,
        result.current.questions[0]!.clientId,
      ),
    );

    await persist(result.current.questions);

    expect(updateAdminQuestion).toHaveBeenCalled();
    for (const [, , patch] of vi.mocked(updateAdminQuestion).mock.calls)
      expect(patch).not.toHaveProperty("ordinal");
    expect(serverRows.find((q) => q.id === "third")?.prompt).toBe(
      "Edited station",
    );
    expect(serverOrder()).toEqual(["third", "first", "second"]);
    expect(writes.at(-1)).toBe("reorder");
  });

  it("appends a new station at a free server ordinal before moving it to the beginning", async () => {
    const { result } = await mountController();
    act(() => result.current.addQuestion());
    act(() =>
      result.current.reorderQuestion(
        result.current.questions[3]!.clientId,
        result.current.questions[0]!.clientId,
      ),
    );

    await persist(result.current.questions);

    expect(createAdminQuestion).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createAdminQuestion).mock.calls[0]![1].ordinal).toBe(4);
    expect(writes.indexOf("create:4")).toBeLessThan(writes.indexOf("reorder"));
    expect(serverOrder()).toEqual([
      "new-server-id",
      "first",
      "second",
      "third",
    ]);
    expect(result.current.questions[0]!.id).toBe("new-server-id");
  });

  it("reuses a successfully created id when retrying a stale snapshot after reorder fails", async () => {
    const { result } = await mountController();
    act(() => result.current.addQuestion());
    act(() =>
      result.current.reorderQuestion(
        result.current.questions[3]!.clientId,
        result.current.questions[0]!.clientId,
      ),
    );
    const staleSnapshot = result.current.questions;
    expect(staleSnapshot[0]!.id).toBeNull();
    vi.mocked(reorderAdminQuestions).mockRejectedValueOnce(
      new Error("Reorder unavailable"),
    );

    await act(async () => {
      await expect(autosave.saveQuestions!(staleSnapshot)).rejects.toThrow(
        "Reorder unavailable",
      );
    });
    await persist(staleSnapshot);

    expect(createAdminQuestion).toHaveBeenCalledTimes(1);
    expect(serverRows).toHaveLength(4);
    expect(serverOrder()).toEqual([
      "new-server-id",
      "first",
      "second",
      "third",
    ]);
    expect(reorderAdminQuestions).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
