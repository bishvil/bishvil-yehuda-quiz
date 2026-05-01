import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { SortableQuestionCard } from "@/src/components/admin/SortableQuestionCard";
import { SortableQuestionList } from "@/src/components/admin/SortableQuestionList";

vi.mock("@dnd-kit/core", async () => {
  const actual = await vi.importActual<typeof import("@dnd-kit/core")>(
    "@dnd-kit/core",
  );

  return {
    ...actual,
    closestCenter: vi.fn(),
    DndContext: ({
      children,
      onDragEnd,
    }: {
      children: ReactNode;
      onDragEnd: (event: {
        active: { id: string };
        over: { id: string } | null;
      }) => void;
    }) => (
      <div data-testid="dnd-context">
        <button
          type="button"
          onClick={() => onDragEnd({ active: { id: "q1" }, over: { id: "q2" } })}
        >
          trigger drag end
        </button>
        {children}
      </div>
    ),
    KeyboardSensor: vi.fn(),
    MouseSensor: vi.fn(),
    TouchSensor: vi.fn(),
    useSensor: vi.fn((sensor, options) => ({ sensor, options })),
    useSensors: vi.fn((...sensors) => sensors),
  };
});

vi.mock("@dnd-kit/sortable", async () => {
  const actual = await vi.importActual<typeof import("@dnd-kit/sortable")>(
    "@dnd-kit/sortable",
  );

  return {
    ...actual,
    SortableContext: ({
      children,
      items,
    }: {
      children: ReactNode;
      items: string[];
    }) => (
      <div data-testid="sortable-context" data-items={items.join(",")}>
        {children}
      </div>
    ),
    useSortable: vi.fn(({ id }: { id: string }) => ({
      attributes: { "aria-describedby": `sortable-${id}` },
      isDragging: false,
      listeners: { onKeyDown: vi.fn() },
      setActivatorNodeRef: vi.fn(),
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
    })),
  };
});

describe("sortable question components", () => {
  it("renders a SortableContext and delegates drag-end reorder ids", () => {
    const onReorder = vi.fn();
    render(
      <SortableQuestionList items={["q1", "q2"]} onReorder={onReorder}>
        <SortableQuestionCard id="q1">
          <div>First question</div>
        </SortableQuestionCard>
        <SortableQuestionCard id="q2">
          <div>Second question</div>
        </SortableQuestionCard>
      </SortableQuestionList>,
    );

    expect(screen.getByTestId("dnd-context")).toBeInTheDocument();
    expect(screen.getByTestId("sortable-context")).toHaveAttribute(
      "data-items",
      "q1,q2",
    );

    screen.getByRole("button", { name: "trigger drag end" }).click();

    expect(onReorder).toHaveBeenCalledWith("q1", "q2");
  });

  it("keeps dragging on a dedicated Hebrew-labeled handle", () => {
    render(
      <SortableQuestionCard id="q1">
        <button type="button">פתח עריכה</button>
      </SortableQuestionCard>,
    );

    const handle = screen.getByRole("button", {
      name: "גרירת שאלה לשינוי סדר",
    });

    expect(handle).toHaveAttribute(
      "title",
      "שינוי סדר: רווח או Enter לבחירה, חצים להזזה, Esc לביטול",
    );
    expect(screen.getByRole("button", { name: "פתח עריכה" })).toBeInTheDocument();
    expect(screen.getByText("⋮⋮")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("פתח עריכה").closest("[data-sortable-question-id]"))
      .toHaveAttribute("data-sortable-question-id", "q1");
  });
});
