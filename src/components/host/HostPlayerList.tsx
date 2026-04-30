import { avatarInitial } from "@/src/lib/participant/identity";

export interface HostPlayer {
  id: string;
  displayName: string;
  score: number;
  answered: boolean;
}

interface HostPlayerListProps {
  players: HostPlayer[];
  title?: string;
  /** Hides the answered/waiting dot (e.g. before any question is live). */
  hideAnsweredDot?: boolean;
  emptyLabel?: string;
}

/**
 * Roster panel for the host — one row per participant. Score column uses the
 * display font; answered status is a small dot (lime = answered, amber =
 * still thinking). Names are display-safe (`first_name + last_initial.`)
 * so this is safe to project.
 */
export function HostPlayerList({
  players,
  title = "משתתפים",
  hideAnsweredDot = false,
  emptyLabel = "אין משתתפים מחוברים עדיין.",
}: HostPlayerListProps) {
  return (
    <section className="flex h-full min-h-0 flex-col rounded-md border border-bsy-stone-100 bg-white">
      <header className="flex items-center justify-between border-b border-bsy-stone-100 px-3 py-2">
        <h3 className="m-0 font-[var(--font-display)] text-base text-bsy-brown">
          {title}
        </h3>
        <span className="text-[12px] text-bsy-stone-400">{players.length}</span>
      </header>
      <ol className="m-0 flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
        {players.length === 0 ? (
          <li className="flex h-full min-h-[80px] items-center justify-center px-3 py-4 text-center text-[13px] text-bsy-stone-400">
            {emptyLabel}
          </li>
        ) : (
          players.map((player) => (
            <li
              key={player.id}
              className="flex items-center gap-2 border-b border-dashed border-bsy-stone-100 px-3 py-2 last:border-b-0"
            >
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bsy-lime font-[var(--font-display)] text-[13px] text-bsy-forest-deep">
                {avatarInitial(player.displayName)}
              </span>
              <span className="flex-1 truncate text-start text-sm text-bsy-ink">
                {player.displayName}
              </span>
              <span className="font-[var(--font-display)] text-[15px] text-bsy-brown">
                {player.score.toLocaleString("he-IL")}
              </span>
              {hideAnsweredDot ? null : (
                <span
                  aria-label={player.answered ? "ענה" : "ממתין"}
                  className={[
                    "h-2 w-2 shrink-0 rounded-full",
                    player.answered ? "bg-bsy-forest" : "bg-bsy-warn/70",
                  ].join(" ")}
                />
              )}
            </li>
          ))
        )}
      </ol>
    </section>
  );
}
