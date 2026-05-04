"use client";

import { useCallback, useMemo, useState } from "react";

import { HostAnswerBars } from "@/src/components/host/HostAnswerBars";
import { HostAsyncProgressList } from "@/src/components/host/HostAsyncProgressList";
import { HostControlBar } from "@/src/components/host/HostControlBar";
import { HostHeader } from "@/src/components/host/HostHeader";
import { HostMapSummary } from "@/src/components/host/HostMapSummary";
import { HostPlayerList, type HostPlayer } from "@/src/components/host/HostPlayerList";
import { HostQuestionCard } from "@/src/components/host/HostQuestionCard";
import { HostTimerPanel } from "@/src/components/host/HostTimerPanel";
import {
  endHostSession,
  isHostApiError,
  nextHostQuestion,
  pauseHostSession,
  resumeHostSession,
  revealHostQuestion,
  startHostQuestion,
  startHostSession,
} from "@/src/lib/host/api-client";
import { decideHostPrimaryButton } from "@/src/lib/host/controls";
import { useHostState } from "@/src/lib/hooks/useHostState";
import type { ParticipantBrand } from "@/src/lib/participant/brands";
import type { QuestionStatusEnum } from "@/src/lib/supabase/database.types";
import { useServerCountdown } from "@/src/lib/time/countdown";

interface HostScreenProps {
  pin: string;
  brand: ParticipantBrand;
  customLogo: string | null;
  customLogoLabel: string | null;
}

type MobileTab = "live" | "players";

/**
 * Top-level client surface for /host/[pin]. Holds the live state hook,
 * derives the primary-button decision, and dispatches host actions through
 * the API client. The DOM is rendered twice — once for desktop projector,
 * once for mobile field — and CSS hides whichever isn't active.
 */
