"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AnswerOption, type AnswerOptionState } from "@/src/components/participant/AnswerOption";
import { FeedbackCard } from "@/src/components/participant/FeedbackCard";
import { PrimaryButton } from "@/src/components/participant/PrimaryButton";
import { ProgressBar } from "@/src/components/participant/ProgressBar";
import { QuestionCard } from "@/src/components/participant/QuestionCard";
import { TimerBar } from "@/src/components/participant/TimerBar";
import type { GameMode } from "@/src/lib/constants";
import { useParticipantState } from "@/src/lib/hooks/useParticipantState";
import {
  advanceParticipant,
  submitAnswer,
} from "@/src/lib/participant/api-client";
import type { ParticipantBrand } from "@/src/lib/participant/brands";
import type { ParticipantStateResponse } from "@/src/lib/sessions/participant-payload";
import { useServerCountdown } from "@/src/lib/time/countdown";

const MapQuestionInteractive = dynamic(
  () =>
    import("@/src/components/MapQuestionInteractive").then(
      (m) => m.MapQuestionInteractive,
    ),
  { ssr: false },
);

interface PlayScreenProps {
  pin: string;
  brand: ParticipantBrand;
  customLogo: string | null;
  customLogoLabel: string | null;
  gameMode: GameMode;
}

export function PlayScreen({
  pin,
  brand,
  customLogo,
  customLogoLabel,
  gameMode,
}: PlayScreenProps) {
  const router = useRouter();
  const {
    state,
    status: loadStatus,
    error: loadError,
    refetch,
  } = useParticipantState({ pin });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mapGeoPin, setMapGeoPin] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingReveal, setPendingReveal] = useState<{
    isCorrect: boolean;
    correctIds: string[] | null;
    explanation: string | null;
    score?: number | null;
    distanceKm?: number | null;
    correctnessRatio?: number | null;
  } | null>(null);

  const question = state?.question ?? null;
  const myAnswer = state?.myAnswer ?? null;
  const reveal = state?.reveal ?? null;

  const previousQuestionKeyRef = useRef<string>("");
  const currentQuestionKey = buildQuestionKey(question);

  // Reset transient state on question change. The ref is mutated only
  // inside the effect (post-commit), satisfying the no-mutate-during-render
  // lint rule.
  useEffect(() => {
    if (previousQuestionKeyRef.current !== currentQuestionKey) {
      setSelectedIds([]);
      setMapGeoPin(null);
      setPendingReveal(null);
      setSubmitError(null);
      previousQuestionKeyRef.current = currentQuestionKey;
    }
  }, [currentQuestionKey]);

  // End-state route.
  useEffect(() => {
    if (state?.session.status === "ended") {
      router.replace(`/${pin}/result`);
    }
  }, [state, pin, router]);

  // The participant cookie is missing or no participant row matches —
  // there is nothing to retry. Send the user back to the join screen with
  // a flag so a friendly banner can explain what happened. If we have prior
  // evidence the session ended, prefer /result so a finished player who
  // bounces through a 404 still lands on their score rather than the join
  // screen (QA-18).
  useEffect(() => {
    if (loadStatus !== "not_found") return;
    if (state?.session.status === "ended") {
      router.replace(`/${pin}/result`);
    } else {
      router.replace(`/${pin}?expired=1`);
    }
  }, [loadStatus, state, pin, router]);

  // No question yet — wait for host (sync) or backend bootstrap (async).
  const showWaitingForHost =
    state !== null && question === null && gameMode === "sync";
  const isBootstrappingAsync =
    state !== null && question === null && gameMode === "async";

  const isRevealed = question?.status === "revealed";
  const isAnswering = question?.status === "answering";
  const hasSubmitted = myAnswer !== null;

  const correctSet = useMemo(() => {
    if (!isRevealed) return new Set<string>();
    if (pendingReveal?.correctIds) return new Set(pendingReveal.correctIds);
    if (reveal?.correctIds) return new Set(reveal.correctIds);
    return new Set<string>();
  }, [isRevealed, pendingReveal, reveal]);

  const explanation = pendingReveal?.explanation ?? reveal?.explanation ?? null;
  const submittedIsCorrect =
    pendingReveal?.isCorrect ??
    (myAnswer && "isCorrect" in myAnswer ? myAnswer.isCorrect ?? null : null);

  // Partial-credit display fields (ADR-0006 Open Q2+Q3 RESOLVED).
  // Score source: pendingReveal (async immediate reveal) → myAnswer (polled state).
  const revealedScore =
    pendingReveal?.score ??
    (myAnswer?.status === "revealed" ? (myAnswer.score ?? null) : null);
  const revealedDistanceKm =
    pendingReveal?.distanceKm ??
    (myAnswer?.status === "revealed" ? (myAnswer.distanceKm ?? null) : null);

  // For multi-select: count how many of the participant's submitted options
  // are in the correct set (for "X מתוך W סימונים נכונים" display).
  // Prefer the server-side `myAnswer.selectedIds` so the count survives a
  // remount/refresh after submission — the local UI `selectedIds` state is
  // reset on every question change. Falls back to the UI state only for
  // the brief window between submit and the next state refresh.
  const multiCorrectCount = useMemo(() => {
    if (question?.type !== "multi" || !isRevealed) return null;
    const submitted =
      myAnswer && "selectedIds" in myAnswer && myAnswer.selectedIds
        ? myAnswer.selectedIds
        : selectedIds;
    return submitted.filter((id) => correctSet.has(id)).length;
  }, [question?.type, isRevealed, selectedIds, correctSet, myAnswer]);

  function handleToggleOption(optionId: string) {
    if (!question || !isAnswering || hasSubmitted) return;
    setSelectedIds((prev) => {
      if (question.type === "multi") {
        return prev.includes(optionId)
          ? prev.filter((id) => id !== optionId)
          : [...prev, optionId];
      }
      return [optionId];
    });
  }

  function handleMapGeoPin(next: { lat: number; lng: number }) {
    if (!question || !isAnswering || hasSubmitted) return;
    setMapGeoPin(next);
  }

  const handleSubmit = useCallback(async () => {
    if (!question || !isAnswering || hasSubmitted || submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    const body =
      question.type === "map" && mapGeoPin
        ? { questionId: question.id, pin: { lat: mapGeoPin.lat, lng: mapGeoPin.lng } }
        : selectedIds.length > 0
          ? { questionId: question.id, selectedIds }
          : null;

    if (!body || !body.questionId) {
      setSubmitting(false);
      return;
    }

    try {
      const response = await submitAnswer(pin, body);
      if ("error" in response) {
        setSubmitError(translateAnswerError(response.error));
        setSubmitting(false);
        return;
      }

      // Async mode response includes reveal data immediately. Sync mode
      // returns only `status: submitted` and `submittedAt`.
      if (
        "isCorrect" in response &&
        typeof response.isCorrect === "boolean"
      ) {
        setPendingReveal({
          isCorrect: response.isCorrect,
          correctIds: response.correctIds ?? null,
          explanation: response.explanation ?? null,
          score: response.score ?? null,
          distanceKm: response.distanceKm ?? null,
          correctnessRatio: response.correctnessRatio ?? null,
        });
      }

      await refetch();
    } catch (caught) {
      setSubmitError(
        caught instanceof Error ? caught.message : "אירעה שגיאה. נסו שוב.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    question,
    isAnswering,
    hasSubmitted,
    submitting,
    mapGeoPin,
    selectedIds,
    pin,
    refetch,
  ]);

  async function handleAdvance() {
    if (advancing) return;
    if (gameMode === "sync") {
      // Host drives advancement; the polling hook will pick up the next
      // question. We just refetch once to reduce perceived latency.
      await refetch();
      return;
    }

    setAdvancing(true);
    try {
      const response = await advanceParticipant(pin);
      if (response.status === "completed") {
        router.replace(`/${pin}/result`);
        return;
      }
      await refetch();
    } catch (caught) {
      setSubmitError(
        caught instanceof Error ? caught.message : "אירעה שגיאה. נסו שוב.",
      );
    } finally {
      setAdvancing(false);
    }
  }

  // No state yet — initial loading or hard error.
  if (!state) {
    if (loadStatus === "error") {
      return <PlayLoadError message={loadError} onRetry={refetch} />;
    }
    return <PlayLoading />;
  }

  if (showWaitingForHost) {
    return <WaitingForHost />;
  }

  if (isBootstrappingAsync || !question) {
    return <PlayLoading />;
  }

  const showSyncWaitingReveal =
    gameMode === "sync" && hasSubmitted && !isRevealed;

  const submitDisabled =
    submitting ||
    hasSubmitted ||
    !isAnswering ||
    (question.type === "map" ? !mapGeoPin : selectedIds.length === 0);

  const isLastQuestion = question.index === question.total;

  return (
    <main className="flex min-h-screen flex-col bg-bsy-paper">
      {loadStatus === "error" ? (
        <ReconnectingBanner onRetry={refetch} />
      ) : null}
      <header className="border-b border-bsy-stone-100 bg-bsy-paper-warm px-5 pb-3 pt-3.5">
        <div className="mb-2 flex items-center justify-between text-xs font-bold text-bsy-stone-700">
          <span className="font-[var(--font-display)] text-[15px] text-bsy-brown">
            תחנה <b className="text-bsy-forest">{question.index}</b> מתוך {question.total}
          </span>
          <TimerLane question={question} hasSubmitted={hasSubmitted} isRevealed={isRevealed} />
        </div>
        <ProgressBar
          current={question.index}
          total={question.total}
          ariaLabel={`שאלה ${question.index} מתוך ${question.total}`}
        />
      </header>

      <section className="flex flex-1 flex-col gap-4 px-5 py-5">
        <QuestionCard
          type={question.type}
          prompt={question.prompt}
          imageUrl={question.imageUrl}
          imageAlt={question.imageAlt}
        />

        {question.type === "map" ? (
          renderMapQuestion({
            question,
            mapGeoPin,
            isRevealed,
            isAnswering,
            hasSubmitted,
            mapGeoTarget: reveal?.mapGeoTarget ?? null,
            onGeoPin: handleMapGeoPin,
          })
        ) : (
          <div className="flex flex-col gap-2.5">
            {(question.options ?? []).map((option, index) => {
              const isSelected = selectedIds.includes(option.id);
              const optionState = computeOptionState({
                isRevealed,
                isSelected,
                isCorrect: correctSet.has(option.id),
              });
              return (
                <AnswerOption
                  key={option.id}
                  index={index}
                  label={option.text}
                  state={optionState}
                  disabled={hasSubmitted || !isAnswering}
                  onSelect={() => handleToggleOption(option.id)}
                />
              );
            })}
          </div>
        )}

        {showSyncWaitingReveal ? (
          <div
            role="status"
            className="rounded-md border border-bsy-stone-100 bg-white px-4 py-3 text-center text-[13px] text-bsy-stone-700"
          >
            <span className="font-[var(--font-display)] text-base text-bsy-brown">
              תשובתכם התקבלה
            </span>
            <p className="m-0 mt-1">ממתינים לחשיפה אצל המדריך…</p>
          </div>
        ) : null}

        {isRevealed ? (
          <FeedbackCard
            isCorrect={Boolean(submittedIsCorrect)}
            explanation={explanation}
            score={revealedScore}
            totalPoints={question?.points ?? null}
            distanceKm={revealedDistanceKm}
            correctCount={question?.type === "multi" ? multiCorrectCount : null}
            totalCorrect={
              question?.type === "multi"
                ? (reveal?.correctIds ?? pendingReveal?.correctIds)?.length ?? null
                : null
            }
          />
        ) : null}

        {submitError ? (
          <div
            role="alert"
            className="rounded-md border border-bsy-error/30 bg-bsy-error/10 px-3 py-2 text-[13px] text-bsy-error"
          >
            {submitError}
          </div>
        ) : null}
      </section>

      <footer className="border-t border-bsy-stone-100 bg-bsy-paper/95 px-5 py-3.5">
        {!isRevealed ? (
          <PrimaryButton
            variant="primary"
            block
            onClick={handleSubmit}
            disabled={submitDisabled}
          >
            {submitting ? "שולחים…" : hasSubmitted ? "תשובה נשלחה" : "שליחת תשובה"}
          </PrimaryButton>
        ) : (
          <PrimaryButton
            variant="accent"
            block
            withArrow
            onClick={handleAdvance}
            disabled={advancing}
          >
            {isLastQuestion ? "סיום וצפייה בתוצאה" : "לתחנה הבאה"}
          </PrimaryButton>
        )}
      </footer>
      <BrandFooter
        brand={brand}
        customLogo={customLogo}
        customLogoLabel={customLogoLabel}
      />
    </main>
  );
}

interface RenderMapArgs {
  question: NonNullable<ParticipantStateResponse["question"]>;
  mapGeoPin: { lat: number; lng: number } | null;
  isRevealed: boolean;
  isAnswering: boolean;
  hasSubmitted: boolean;
  mapGeoTarget: { lat: number; lng: number } | null;
  onGeoPin: (pin: { lat: number; lng: number }) => void;
}

function renderMapQuestion({
  question,
  mapGeoPin,
  isRevealed,
  isAnswering,
  hasSubmitted,
  mapGeoTarget,
  onGeoPin,
}: RenderMapArgs) {
  const locked = !isAnswering || hasSubmitted;

  if (!question.map?.geo) {
    return (
      <div className="rounded-md border border-bsy-error/30 bg-bsy-error/10 p-3 text-center text-sm text-bsy-error">
        מפת השאלה חסרה. צרו קשר עם המארגנים.
      </div>
    );
  }

  return (
    <MapQuestionInteractive
      geo={question.map.geo}
      pin={mapGeoPin}
      onPin={onGeoPin}
      revealed={isRevealed}
      locked={locked}
      target={isRevealed ? mapGeoTarget : null}
    />
  );
}

function computeOptionState(args: {
  isRevealed: boolean;
  isSelected: boolean;
  isCorrect: boolean;
}): AnswerOptionState {
  const { isRevealed, isSelected, isCorrect } = args;
  if (!isRevealed) {
    return isSelected ? "selected" : "default";
  }
  if (isCorrect) return "correct";
  if (isSelected) return "wrong";
  return "dim";
}

function buildQuestionKey(
  question: ParticipantStateResponse["question"] | null,
): string {
  if (!question) return "";
  return `${question.index}:${question.status}`;
}

interface TimerLaneProps {
  question: NonNullable<ParticipantStateResponse["question"]>;
  hasSubmitted: boolean;
  isRevealed: boolean;
}

function TimerLane({ question, hasSubmitted, isRevealed }: TimerLaneProps) {
  // Keep the deadline live across answering/locked/revealed so the display
  // settles at 0:00 instead of jumping back to the full duration when the
  // station ends.
  const keepDeadline =
    !hasSubmitted &&
    question.deadlineAt &&
    (question.status === "answering" ||
      question.status === "locked" ||
      question.status === "revealed");

  const countdown = useServerCountdown({
    deadlineAt: keepDeadline ? question.deadlineAt : null,
    serverNow: question.serverNow,
    timeSeconds: question.timeSeconds,
  });

  const showBar = !isRevealed && !hasSubmitted;

  return (
    <TimerBar
      fraction={countdown.fraction}
      remainingSeconds={countdown.remainingSeconds}
      isWarning={countdown.isWarning && !hasSubmitted}
      showBar={showBar}
    />
  );
}

function PlayLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bsy-paper">
      <p className="text-[14px] text-bsy-stone-700">טוענים…</p>
    </main>
  );
}

