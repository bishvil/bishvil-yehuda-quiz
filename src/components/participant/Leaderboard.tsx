import { avatarInitial } from "@/src/lib/participant/identity";

export interface LeaderboardEntry {
  participantId: string;
  displayName: string;
  score: number;
  isMe?: boolean;
}

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  title?: string;
}

/**
 * Ranked list of display-safe names + scores. The "me" row is highlighted
 * with the lime wash. PII (full name, phone) never reaches this component.
 */
export function Leaderboard({ entries, title = "לוח תוצאות" }: LeaderboardProps) {
  return (
    <section className="rounded-md border border-bsy-stone-100 bg-white px-3">
      <h3 className="my-3 mb-2 text-start font-[var(--font-display)] text-lg text-bsy-brown">
        {title}
      </h3>
      <ol className="m-0 flex list-none flex-col p-0">
        {entries.map((entry, index) => {
          const rank = index + 1;
          const isMe = entry.isMe === true;
          return (
            <li
              key={entry.participantId}
              className={[
                "flex items-center gap-2.5",
                isMe
                  ? "-mx-2 my-1 rounded-sm border-0 bg-bsy-lime/15 px-2 py-2.5"
                  : "border-b border-dashed border-bsy-stone-100 py-2.5 last:border-b-0",
              ].join(" ")}
            >
              <span
                className={[
                  "w-6 shrink-0 text-center font-[var(--font-display)] text-lg",
                  rank <= 3 ? "text-bsy-brown" : "text-bsy-stone-400",
                ].join(" ")}
              >
                {rank}
              </span>
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bsy-lime font-[var(--font-display)] text-sm text-bsy-forest-deep">
                {avatarInitial(entry.displayName)}
              </span>
              <span className="flex-1 text-start text-sm text-bsy-ink">
                {entry.displayName}
                {isMe ? <span className="ms-1 text-bsy-stone-700">(אתם)</span> : null}
              </span>
              <span className="font-[var(--font-display)] text-[17px] text-bsy-brown">
                {entry.score.toLocaleString("he-IL")}
              </span>
            </li>
          );
        })}
        {entries.length === 0 ? (
          <li className="border-b-0 py-4 text-center text-sm text-bsy-stone-400">
            לא נרשמו עדיין תוצאות
          </li>
        ) : null}
      </ol>
    </section>
  );
}
