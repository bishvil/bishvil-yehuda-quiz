"use client";

import { useCallback } from "react";

import { LocationGateEditor } from "./LocationGateEditor";
import { TypePill } from "./TypePill";
import { QuestionImageUploader } from "./upload/QuestionImageUploader";
import { QuestionVideoUploader } from "./upload/QuestionVideoUploader";
import {
  MapQuestionEditor,
  type MapQuestionGeoDraft,
} from "./MapQuestionEditor";
import {
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  type QuestionType,
} from "@/src/lib/constants";
import type { QuestionOption } from "@/src/lib/supabase/database.types";

import {
  normalizeQuestionForType,
  type EditableQuestion,
} from "@/src/lib/admin/quiz-editor";

interface QuestionEditorProps {
  question: EditableQuestion;
  onChange: (next: EditableQuestion) => void;
  onDelete?: () => void;
  /**
   * ADR-0013 — when true the editor is rendered in read-only mode. All
   * inputs/buttons are disabled and onChange is never invoked. Used by
   * the quiz editor when the underlying quiz already has sessions.
   */
  readOnly?: boolean;
}

/**
 * The shared editor for a single question. Used by both the desktop
 * two-pane layout and the mobile dedicated edit view. All edits are
 * propagated upward via `onChange`; auto-save is owned by the page.
 */
