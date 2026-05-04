import type { HostLiveParticipantProgress } from "@/app/api/host/[pin]/live/route";

interface HostAsyncProgressListProps {
  progress: HostLiveParticipantProgress[];
  totalQuestions: number;
}

/**
 * Read-only async-monitor view — shows which question each participant is
 * currently on (ADR-0007 §2.7). Sourced from `participantProgress` in the
 * host live response (drawn from `participant_question_progress`).
 */
export function HostAsyncProgressList({
  progress,
  totalQuestions,
}: HostAsyncProgressListProps) {
  if (progress.length === 0) {
    return (
      <p className="text-center text-[12px] text-bsy-stone-400">
        אף משתתף עדיין לא התחיל.
      </p>
    );
  }

  return (
    <div
      dir="rtl"
      className="rounded-md border border-bsy-stone-100 bg-white p-3"
    >
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-bsy-stone-400">
        התקדמות משתתפים
      </p>
      <ul className="m-0 flex flex-col gap-1 p-0">
        {progress.map((entry) => {
          const fraction =
            totalQuestions > 0
              ? Math.min(1, entry.questionIndex / totalQuestions)
              : 0;
          const pct = Math.round(fraction * 100);

          return (
            <li
              key={entry.participantId}
              className="flex items-center gap-2 text-[12px]"
            >
              <span className="w-24 shrink-0 truncate font-medium text-bsy-ink">
                {entry.displayName}
              </span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-bsy-stone-100">
                <div
                  aria-hidden="true"
                  className="h-full rounded-full bg-bsy-forest transition-[width]"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-14 shrink-0 text-left font-mono text-[11px] text-bsy-stone-400">
                {entry.questionIndex}/{totalQuestions}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