export function HostScreen({
  pin,
  brand,
  customLogo,
  customLogoLabel,
}: HostScreenProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("live");

  const { state, status: loadStatus, error: loadError, refetch } = useHostState({ pin });

  const question = state?.question ?? null;

  // Keep the deadline live during answering AND once locked/revealed so the
  // timer naturally settles at 0:00 instead of resetting to the question's
  // full duration when the status flips.
  const countdownDeadline =
    question &&
    question.deadlineAt &&
    (question.status === "answering" ||
      question.status === "locked" ||
      question.status === "revealed")
      ? question.deadlineAt
      : null;

  const countdown = useServerCountdown({
    deadlineAt: countdownDeadline,
    serverNow: state?.serverNow ?? null,
    timeSeconds: question?.timeSeconds ?? 0,
  });

  const sessionStatus = (state?.status ?? "scheduled") as
    | "draft"
    | "scheduled"
    | "live"
    | "paused"
    | "ended";

  const totalQuestions = state?.totalQuestions ?? 0;
  const hasNextQuestion = Boolean(state?.nextQuestion);
  const questionStatus = (question?.status ?? null) as QuestionStatusEnum | null;
  const questionOrdinal = question?.ordinal ?? null;
  const isLastQuestion =
    questionOrdinal !== null &&
    totalQuestions > 0 &&
    questionOrdinal === totalQuestions;
  const deadlinePassed =
    question?.status === "answering" ? countdown.expired : false;

  const primary = useMemo(() => {
    return decideHostPrimaryButton({
      sessionStatus,
      questionStatus,
      deadlinePassed,
      hasNextQuestion,
      isLastQuestion,
    });
  }, [
    sessionStatus,
    questionStatus,
    deadlinePassed,
    hasNextQuestion,
    isLastQuestion,
  ]);

  const handlePrimary = useCallback(async () => {
    if (!state || busy || primary.disabled) return;
    setBusy(true);
    setError(null);

    try {
      if (primary.action === "start_session") {
        const response = await startHostSession(pin);
        if (isHostApiError(response)) {
          setError(translateHostError(response.error));
        }
      } else if (primary.action === "start_question") {
        const next = state.nextQuestion;
        if (!next) {
          setError("לא נותרו תחנות.");
        } else {
          const response = await startHostQuestion(pin, next.id);
          if (isHostApiError(response)) {
            setError(translateHostError(response.error));
          }
        }
      } else if (primary.action === "reveal") {
        if (!question) {
          setError("אין תחנה פעילה.");
        } else {
          const response = await revealHostQuestion(pin, question.id);
          if (isHostApiError(response)) {
            setError(translateHostError(response.error));
          }
        }
      } else if (primary.action === "advance") {
        // Two-step: advance current_question_id, then auto-start the next
        // question if one came back. This mirrors what the host expects
        // from a single click — they don't want to press twice between
        // stations. If `all_revealed` came back, the session is now ended.
        const advanced = await nextHostQuestion(pin);
        if (isHostApiError(advanced)) {
          setError(translateHostError(advanced.error));
        } else if (advanced.status === "advanced" && advanced.nextQuestionId) {
          const started = await startHostQuestion(pin, advanced.nextQuestionId);
          if (isHostApiError(started)) {
            setError(translateHostError(started.error));
          }
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "אירעה שגיאה. נסו שוב.");
    } finally {
      setBusy(false);
      await refetch();
    }
  }, [busy, pin, primary, question, refetch, state]);

  const handlePause = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await pauseHostSession(pin);
      if (isHostApiError(response)) {
        setError(translateHostError(response.error));
      }
    } finally {
      setBusy(false);
      await refetch();
    }
  }, [busy, pin, refetch]);

  const handleResume = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await resumeHostSession(pin);
      if (isHostApiError(response)) {
        setError(translateHostError(response.error));
      }
    } finally {
      setBusy(false);
      await refetch();
    }
  }, [busy, pin, refetch]);

  const handleEnd = useCallback(async () => {
    if (busy) return;
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        "לסיים את החידון? כל התחנות הפתוחות יינעלו ותוצאות תיגלנה למשתתפים.",
      );
      if (!confirmed) return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await endHostSession(pin);
      if (isHostApiError(response)) {
        setError(translateHostError(response.error));
      }
    } finally {
      setBusy(false);
      await refetch();
    }
  }, [busy, pin, refetch]);

  if (!state) {
    if (loadStatus === "error") {
      return (
        <main
          dir="rtl"
          className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bsy-paper px-4 text-center"
        >
          <p
            role="alert"
            className="text-[11px] font-bold uppercase tracking-[0.16em] text-bsy-forest"
          >
            שגיאה בטעינה
          </p>
          <h2 className="m-0 font-[var(--font-display)] text-[24px] text-bsy-brown">
            לא ניתן לטעון את לוח המדריך
          </h2>
          {loadError ? (
            <p className="max-w-xs text-[13px] text-bsy-stone-700">{loadError}</p>
          ) : null}
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 rounded-full bg-bsy-forest px-5 py-2 text-[14px] font-bold text-bsy-paper transition-opacity hover:opacity-90"
          >
            נסה שוב
          </button>
        </main>
      );
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-bsy-paper">
        <p className="text-sm text-bsy-stone-700">טוען לוח מדריך…</p>
      </main>
    );
  }

  const headerProps = {
    brand,
    customLogo,
    customLogoLabel,
    pin,
    sessionStatus,
    responseCount: state.responseCount,
    totalPlayers: state.totalPlayers,
    questionOrdinal: question?.ordinal ?? null,
    totalQuestions: state.totalQuestions,
  };

  const canControl = state.canControl;
  const showRevealedHighlight = question?.status === "revealed";
  const correctIds = showRevealedHighlight ? (state.reveal?.correctIds ?? []) : null;
  const isMapQuestion = question?.type === "map";
  const hasOptions = !isMapQuestion && Array.isArray(question?.options);
  const participantPins = state.mapAnswers ?? null;

  const banner = lifecycleBanner({
    sessionStatus,
    questionStatus,
    remainingSeconds: countdown.remainingSeconds,
  });

  return (
    <main className="flex min-h-screen flex-col bg-bsy-paper">
      <HostHeader {...headerProps} />

      {banner ? (
        <p
          dir="rtl"
          role="status"
          data-testid="host-lifecycle-banner"
          className={[
            "mx-4 mt-3 rounded-md border px-4 py-2 text-[13px] md:mx-6",
            banner.tone,
          ].join(" ")}
        >
          {banner.message}
        </p>
      ) : null}

      {/* Desktop projector layout */}
      <div className="hidden flex-1 flex-col px-6 pb-6 pt-4 md:flex">
        {question && sessionStatus !== "ended" ? (
          <div className="grid flex-1 grid-cols-[minmax(0,1fr)_320px] gap-4">
            <div className="flex min-h-0 flex-col gap-4">
              <HostQuestionCard
                type={question.type}
                prompt={question.prompt}
                ordinal={question.ordinal}
                totalQuestions={state.totalQuestions}
                imageUrl={question.imageUrl}
              />
              {hasOptions ? (
                <HostAnswerBars
                  options={question.options ?? []}
                  counts={state.answerCounts}
                  correctIds={correctIds}
                  variant="desktop"
                />
              ) : null}
              {isMapQuestion ? (
                <HostMapSummary
                  geo={question.map?.geo ?? null}
                  geoTarget={state.reveal?.mapGeoTarget ?? null}
                  isRevealed={showRevealedHighlight}
                  participantPins={participantPins}
                />
              ) : null}
              {showRevealedHighlight && state.reveal?.explanation ? (
                <ExplanationCard explanation={state.reveal.explanation} />
              ) : null}
            </div>
            <aside className="flex min-h-0 flex-col gap-4">
              {canControl ? (
                <HostTimerPanel
                  remainingSeconds={countdown.remainingSeconds}
                  fraction={countdown.fraction}
                  isWarning={countdown.isWarning}
                  responseCount={state.responseCount}
                  totalPlayers={state.totalPlayers}
                />
              ) : null}
              <div className="flex min-h-0 flex-1">
                <HostPlayerList
                  players={state.players}
                  hideAnsweredDot={!question}
                />
              </div>
              {!canControl && state.participantProgress ? (
                <HostAsyncProgressList
                  progress={state.participantProgress}
                  totalQuestions={state.totalQuestions}
                />
              ) : null}
            </aside>
          </div>
        ) : (
          <DesktopIdleState
            sessionStatus={sessionStatus}
            nextOrdinal={state.nextQuestion?.ordinal ?? null}
            totalQuestions={state.totalQuestions}
            players={state.players}
          />
        )}

        {error ? <ErrorBanner message={error} /> : null}
        <footer className="mt-4 rounded-md border border-bsy-stone-100 bg-white px-5 py-4">
          <HostControlBar
            primary={primary}
            sessionStatus={sessionStatus}
            onPrimary={handlePrimary}
            onPause={handlePause}
            onResume={handleResume}
            onEnd={handleEnd}
            busy={busy}
            canControl={canControl}
            variant="wide"
          />
        </footer>
      </div>

      {/* Mobile field layout */}
      <div className="flex flex-1 flex-col md:hidden">
        <nav className="flex items-center gap-2 border-b border-bsy-stone-100 bg-bsy-paper-warm px-3 py-2">
          <TabButton
            active={mobileTab === "live"}
            onClick={() => setMobileTab("live")}
          >
            החידון
          </TabButton>
          <TabButton
            active={mobileTab === "players"}
            onClick={() => setMobileTab("players")}
          >
            <span className="flex items-baseline gap-1">
              משתתפים
              <span className="rounded-full bg-bsy-stone-100 px-1.5 text-[10px] font-mono text-bsy-stone-700">
                {state.totalPlayers}
              </span>
            </span>
          </TabButton>
        </nav>

        {mobileTab === "live" ? (
          <section className="flex flex-1 flex-col gap-3 px-3 py-3">
            {question && sessionStatus !== "ended" ? (
              <>
                <HostQuestionCard
                  type={question.type}
                  prompt={question.prompt}
                  ordinal={question.ordinal}
                  totalQuestions={state.totalQuestions}
                  imageUrl={question.imageUrl}
                />
                {canControl ? (
                  <HostTimerPanel
                    variant="compact"
                    remainingSeconds={countdown.remainingSeconds}
                    fraction={countdown.fraction}
                    isWarning={countdown.isWarning}
                  />
                ) : null}
                {hasOptions ? (
                  <HostAnswerBars
                    options={question.options ?? []}
                    counts={state.answerCounts}
                    correctIds={correctIds}
                    variant="mobile"
                  />
                ) : null}
                {isMapQuestion ? (
                  <HostMapSummary
                    geo={question.map?.geo ?? null}
                    geoTarget={state.reveal?.mapGeoTarget ?? null}
                    isRevealed={showRevealedHighlight}
                    participantPins={participantPins}
                  />
                ) : null}
                {showRevealedHighlight && state.reveal?.explanation ? (
                  <ExplanationCard explanation={state.reveal.explanation} />
                ) : null}
              </>
            ) : (
              <MobileIdleState
                sessionStatus={sessionStatus}
                nextOrdinal={state.nextQuestion?.ordinal ?? null}
                totalQuestions={state.totalQuestions}
                players={state.players}
              />
            )}
            {error ? <ErrorBanner message={error} /> : null}
          </section>
        ) : (
          <section className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-3">
            <PlayersSummary
              answered={state.responseCount}
              waiting={Math.max(0, state.totalPlayers - state.responseCount)}
              hasQuestion={Boolean(question)}
              questionOrdinal={question?.ordinal ?? null}
            />
            <div className="min-h-0 flex-1">
              <HostPlayerList
                players={state.players}
                hideAnsweredDot={!question}
              />
            </div>
            {!canControl && state.participantProgress ? (
              <HostAsyncProgressList
                progress={state.participantProgress}
                totalQuestions={state.totalQuestions}
              />
            ) : null}
          </section>
        )}

        <footer className="sticky bottom-0 border-t border-bsy-stone-100 bg-bsy-paper/95 px-3 py-3">
          <HostControlBar
            primary={primary}
            sessionStatus={sessionStatus}
            onPrimary={handlePrimary}
            onPause={handlePause}
            onResume={handleResume}
            onEnd={handleEnd}
            busy={busy}
            canControl={canControl}
            variant="compact"
          />
        </footer>
      </div>
    </main>
  );
}