export function QuestionEditor({
  question,
  onChange,
  onDelete,
  readOnly = false,
}: QuestionEditorProps) {
  const update = useCallback(
    (patch: Partial<EditableQuestion>) => onChange({ ...question, ...patch }),
    [onChange, question],
  );

  const handleTypeChange = useCallback(
    (nextType: QuestionType) => {
      // Wave-2 review M3 — delegate to a pure normalizer that strips
      // every field that does not belong to `nextType`. This prevents
      // stale `map` / `imageUrl` / `correctIds` rows from
      // riding along to the API on a type switch.
      onChange(normalizeQuestionForType(question, nextType));
    },
    [onChange, question],
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
    question.type === "image" ||
    question.type === "video";

  return (
    <div className="flex flex-col gap-4">
      <Field label="סוג שאלה">
        <div className="flex flex-wrap gap-2">
          {QUESTION_TYPES.map((t) => (
            <TypePill
              key={t}
              label={QUESTION_TYPE_LABELS[t]}
              active={question.type === t}
              onClick={readOnly ? undefined : () => handleTypeChange(t)}
              disabled={readOnly}
              data-testid={`type-pill-${t}`}
            />
          ))}
        </div>
      </Field>

      <Field label="ניסוח השאלה">
        <textarea
          rows={3}
          aria-label="ניסוח השאלה"
          className="w-full rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[14px] text-bsy-ink focus:border-bsy-forest focus:outline-none disabled:cursor-not-allowed disabled:bg-bsy-stone-50"
          value={question.prompt}
          onChange={(event) => update({ prompt: event.target.value })}
          disabled={readOnly}
          data-testid="question-prompt"
        />
      </Field>

      {question.type === "video" ? (
        <div
          className={[
            "flex flex-col gap-1.5",
            readOnly ? "pointer-events-none opacity-60" : "",
          ].join(" ")}
          aria-disabled={readOnly}
        >
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
            סרטון השאלה
          </span>
          <QuestionVideoUploader
            question={question}
            onPatch={(patch) => update(patch)}
          />
        </div>
      ) : null}

      {question.type === "image" || question.type === "content" ? (
        <div
          className={[
            "flex flex-col gap-1.5",
            readOnly ? "pointer-events-none opacity-60" : "",
          ].join(" ")}
          aria-disabled={readOnly}
        >
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
            תמונת השאלה
          </span>
          <QuestionImageUploader
            value={question.imageUrl}
            onChange={(imageUrl, meta) =>
              update({
                imageUrl,
                imageWidth: meta?.width ?? null,
                imageHeight: meta?.height ?? null,
                imagePath: meta?.path ?? null,
                // Clear the alt when the image is removed; preserve otherwise.
                imageAlt: imageUrl ? question.imageAlt : null,
              })
            }
          />
          <label className="mt-1 flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
              תיאור חלופי לתמונה
            </span>
            <input
              type="text"
              value={question.imageAlt ?? ""}
              maxLength={500}
              placeholder="תאר/י את התמונה לאדם שאינו רואה אותה"
              onChange={(event) =>
                update({ imageAlt: event.target.value || null })
              }
              disabled={readOnly || !question.imageUrl}
              className="min-h-11 rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[13px] disabled:cursor-not-allowed disabled:bg-bsy-stone-50 disabled:text-bsy-stone-400"
              dir="rtl"
              data-testid="question-image-alt"
            />
          </label>
        </div>
      ) : null}

      {question.type === "map" ? (
        <Field label="מפה ויעד">
          <div
            className={readOnly ? "pointer-events-none opacity-60" : undefined}
            aria-disabled={readOnly}
          >
            <MapQuestionEditor
              value={readMapGeoDraft(question)}
              onChange={(next) => update(writeMapGeoDraft(next))}
            />
          </div>
        </Field>
      ) : null}

      {supportsOptions ? (
        <Field label="תשובות">
          <div className="flex flex-col gap-2">
            {(question.options ?? []).map((option, optionIndex) => {
              const checked = (question.correctIds ?? []).includes(option.id);
              return (
                <div key={option.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleCorrect(option.id)}
                    aria-pressed={checked}
                    aria-label={`סימון תשובה ${optionIndex + 1} כנכונה`}
                    disabled={readOnly}
                    className={[
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-[14px] transition-colors",
                      checked
                        ? "border-bsy-forest bg-bsy-forest text-bsy-paper"
                        : "border-bsy-stone-200 bg-white text-transparent hover:border-bsy-forest",
                      "disabled:cursor-not-allowed",
                    ].join(" ")}
                    data-testid={`correct-toggle-${option.id}`}
                  >
                    ✓
                  </button>
                  <input
                    aria-label={`נוסח תשובה ${optionIndex + 1}`}
                    className="min-h-11 min-w-0 flex-1 rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[14px] focus:border-bsy-forest focus:outline-none disabled:cursor-not-allowed disabled:bg-bsy-stone-50"
                    value={option.text}
                    disabled={readOnly}
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
                      title={`מחיקת תשובה ${optionIndex + 1}`}
                      aria-label={`מחיקת תשובה ${optionIndex + 1}`}
                      disabled={readOnly}
                      className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-bsy-stone-200 text-[14px] text-bsy-stone-700 hover:border-bsy-error hover:text-bsy-error disabled:cursor-not-allowed disabled:text-bsy-stone-300"
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
                disabled={readOnly}
                className="min-h-11 self-start rounded-full border border-bsy-stone-200 px-4 py-2 text-[13px] font-bold text-bsy-forest hover:bg-bsy-paper-warm disabled:cursor-not-allowed disabled:text-bsy-stone-400"
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

      {question.type === "open" ? (
        <Field
          label="תשובות קבילות (תשובה בכל שורה)"
          help="הבדיקה מתעלמת מניקוד, רווחים עודפים והבדלי אותיות גדולות באנגלית."
        >
          <textarea
            rows={4}
            aria-label="תשובות קבילות (תשובה בכל שורה)"
            value={(question.settings?.acceptedAnswers ?? []).join("\n")}
            disabled={readOnly}
            className="rounded-md border border-bsy-stone-200 bg-white p-3 text-[14px] focus:border-bsy-forest focus:outline-none"
            onChange={(event) =>
              update({
                settings: {
                  ...question.settings,
                  acceptedAnswers: event.target.value.split("\n"),
                },
              })
            }
          />
        </Field>
      ) : null}
      {question.type !== "content" ? (
        <label className="flex min-h-11 items-center gap-3 rounded-full px-2 text-[14px]">
          <input
            type="checkbox"
            className="h-5 w-5 accent-bsy-forest"
            disabled={readOnly}
            checked={question.settings?.timeLimitEnabled === false}
            onChange={(event) =>
              update({
                settings: {
                  ...question.settings,
                  timeLimitEnabled: !event.target.checked,
                },
              })
            }
          />
          ללא הגבלת זמן
        </label>
      ) : null}
      <LocationGateEditor
        question={question}
        update={update}
        readOnly={readOnly}
      />
      {question.type !== "content" ? (
        <NumberField
          label="זמן (שניות)"
          value={question.timeSeconds}
          min={5}
          max={600}
          onChange={(timeSeconds) => update({ timeSeconds })}
          disabled={readOnly || question.settings?.timeLimitEnabled === false}
        />
      ) : null}
      {question.type !== "content" ? (
        <details className="rounded-md border border-bsy-stone-200 p-3">
          <summary className="min-h-11 cursor-pointer content-center text-[13px] font-bold text-bsy-forest">
            ניקוד ופידבק לאחר תשובה · {question.points} נקודות
            {question.explanation ? " · פידבק מוגדר" : ""}
          </summary>
          <div className="mt-3 flex flex-col gap-4">
            <NumberField
              label="נקודות"
              value={question.points}
              min={1}
              max={10000}
              step={50}
              onChange={(points) => update({ points })}
              disabled={readOnly}
            />
            <Field label="פידבק לאחר תשובה">
              <textarea
                aria-label="פידבק לאחר תשובה"
                rows={3}
                className="w-full rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[14px] disabled:cursor-not-allowed disabled:bg-bsy-stone-50"
                value={question.explanation ?? ""}
                disabled={readOnly}
                onChange={(event) =>
                  update({ explanation: event.target.value || null })
                }
              />
            </Field>
          </div>
        </details>
      ) : null}

      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="min-h-11 self-start rounded-full border border-bsy-error/30 px-4 py-2 text-[13px] text-bsy-error hover:bg-bsy-error/5"
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
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-[12px] font-bold text-bsy-stone-700">
        {label}
      </legend>
      {children}
      {help ? (
        <span className="text-[11px] text-bsy-stone-400">{help}</span>
      ) : null}
    </fieldset>
  );
}

function readMapGeoDraft(q: EditableQuestion): MapQuestionGeoDraft | null {
  const geo = q.map?.geo;
  if (!geo) return null;
  return {
    target: { lat: geo.target.lat, lng: geo.target.lng },
    toleranceKm: geo.toleranceKm,
    center: geo.center,
    zoom: geo.zoom,
    styleHint: geo.styleHint,
    baseStyle: geo.baseStyle,
    labelLevel: geo.labelLevel,
  };
}

function writeMapGeoDraft(
  next: MapQuestionGeoDraft,
): Partial<EditableQuestion> {
  return {
    map: {
      geo: {
        target: next.target,
        toleranceKm: next.toleranceKm,
        center: next.center,
        zoom: next.zoom,
        styleHint: next.styleHint,
        baseStyle: next.baseStyle,
        labelLevel: next.labelLevel,
      },
    },
  };
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
        {label}
      </span>
      <input
        type="number"
        className="min-h-11 rounded-md border border-bsy-stone-200 bg-white px-3 py-2 font-mono text-[14px] disabled:cursor-not-allowed disabled:bg-bsy-stone-50"
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}
