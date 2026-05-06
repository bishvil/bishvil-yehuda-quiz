"use client";

import type { ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

interface SortableQuestionListProps {
  items: UniqueIdentifier[];
  children: ReactNode;
  onReorder: (
    activeId: UniqueIdentifier,
    overId: UniqueIdentifier | null | undefined,
  ) => void;
  className?: string;
  /** When true, drag-and-drop is suppressed (read-only quiz, ADR-0013). */
  disabled?: boolean;
}

export function SortableQuestionList({
  items,
  children,
  onReorder,
  className = "",
  disabled = false,
}: SortableQuestionListProps) {
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    if (disabled) return;
    onReorder(event.active.id, event.over?.id);
  }

  return (
    <DndContext
      sensors={disabled ? [] : sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className={className}>{children}</div>
      </SortableContext>
    </DndContext>
  );
}