function ExplanationCard({ explanation }: { explanation: string }) {
  return (
    <div className="rounded-md border border-bsy-stone-100 bg-bsy-paper-warm p-4">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-bsy-forest">
        הסבר
      </p>
      <p className="m-0 text-[14px] text-bsy-ink">{explanation}</p>
    </div>
  );
}

interface DesktopIdleStateProps {
  sessionStatus: "draft" | "scheduled" | "live" | "paused" | "ended";
  nextOrdinal: number | null;
  totalQuestions: number;
  players: HostPlayer[];
}

function DesktopIdleState({
  sessionStatus,
  nextOrdinal,
  totalQuestions,
  players,
}: DesktopIdleStateProps) {
  if (sessionStatus === "ended") {
    return (
      <div className="grid flex-1 grid-cols-[minmax(0,1fr)_320px] gap-4">
        <HostEndedSummary
          totalQuestions={totalQuestions}
          players={players}
          variant="desktop"
        />
        <aside className="flex min-h-0 flex-col">
          <HostPlayerList players={players} hideAnsweredDot />
        </aside>
      </div>
    );
  }

  return (
    <div className="grid flex-1 grid-cols-[minmax(0,1fr)_320px] gap-4">
      <div className="flex flex-col items-center justify-center rounded-md border border-bsy-stone-100 bg-white p-12 text-center">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-bsy-forest">
          {idleEyebrow(sessionStatus)}
        </p>
        <h2 className="m-0 font-[var(--font-display)] text-[34px] text-bsy-brown">
          {idleHeadline(sessionStatus, nextOrdinal, totalQuestions)}
        </h2>
        <p className="mt-3 max-w-md text-[14px] text-bsy-stone-700">
          {idleBody(sessionStatus)}
        </p>
      </div>
      <aside className="flex min-h-0 flex-col">
        <HostPlayerList players={players} hideAnsweredDot />
      </aside>
    </div>
  );
}

