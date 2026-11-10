"use client";

import { useRef, type ReactNode } from "react";
import type { UniqueIdentifier } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortableQuestionCardProps {
  id: UniqueIdentifier;
  children: ReactNode;
  className?: string;
  position?: number;
  disabled?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export function SortableQuestionCard({
  id,
  children,
  className = "",
  position,
  disabled = false,
  onMoveUp,
  onMoveDown,
}: SortableQuestionCardProps) {
  const reorderRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id, disabled });

  function closeReorder() {
    if (reorderRef.current) reorderRef.current.open = false;
    summaryRef.current?.focus();
  }
  const moveActions = [
    { label: "הזז למעלה", arrow: "↑", action: onMoveUp },
    { label: "הזז למטה", arrow: "↓", action: onMoveDown },
  ];

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
        className="hidden min-h-11 w-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-md border border-bsy-stone-100 bg-white text-[18px] leading-none text-bsy-stone-400 transition-colors hover:border-bsy-forest hover:text-bsy-forest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bsy-forest active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40 md:flex"
        aria-label="גרירת שאלה לשינוי סדר"
        title="שינוי סדר: רווח או Enter לבחירה, חצים להזזה, Esc לביטול"
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">⋮⋮</span>
      </button>
      {!disabled && (onMoveUp || onMoveDown) ? (
        <details
          ref={reorderRef}
          className="relative shrink-0 self-center"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeReorder();
            }
          }}
        >
          <summary
            ref={summaryRef}
            aria-label={`שינוי סדר תחנה${position ? ` ${position}` : ""}`}
            title="שינוי סדר התחנה"
            className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-bsy-stone-200 bg-white text-lg text-bsy-forest hover:border-bsy-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bsy-forest [&::-webkit-details-marker]:hidden"
          >
            <span aria-hidden="true">↕</span>
          </summary>
          <div className="absolute right-0 top-12 z-20 flex w-40 flex-col gap-1 rounded-md border border-bsy-stone-200 bg-white p-2 shadow-lg">
            {moveActions.map(({ label, arrow, action }) => (
              <button
                key={label}
                type="button"
                disabled={!action}
                onClick={() => {
                  closeReorder();
                  action?.();
                }}
                className="flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-bold text-bsy-forest hover:bg-bsy-paper-warm disabled:cursor-not-allowed disabled:text-bsy-stone-400"
              >
                <span aria-hidden="true">{arrow}</span>
                {label}
              </button>
            ))}
          </div>
        </details>
      ) : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
