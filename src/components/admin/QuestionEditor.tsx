"use client";

import { useCallback } from "react";

import { TypePill } from "./TypePill";
import {
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  type QuestionType,
} from "@/src/lib/constants";
import type {
  QuestionMap,
  QuestionOption,
} from "@/src/lib/supabase/database.types";

import {
  SCAFFOLDED_OPTIONS,
  type EditableQuestion,
} from "@/src/lib/admin/quiz-editor";

interface QuestionEditorProps {
  question: EditableQuestion;
  onChange: (next: EditableQuestion) => void;
  onDelete?: () => void;
}

const TRUE_FALSE_OPTIONS: QuestionOption[] = [
  { id: "yes", text: "נכון" },
  { id: "no", text: "לא נכון" },
];

/**
 * The shared editor for a single question. Used by both the desktop
 * two-pane layout and the mobile dedicated edit view. All edits are
 * propagated upward via `onChange`; auto-save is owned by the page.
 */
export function QuestionEditor({
  question,
  onChange,
  onDelete,
}: QuestionEditorProps) {
  const update = useCallback(
    (patch: Partial<EditableQuestion>) => onChange({ ...question, ...patch }),
    [onChange, question],
  );

  const handleTypeChange = useCallback(
    (nextType: QuestionType) => {
      if (nextType === question.type) return;

      let options: QuestionOption[] | null = question.options ?? null;
      let correctIds: string[] = question.correctIds ?? [];
      let map: QuestionMap | null = question.map ?? null;

      if (
        nextType === "single" ||
        nextType === "multi" ||
        nextType === "image"
      ) {
        if (!options || options.length === 0) {
          options = [...SCAFFOLDED_OPTIONS];
        }
      } else if (nextType === "truefalse") {
        options = [...TRUE_FALSE_OPTIONS];
        correctIds = correctIds.filter((id) =>
          TRUE_FALSE_OPTIONS.some((o) => o.id === id),
        );
      } else if (nextType === "map") {
        options = null;
        correctIds = [];
        map = map ?? {
          image_url: "",
          target: { x: 50, y: 50 },
        };
      }

      // single → only one correct allowed
      if (nextType === "single" && correctIds.length > 1) {
        correctIds = correctIds.slice(0, 1);
      }

      update({ type: nextType, options, correctIds, map });
    },
    [
      question.type,
      question.options,
      question.correctIds,
      question.map,
      update,
    ],
  );

  const toggleCorrect = useCallback(
    (optionId: string) => {
      const current = question.correctIds ?? [];
      const isMulti = question.type === "multi";
      const next = isMulti
        ? current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId]
        : [optionId];
      update({ correctIds: next });
    },
    [question.correctIds, question.type, update],
  );

  const supportsOptions =
    question.type === "single" ||
    question.type === "multi" ||
    question.type === "truefalse" ||
    question.type === "image";

  return (
    <div className="flex flex-col gap-4">
      <Field label="סוג שאלה">
        <div className="flex flex-wrap gap-2">
          {QUESTION_TYPES.map((t) => (
            <TypePill
              key={t}
              label={QUESTION_TYPE_LABELS[t]}
              active={question.type === t}
              onClick={() => handleTypeChange(t)}
              data-testid={`type-pill-${t}`}
            />
          ))}
        </div>
      </Field>

      <Field label="ניסוח השאלה">
        <textarea
          rows={3}
          className="w-full rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[14px] text-bsy-ink focus:border-bsy-forest focus:outline-none"
          value={question.prompt}
          onChange={(event) => update({ prompt: event.target.value })}
          data-testid="question-prompt"
        />
      </Field>

      {question.type === "image" ? (
        <Field
          label="כתובת התמונה"
          help="הדבק כתובת ציבורית של תמונה. העלאות יישמרו לגל הבא."
        >
          <input
            className="w-full rounded-md border border-bsy-stone-200 bg-white px-3 py-2 font-mono text-[12px]"
            dir="ltr"
            value={question.imageUrl ?? ""}
            placeholder="https://…/photo.jpg"
            onChange={(event) =>
              update({ imageUrl: event.target.value || null })
            }
          />
        </Field>
      ) : null}

      {question.type === "map" ? (
        <Field label="מפה ויעד">
          <div className="rounded-md border border-bsy-stone-200 bg-white p-3">
            <input
              className="mb-2 w-full rounded-md border border-bsy-stone-200 px-3 py-2 font-mono text-[12px]"
              dir="ltr"
              placeholder="כתובת מפה (https://…)"
              value={question.map?.image_url ?? ""}
              onChange={(event) =>
                update({
                  map: {
                    image_url: event.target.value,
                    target: question.map?.target ?? { x: 50, y: 50 },
                  },
                })
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="X (%)"
                value={question.map?.target.x ?? 50}
                min={0}
                max={100}
                onChange={(x) =>
                  update({
                    map: {
                      image_url: question.map?.image_url ?? "",
                      target: {
                        x,
                        y: question.map?.target.y ?? 50,
                      },
                    },
                  })
                }
              />
              <NumberField
                label="Y (%)"
                value={question.map?.target.y ?? 50}
                min={0}
                max={100}
                onChange={(y) =>
                  update({
                    map: {
                      image_url: question.map?.image_url ?? "",
                      target: {
                        x: question.map?.target.x ?? 50,
                        y,
                      },
                    },
                  })
                }
              />
            </div>
            <NumberField
              label="סובלנות (%)"
              value={Number(question.tolerance ?? 5)}
              min={0}
              max={100}
              onChange={(tolerance) => update({ tolerance: String(tolerance) })}
            />
          </div>
        </Field>
      ) : null}

      {supportsOptions ? (
        <Field label="תשובות">
          <div className="flex flex-col gap-2">
            {(question.options ?? []).map((option) => {
              const checked = (question.correctIds ?? []).includes(option.id);
              return (
                <div key={option.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleCorrect(option.id)}
                    aria-pressed={checked}
                    className={[
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-[14px] transition-colors",
                      checked
                        ? "border-bsy-forest bg-bsy-forest text-bsy-paper"
                        : "border-bsy-stone-200 bg-white text-transparent hover:border-bsy-forest",
                    ].join(" ")}
                    data-testid={`correct-toggle-${option.id}`}
                  >
                    ✓
                  </button>
                  <input
                    className="flex-1 rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[14px]"
                    value={option.text}
                    onChange={(event) =>
                      update({
                        options: (question.options ?? []).map((o) =>
                          o.id === option.id
                            ? { ...o, text: event.target.value }
                            : o,
                        ),
                      })
                    }
                  />
                  {question.type !== "truefalse" ? (
                    <button
                      type="button"
                      title="מחיקה"
                      className="px-2 text-[14px] text-bsy-stone-400 hover:text-bsy-error"
                      onClick={() =>
                        update({
                          options: (question.options ?? []).filter(
                            (o) => o.id !== option.id,
                          ),
                          correctIds: (question.correctIds ?? []).filter(
                            (id) => id !== option.id,
                          ),
                        })
                      }
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              );
            })}
            {question.type !== "truefalse" ? (
              <button
                type="button"
                className="self-start text-[12px] font-bold text-bsy-forest hover:underline"
                onClick={() => {
                  const next = [...(question.options ?? [])];
                  const id = nextOptionId(next);
                  next.push({ id, text: `תשובה ${next.length + 1}` });
                  update({ options: next });
                }}
              >
                + הוספת תשובה
              </button>
            ) : null}
          </div>
        </Field>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="זמן (שניות)"
          value={question.timeSeconds}
          min={5}
          max={600}
          onChange={(timeSeconds) => update({ timeSeconds })}
        />
        <NumberField
          label="נקודות"
          value={question.points}
          min={0}
          max={10000}
          step={50}
          onChange={(points) => update({ points })}
        />
      </div>

      <Field label="פידבק לאחר תשובה">
        <textarea
          rows={3}
          className="w-full rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[14px]"
          value={question.explanation ?? ""}
          onChange={(event) =>
            update({ explanation: event.target.value || null })
          }
        />
      </Field>

      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="self-start text-[12px] text-bsy-error hover:underline"
        >
          מחיקת תחנה
        </button>
      ) : null}
    </div>
  );
}

function nextOptionId(options: QuestionOption[]): string {
  // Stable a..f then o0, o1… to avoid collisions if user trims and re-adds.
  const taken = new Set(options.map((o) => o.id));
  for (const c of "abcdefghijkl") {
    if (!taken.has(c)) return c;
  }
  let i = 0;
  while (taken.has(`o${i}`)) i += 1;
  return `o${i}`;
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
        {label}
      </span>
      {children}
      {help ? (
        <span className="text-[11px] text-bsy-stone-400">{help}</span>
      ) : null}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
        {label}
      </span>
      <input
        type="number"
        className="rounded-md border border-bsy-stone-200 bg-white px-3 py-2 font-mono text-[14px]"
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}