interface MobileIdleStateProps {
  sessionStatus: "draft" | "scheduled" | "live" | "paused" | "ended";
  nextOrdinal: number | null;
  totalQuestions: number;
  players?: HostPlayer[];
}

function MobileIdleState({
  sessionStatus,
  nextOrdinal,
  totalQuestions,
  players,
}: MobileIdleStateProps) {
  if (sessionStatus === "ended") {
    return (
      <HostEndedSummary
        totalQuestions={totalQuestions}
        players={players ?? []}
        variant="mobile"
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-bsy-stone-100 bg-white px-4 py-8 text-center">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-bsy-forest">
        {idleEyebrow(sessionStatus)}
      </p>
      <h2 className="m-0 font-[var(--font-display)] text-[24px] text-bsy-brown">
        {idleHeadline(sessionStatus, nextOrdinal, totalQuestions)}
      </h2>
      <p className="m-0 max-w-xs text-[13px] text-bsy-stone-700">
        {idleBody(sessionStatus)}
      </p>
    </div>
  );
}

interface HostEndedSummaryProps {
  totalQuestions: number;
  players: HostPlayer[];
  variant: "desktop" | "mobile";
}

function HostEndedSummary({
  totalQuestions,
  players,
  variant,
}: HostEndedSummaryProps) {
  const top = players.slice(0, 3);
  const playerCount = players.length;
  const answered = players.filter((p) => p.score > 0).length;

  return (
    <div
      className={[
        "flex flex-col rounded-md border border-bsy-stone-100 bg-white text-right",
        variant === "desktop" ? "p-8" : "p-5",
      ].join(" ")}
      dir="rtl"
    >
      <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-bsy-forest">
        סיכום החידון
      </p>
      <h2
        className={[
          "m-0 font-[var(--font-display)] text-bsy-brown",
          variant === "desktop" ? "text-[30px]" : "text-[22px]",
        ].join(" ")}
      >
        החידון הסתיים — תודה רבה!
      </h2>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="שחקנים" value={playerCount.toLocaleString("he-IL")} />
        <Stat
          label="ענו לפחות פעם"
          value={answered.toLocaleString("he-IL")}
        />
        <Stat label="תחנות" value={totalQuestions.toLocaleString("he-IL")} />
      </dl>

      {top.length > 0 ? (
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-bsy-stone-400">
            המובילים
          </p>
          <ol className="m-0 flex flex-col gap-1.5 pr-0">
            {top.map((player, index) => (
              <li
                key={player.id}
                className="flex items-center justify-between gap-3 rounded-md bg-bsy-paper-warm px-3 py-2 text-[13px]"
              >
                <span className="font-bold text-bsy-stone-700">
                  {index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"} {player.displayName}
                </span>
                <span className="font-mono font-bold text-bsy-forest">
                  {player.score.toLocaleString("he-IL")}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="mt-5 text-[13px] text-bsy-stone-400">
          אף שחקן לא צבר נקודות בסשן זה.
        </p>
      )}

      <p className="mt-5 text-[12px] text-bsy-stone-700">
        לתצוגת תוצאות מפורטת לכל המשתתפים — דף ניהול ׳תוצאות׳ של הסשן.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-bsy-stone-100 bg-bsy-paper-warm px-2 py-3 text-center">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-bsy-stone-400">
        {label}
      </dt>
      <dd className="m-0 mt-0.5 font-[var(--font-display)] text-[20px] text-bsy-brown">
        {value}
      </dd>
    </div>
  );
}

function idleEyebrow(status: string): string {
  if (status === "scheduled" || status === "draft") return "לפני התחלה";
  if (status === "ended") return "החידון הסתיים";
  if (status === "paused") return "מושהה";
  return "מוכנים לתחנה הבאה";
}

function idleHeadline(
  status: string,
  nextOrdinal: number | null,
  totalQuestions: number,
): string {
  if (status === "ended") return "תודה רבה!";
  if (status === "scheduled" || status === "draft") {
    return totalQuestions > 0 ? "מוכנים להפעיל את החידון" : "החידון עדיין ריק";
  }
  if (nextOrdinal) return `תחנה ${nextOrdinal}`;
  return "מוכנים להמשיך";
}

function idleBody(status: string): string {
  if (status === "ended") return "תוצאות החידון הוצגו לכל המשתתפים.";
  if (status === "scheduled" || status === "draft") {
    return "לחיצה על ׳הפעלת חידון׳ תפתח את ההצטרפות ותעביר את הסטטוס ל׳פעיל׳.";
  }
  if (status === "paused") {
    return "החידון מושהה כרגע. לחצו ׳המשך׳ כדי לחזור ולפתוח את התחנה הבאה.";
  }
  return "לחצו ׳התחלת תחנה׳ כדי להתחיל את התחנה הבאה.";
}

interface PlayersSummaryProps {
  answered: number;
  waiting: number;
  hasQuestion: boolean;
  questionOrdinal: number | null;
}

function PlayersSummary({
  answered,
  waiting,
  hasQuestion,
  questionOrdinal,
}: PlayersSummaryProps) {
  return (
    <dl className="grid grid-cols-2 gap-2 rounded-md border border-bsy-stone-100 bg-white px-3 py-2 text-center">
      <div>
        <dt className="text-[11px] uppercase tracking-wide text-bsy-stone-400">
          {hasQuestion ? `ענו על תחנה ${questionOrdinal ?? ""}` : "מחוברים"}
        </dt>
        <dd className="m-0 font-[var(--font-display)] text-2xl text-bsy-brown">
          {answered}
        </dd>
      </div>
      <div>
        <dt className="text-[11px] uppercase tracking-wide text-bsy-stone-400">
          {hasQuestion ? "עדיין חושבים" : "ממתינים"}
        </dt>
        <dd className="m-0 font-[var(--font-display)] text-2xl text-bsy-brown">
          {waiting}
        </dd>
      </div>
    </dl>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mt-3 rounded-md border border-bsy-error/30 bg-bsy-error/10 px-3 py-2 text-[13px] text-bsy-error"
    >
      {message}
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex-1 rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors",
        active
          ? "bg-bsy-forest text-bsy-paper"
          : "bg-white text-bsy-stone-700 border border-bsy-stone-100",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

interface LifecycleBannerArgs {
  sessionStatus: "draft" | "scheduled" | "live" | "paused" | "ended";
  questionStatus: QuestionStatusEnum | null;
  remainingSeconds: number;
}

interface LifecycleBanner {
  message: string;
  tone: string;
}

/**
 * One-sentence Hebrew status banner for the host live screen — subtask D §3.
 * The control bar already shows the next action; this banner gives the host
 * an at-a-glance read of the current lifecycle state and (when a question is
 * open) the seconds remaining.
 */
function lifecycleBanner({
  sessionStatus,
  questionStatus,
  remainingSeconds,
}: LifecycleBannerArgs): LifecycleBanner | null {
  if (sessionStatus === "scheduled" || sessionStatus === "draft") {
    return {
      message:
        "החידון מתוכנן. עדיין ניתן לקבל משתתפים. לחצו ׳התחל׳ כשתהיו מוכנים.",
      tone: "border-bsy-stone-100 bg-bsy-paper-warm text-bsy-stone-700",
    };
  }
  if (sessionStatus === "paused") {
    return {
      message: "החידון מושהה. לחצו ׳המשך׳ להמשיך.",
      tone: "border-bsy-warn/40 bg-bsy-warn/10 text-bsy-warn",
    };
  }
  if (sessionStatus === "ended") {
    return {
      message: "החידון הסתיים.",
      tone: "border-bsy-stone-100 bg-bsy-stone-50 text-bsy-stone-700",
    };
  }
  if (sessionStatus === "live") {
    if (questionStatus === "answering") {
      const safe = Math.max(0, Math.round(remainingSeconds));
      return {
        message: `השאלה הנוכחית פעילה. ${safe} שניות נותרו.`,
        tone: "border-bsy-lime/40 bg-bsy-lime/15 text-bsy-forest",
      };
    }
    return {
      message: "החידון פעיל. ממתינים לשאלה הבאה.",
      tone: "border-bsy-lime/40 bg-bsy-lime/15 text-bsy-forest",
    };
  }
  return null;
}

function translateHostError(code: string): string {
  switch (code) {
    case "INVALID_TRANSITION":
      return "המעבר אינו אפשרי במצב הנוכחי.";
    case "QUESTIONS_REQUIRED":
      return "לא הוגדרו שאלות לחידון.";
    case "QUESTION_NOT_FOUND":
      return "התחנה לא נמצאה.";
    case "SESSION_NOT_LIVE":
      return "החידון אינו פעיל. הפעילו אותו כדי להמשיך.";
    case "QUESTION_NOT_REVEALED":
      return "יש לחשוף את התשובה לפני המעבר לתחנה הבאה.";
    case "ASYNC_NOT_REVEALABLE":
      return "במצב חופשי החידון נחשף אוטומטית.";
    case "ASYNC_NOT_PAUSABLE":
      return "במצב חופשי לא ניתן להשהות את החידון.";
    case "FORBIDDEN":
      return "אין לכם הרשאה לפעולה הזו על החידון.";
    case "UNAUTHORIZED":
      return "החיבור פג. התחברו מחדש כמדריכים.";
    case "WRITE_FAILED":
      return "השמירה נכשלה. נסו שוב.";
    case "SESSION_NOT_FOUND":
      return "החידון לא נמצא.";
    default:
      return "אירעה שגיאה. נסו שוב.";
  }
}
