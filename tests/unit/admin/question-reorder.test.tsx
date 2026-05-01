import { act, render, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  moveQuestionById,
  moveQuestionByOffset,
  useQuestionReorder,
  type QuestionReorderItem,
} from "@/src/hooks/useQuestionReorder";
import { useDebouncedAutoSave } from "@/src/lib/hooks/useDebouncedAutoSave";

interface TestQuestion extends QuestionReorderItem {
  prompt: string;
}

const questions: TestQuestion[] = [
  { clientId: "q1", ordinal: 1, prompt: "First" },
  { clientId: "q2", ordinal: 2, prompt: "Second" },
  { clientId: "q3", ordinal: 3, prompt: "Third" },
];

function ids(items: TestQuestion[]) {
  return items.map((item) => `${item.clientId}:${item.ordinal}`);
}

describe("question reorder helpers", () => {
  it("moves by active and target ids and renumbers ordinals", () => {
    const next = moveQuestionById(questions, "q1", "q3");

    expect(next).not.toBeNull();
    expect(ids(next ?? [])).toEqual(["q2:1", "q3:2", "q1:3"]);
    expect(ids(questions)).toEqual(["q1:1", "q2:2", "q3:3"]);
  });

  it("moves by keyboard-style offset and ignores impossible moves", () => {
    expect(ids(moveQuestionByOffset(questions, "q2", -1) ?? [])).toEqual([
      "q2:1",
      "q1:2",
      "q3:3",
    ]);
    expect(moveQuestionByOffset(questions, "q1", -1)).toBeNull();
    expect(moveQuestionByOffset(questions, "missing", 1)).toBeNull();
  });
});

describe("useQuestionReorder", () => {
  it("calls the save callback with reordered state", () => {
    const onSave = vi.fn();
    const onActiveIndexChange = vi.fn();
    const { result } = renderHook(() =>
      useQuestionReorder({
        questions,
        onSave,
        onActiveIndexChange,
      }),
    );

    let next: TestQuestion[] | null = null;
    act(() => {
      next = result.current.reorderQuestion("q1", "q3");
    });

    expect(ids(next ?? [])).toEqual(["q2:1", "q3:2", "q1:3"]);
    expect(onSave).toHaveBeenCalledWith(next);
    expect(onActiveIndexChange).toHaveBeenCalledWith(2);
  });

  it("does not save when the drop target is unchanged", () => {
    const onSave = vi.fn();
    const { result } = renderHook(() =>
      useQuestionReorder({
        questions,
        onSave,
      }),
    );

    act(() => {
      expect(result.current.reorderQuestion("q1", "q1")).toBeNull();
    });

    expect(onSave).not.toHaveBeenCalled();
  });
});

interface AutoSaveHostProps {
  save: (questions: TestQuestion[]) => Promise<void>;
}

function AutoSaveHost({ save }: AutoSaveHostProps) {
  const [items, setItems] = useState(questions);
  useDebouncedAutoSave({ value: items, save });

  const { reorderQuestion } = useQuestionReorder({
    questions: items,
    onSave: setItems,
  });

  return (
    <button type="button" onClick={() => reorderQuestion("q1", "q3")}>
      reorder
    </button>
  );
}

describe("question reorder auto-save integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires the existing debounced auto-save after a state-level reorder", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { getByRole } = render(<AutoSaveHost save={save} />);

    act(() => {
      getByRole("button", { name: "reorder" }).click();
    });

    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(900);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(ids(save.mock.calls[0]?.[0] ?? [])).toEqual([
      "q2:1",
      "q3:2",
      "q1:3",
    ]);
  });
});