function PlayLoadError({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry: () => Promise<void> | void;
}) {
  return (
    <main
      role="alert"
      dir="rtl"
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bsy-paper px-6 text-center"
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-bsy-forest">
        שגיאה בטעינה
      </p>
      <h2 className="m-0 font-[var(--font-display)] text-[26px] text-bsy-brown">
        איבדנו רגע את החיבור
      </h2>
      <p className="max-w-sm text-[13px] text-bsy-stone-700">
        {message ?? "Could not load session state."}
      </p>
      <button
        type="button"
        onClick={() => void onRetry()}
        className="mt-2 rounded-md bg-bsy-forest px-5 py-2 text-[13px] font-bold text-bsy-paper shadow-[var(--shadow-sm)] hover:bg-bsy-forest/90"
      >
        נסו שוב
      </button>
    </main>
  );
}

function ReconnectingBanner({
  onRetry,
}: {
  onRetry: () => Promise<void> | void;
}) {
  return (
    <div
      role="status"
      dir="rtl"
      className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-bsy-stone-200 bg-bsy-paper-warm px-3 py-2 text-[12px] text-bsy-stone-700"
    >
      <span>איבדנו רגע את החיבור — מנסים להתחבר מחדש…</span>
      <button
        type="button"
        onClick={() => void onRetry()}
        className="rounded-md bg-bsy-forest px-3 py-1 text-[11px] font-bold text-bsy-paper hover:bg-bsy-forest/90"
      >
        רענון מיידי
      </button>
    </div>
  );
}

