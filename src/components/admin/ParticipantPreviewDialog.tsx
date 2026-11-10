"use client";

import { useEffect, useRef, useState } from "react";
import { QuestionCard } from "@/src/components/participant/QuestionCard";
import { AnswerOption } from "@/src/components/participant/AnswerOption";
import { PrimaryButton } from "@/src/components/participant/PrimaryButton";
import { MapQuestionInteractive } from "@/src/components/MapQuestionInteractive";
import type { EditableQuestion } from "@/src/lib/admin/quiz-editor";

interface ParticipantPreviewDialogProps {
  question: EditableQuestion;
  quizTitle: string;
  stationCount: number;
  onClose: () => void;
}

const normalizeAnswer = (value: string) =>
  value
    .normalize("NFKC")
    .replace(/[\u0591-\u05C7]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

/** Local rehearsal only. This component never joins a session or submits answers. */
export function ParticipantPreviewDialog({
  question,
  quizTitle,
  stationCount,
  onClose,
}: ParticipantPreviewDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [layout, setLayout] = useState<"mobile" | "desktop">("mobile");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [textAnswer, setTextAnswer] = useState("");
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [arrived, setArrived] = useState(!question.settings?.locationGate);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const targets = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]',
        ) ?? [],
      );
      const first = targets[0],
        last = targets[targets.length - 1];
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialogRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialogRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onClose]);

  function reset() {
    setSelectedIds([]);
    setTextAnswer("");
    setPin(null);
    setRevealed(false);
    setArrived(!question.settings?.locationGate);
  }
  const correctSet = new Set(question.correctIds ?? []);
  const options = question.options ?? [];
  const isMap = question.type === "map";
  const isOpen = question.type === "open";
  const isContent = question.type === "content";
  const accepted =
    question.settings?.acceptedAnswers?.filter((answer) => answer.trim()) ?? [];
  const correct = isOpen
    ? accepted.some(
        (answer) => normalizeAnswer(answer) === normalizeAnswer(textAnswer),
      )
    : selectedIds.length === correctSet.size &&
      selectedIds.every((id) => correctSet.has(id));
  const canAnswer = isMap
    ? pin !== null
    : isOpen
      ? textAnswer.trim().length > 0
      : selectedIds.length > 0;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-bsy-ink/50 p-2 sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="participant-preview-title"
        dir="rtl"
        className="flex max-h-[calc(100dvh-16px)] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-bsy-stone-200 bg-bsy-paper shadow-lg"
      >
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-bsy-stone-200 bg-white px-4 py-3">
          <div>
            <h2
              id="participant-preview-title"
              className="font-[var(--font-display)] text-xl text-bsy-brown"
            >
              תצוגת שחקן
            </h2>
            <p className="text-xs text-bsy-stone-700">
              ניסיון בלבד — התשובות וההתקדמות אינן נשמרות
            </p>
          </div>
          <div role="group" aria-label="גודל התצוגה" className="flex gap-2">
            {(
              [
                ["mobile", "נייד"],
                ["desktop", "מחשב"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={layout === value}
                onClick={() => setLayout(value)}
                className={`min-h-11 rounded-full border px-4 text-sm font-bold ${layout === value ? "border-bsy-forest bg-bsy-forest text-bsy-paper" : "border-bsy-stone-200 bg-white text-bsy-forest"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="סגירת תצוגת השחקן"
            onClick={onClose}
            className="min-h-11 rounded-full border border-bsy-stone-200 px-4 text-sm font-bold text-bsy-forest"
          >
            סגירה ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          <div
            className={`mx-auto flex min-h-[480px] w-full flex-col overflow-hidden rounded-md border border-bsy-stone-200 bg-bsy-paper ${layout === "mobile" ? "max-w-[390px]" : "max-w-[900px]"}`}
          >
            <div className="border-b border-bsy-stone-100 bg-bsy-paper-warm p-4">
              <p className="text-sm font-bold text-bsy-brown">{quizTitle}</p>
              <p className="mt-1 text-sm text-bsy-stone-700">
                תחנה {question.ordinal} מתוך {stationCount}
              </p>
            </div>
            <div className="flex flex-1 flex-col gap-4 p-4">
              {question.locationGatePending ? (
                <div
                  role="status"
                  className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
                >
                  <h3 className="font-[var(--font-display)] text-xl text-bsy-brown">
                    מיקום התחנה עדיין לא הוגדר
                  </h3>
                  <p>בחרו מיקום בעורך כדי לבדוק את פתיחת התחנה לפי GPS.</p>
                </div>
              ) : !arrived && question.settings?.locationGate ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                  <h3 className="font-[var(--font-display)] text-xl text-bsy-brown">
                    התחנה נפתחת לפי מיקום
                  </h3>
                  <p>
                    רדיוס הפתיחה: {question.settings.locationGate.radiusM} מטרים
                  </p>
                  <PrimaryButton onClick={() => setArrived(true)}>
                    הדמיית הגעה לתחנה
                  </PrimaryButton>
                </div>
              ) : (
                <>
                  {!isContent ? (
                    <p className="text-sm font-bold text-bsy-forest">
                      {question.settings?.timeLimitEnabled === false
                        ? "ללא הגבלת זמן"
                        : `זמן לשאלה: ${question.timeSeconds} שניות`}
                    </p>
                  ) : null}
                  <QuestionCard
                    type={question.type}
                    prompt={question.prompt}
                    imageUrl={question.imageUrl}
                    imageAlt={question.imageAlt}
                    videoUrl={question.videoUrl}
                    videoEmbedUrl={question.videoEmbedUrl}
                    videoProvider={question.videoProvider}
                    videoMimeType={question.videoMimeType}
                    videoPosterUrl={question.videoPosterUrl}
                  />
                  {isMap && question.map?.geo ? (
                    <MapQuestionInteractive
                      geo={question.map.geo}
                      pin={pin}
                      onPin={setPin}
                      revealed={revealed}
                      target={revealed ? question.map.geo.target : null}
                    />
                  ) : null}
                  {isOpen ? (
                    <label className="flex flex-col gap-2 text-sm">
                      התשובה שלכם
                      <textarea
                        rows={3}
                        maxLength={2000}
                        className="rounded-md border border-bsy-stone-200 bg-white p-3 focus:border-bsy-forest focus:outline-none"
                        value={textAnswer}
                        disabled={revealed}
                        onChange={(event) => setTextAnswer(event.target.value)}
                      />
                    </label>
                  ) : null}
                  {!isMap && !isOpen && !isContent
                    ? options.map((option, index) => (
                        <AnswerOption
                          key={option.id}
                          index={index}
                          label={option.text}
                          disabled={revealed}
                          state={
                            revealed
                              ? correctSet.has(option.id)
                                ? "correct"
                                : selectedIds.includes(option.id)
                                  ? "wrong"
                                  : "dim"
                              : selectedIds.includes(option.id)
                                ? "selected"
                                : "default"
                          }
                          onSelect={() =>
                            setSelectedIds((ids) =>
                              question.type === "multi"
                                ? ids.includes(option.id)
                                  ? ids.filter((id) => id !== option.id)
                                  : [...ids, option.id]
                                : [option.id],
                            )
                          }
                        />
                      ))
                    : null}
                  {revealed ? (
                    <div
                      role="status"
                      className="rounded-md border border-bsy-stone-200 bg-white p-3 text-sm"
                    >
                      <p className="font-bold">
                        {isMap
                          ? "המיקום הנכון מוצג במפה"
                          : correct
                            ? "תשובה נכונה"
                            : "התשובה אינה תואמת לתשובה הקבילה"}
                      </p>
                      {isOpen && accepted.length ? (
                        <p className="mt-2">
                          תשובה קבילה: {accepted.join(" / ")}
                        </p>
                      ) : null}
                      {question.explanation ? (
                        <p className="mt-2 whitespace-pre-wrap">
                          {question.explanation}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-auto pt-3">
                    {isContent ? (
                      <PrimaryButton block onClick={onClose}>
                        סיום התצוגה
                      </PrimaryButton>
                    ) : revealed ? (
                      <PrimaryButton block variant="ghost" onClick={reset}>
                        ניסיון נוסף
                      </PrimaryButton>
                    ) : (
                      <PrimaryButton
                        block
                        disabled={!canAnswer}
                        onClick={() => setRevealed(true)}
                      >
                        בדיקת התשובה בתצוגה
                      </PrimaryButton>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
