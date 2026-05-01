"use client";

import type { ReactNode } from "react";
import type { UniqueIdentifier } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortableQuestionCardProps {
  id: UniqueIdentifier;
  children: ReactNode;
  className?: string;
}

export function SortableQuestionCard({
  id,
  children,
  className = "",
}: SortableQuestionCardProps) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      className={[
        "flex items-stretch gap-2",
        isDragging ? "relative z-10 opacity-80" : "",
        className,
      ].join(" ")}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      data-sortable-question-id={String(id)}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="flex w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md border border-bsy-stone-100 bg-white text-[18px] leading-none text-bsy-stone-400 transition-colors hover:border-bsy-forest hover:text-bsy-forest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bsy-forest active:cursor-grabbing"
        aria-label="גרירת שאלה לשינוי סדר"
        title="שינוי סדר: רווח או Enter לבחירה, חצים להזזה, Esc לביטול"
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">⋮⋮</span>
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