function WaitingForHost() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bsy-paper px-6 text-center">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-bsy-forest">
        ממתינים למדריך
      </p>
      <h2 className="m-0 font-[var(--font-display)] text-[28px] text-bsy-brown">
        מתחילים תכף
      </h2>
      <p className="max-w-sm text-[14px] text-bsy-stone-700">
        המדריך פותח את התחנה הראשונה. החידון יתחיל אוטומטית כשהוא יתחיל.
      </p>
    </main>
  );
}

interface BrandFooterProps {
  brand: ParticipantBrand;
  customLogo: string | null;
  customLogoLabel: string | null;
}

function BrandFooter({ brand, customLogo, customLogoLabel }: BrandFooterProps) {
  const label = customLogo ? (customLogoLabel ?? brand.name) : brand.name;
  return (
    <p className="bg-bsy-paper px-5 pb-4 pt-1 text-center text-[10px] uppercase tracking-[0.18em] text-bsy-stone-400">
      {customLogo ? `${label} · בשביל יהודה` : label}
    </p>
  );
}

function translateAnswerError(code: string): string {
  switch (code) {
    case "LATE_SUBMISSION":
      return "הגעתם מאוחר מדי לשאלה הזו.";
    case "QUESTION_NOT_ACTIVE":
      return "השאלה אינה פתוחה כרגע לתשובות.";
    case "SESSION_ENDED":
    case "SESSION_EXPIRED":
      return "החידון הסתיים.";
    case "INVALID_REQUEST":
      return "הבחירה שלכם אינה תקינה. נסו שוב.";
    default:
      return "אירעה שגיאה. נסו שוב.";
  }
}
