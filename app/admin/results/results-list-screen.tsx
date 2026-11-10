"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AdminTopBar } from "@/src/components/admin/AdminTopBar";
import {
  AdminCard,
  CardActions,
  CardEyebrow,
  CardTitle,
  PrimaryAction,
} from "@/src/components/admin/cards";
import {
  isAdminApiError,
  listAdminParticipantAnalytics,
  type AdminParticipantAnalyticsRow,
} from "@/src/lib/admin/api-client";

import type { ResultsListRow } from "@/app/api/admin/results/route";

type Top = ResultsListRow["topThree"][number];
interface ResultsPage {
  sessions: ResultsListRow[];
  nextOffset: number | null;
}

const resultsActionClass =
  "min-h-11 rounded-full border border-bsy-stone-200 bg-white px-5 py-2 text-[13px] font-bold text-bsy-forest transition-colors hover:bg-bsy-stone-50 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bsy-forest";

function appendUniqueSessions(
  current: ResultsListRow[],
  incoming: ResultsListRow[],
) {
  return Array.from(
    new Map(
      [...current, ...incoming].map((session) => [session.id, session]),
    ).values(),
  );
}

const RANK_TONE: Array<{ dot: string; ring: string; label: string }> = [
  {
    dot: "bg-bsy-lime",
    ring: "ring-bsy-lime/40",
    label: "text-bsy-forest-deep",
  },
  {
    dot: "bg-bsy-stone-400",
    ring: "ring-bsy-stone-200",
    label: "text-bsy-stone-700",
  },
  {
    dot: "bg-bsy-stone-200",
    ring: "ring-bsy-stone-100",
    label: "text-bsy-stone-700",
  },
];

export function ResultsListScreen() {
  const [sessions, setSessions] = useState<ResultsListRow[]>([]);
  const [participants, setParticipants] = useState<
    AdminParticipantAnalyticsRow[]
  >([]);
  const [activeView, setActiveView] = useState<"sessions" | "participants">(
    "sessions",
  );
  const [participantStatus, setParticipantStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [participantError, setParticipantError] = useState<string | null>(null);
  const [participantSearch, setParticipantSearch] = useState("");
  const [initialAttempt, setInitialAttempt] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const loadMorePending = useRef(false);
  const mounted = useRef(true);

  async function loadMore() {
    if (nextOffset === null || loadMorePending.current) return;
    loadMorePending.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const response = await fetch(`/api/admin/results?offset=${nextOffset}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("read failed");
      const body = (await response.json()) as ResultsPage;
      if (!mounted.current) return;
      setSessions((current) => appendUniqueSessions(current, body.sessions));
      setNextOffset(body.nextOffset ?? null);
    } catch {
      if (mounted.current)
        setLoadMoreError(
          "לא הצלחנו לטעון משחקים נוספים. התוצאות שכבר נטענו נשמרו. נסו שוב.",
        );
    } finally {
      loadMorePending.current = false;
      if (mounted.current) setLoadingMore(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/results", { cache: "no-store" });
        if (!res.ok) throw new Error("read failed");
        const body = (await res.json()) as ResultsPage;
        if (cancelled) return;
        setSessions(appendUniqueSessions([], body.sessions));
        setNextOffset(body.nextOffset ?? null);
        setStatus("ready");
      } catch {
        if (cancelled) return;
        setError("לא הצלחנו לקרוא את התוצאות. נסו שוב.");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialAttempt]);

  useEffect(() => {
    if (activeView !== "participants" || participantStatus !== "loading")
      return;

    let cancelled = false;
    void (async () => {
      try {
        const body = await listAdminParticipantAnalytics();
        if (cancelled) return;
        if (isAdminApiError(body)) throw new Error("read failed");
        setParticipants(body.participants);
        setParticipantStatus("ready");
      } catch {
        if (cancelled) return;
        setParticipantError(
          "לא הצלחנו לקרוא את נתוני המשתתפים. נסו לרענן את העמוד.",
        );
        setParticipantStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeView, participantStatus]);

  return (
    <main dir="rtl" className="min-h-screen bg-bsy-paper">
      <AdminTopBar crumbs={[{ label: "תוצאות וניתוח" }]} />

      <section className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-full border border-bsy-stone-100 bg-white p-1">
            <ViewButton
              active={activeView === "sessions"}
              onClick={() => setActiveView("sessions")}
            >
              משחקים
            </ViewButton>
            <ViewButton
              active={activeView === "participants"}
              onClick={() => {
                setActiveView("participants");
                if (participantStatus === "idle") {
                  setParticipantStatus("loading");
                }
              }}
            >
              משתתפים
            </ViewButton>
          </div>
        </div>

        {activeView === "sessions" ? (
          status === "loading" ? (
            <p className="text-[13px] text-bsy-stone-700">טוען…</p>
          ) : status === "error" ? (
            <div
              role="alert"
              className="rounded-xl border border-bsy-stone-100 bg-white p-5"
            >
              <p className="text-[13px] text-bsy-error">
                שגיאה בטעינת התוצאות: {error}
              </p>
              <button
                type="button"
                className={`${resultsActionClass} mt-3`}
                onClick={() => {
                  setStatus("loading");
                  setError(null);
                  setInitialAttempt((attempt) => attempt + 1);
                }}
              >
                ניסיון נוסף
              </button>
            </div>
          ) : sessions.length === 0 ? (
            <div className="rounded-[12px] border border-bsy-stone-100 bg-[color:var(--bsy-paper-card)] p-8 text-center">
              <p className="m-0 text-[14px] text-bsy-stone-700">
                עדיין אין תוצאות משחקים להצגה.
              </p>
            </div>
          ) : (
            <>
              <ul
                className="grid grid-cols-1 gap-4 lg:grid-cols-2"
                aria-label="תוצאות משחקים"
              >
                {sessions.map((s) => (
                  <li key={s.id}>
                    <ResultsCard row={s} />
                  </li>
                ))}
              </ul>
              <p role="status" className="sr-only">
                {sessions.length} משחקים נטענו
              </p>
              {nextOffset !== null ? (
                <div className="mt-6 flex flex-col items-center gap-3">
                  {loadMoreError ? (
                    <p role="alert" className="text-[13px] text-bsy-error">
                      {loadMoreError}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className={resultsActionClass}
                    disabled={loadingMore}
                    aria-busy={loadingMore}
                    onClick={() => void loadMore()}
                  >
                    {loadingMore
                      ? "טוען משחקים נוספים…"
                      : loadMoreError
                        ? "ניסיון נוסף לטעינת משחקים נוספים"
                        : "טעינת משחקים נוספים"}
                  </button>
                </div>
              ) : null}
            </>
          )
        ) : (
          <ParticipantsAnalytics
            participants={participants}
            status={participantStatus}
            error={participantError}
            search={participantSearch}
            onSearch={setParticipantSearch}
          />
        )}
      </section>
    </main>
  );
}

function ViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "min-h-11 rounded-full px-4 py-2 text-[13px] font-bold",
        active
          ? "bg-bsy-forest text-white"
          : "text-bsy-stone-700 hover:bg-bsy-stone-50",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function ParticipantsAnalytics({
  participants,
  status,
  error,
  search,
  onSearch,
}: {
  participants: AdminParticipantAnalyticsRow[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  search: string;
  onSearch: (value: string) => void;
}) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q
      ? participants.filter((p) =>
          [
            p.displayName,
            p.latestFirstName,
            p.latestLastName,
            p.latestPhone,
            p.latestEmail,
            ...p.namesSeen,
            ...p.participations.flatMap((participation) => [
              participation.quizTitle,
              participation.pin,
            ]),
            ...Object.values(p.profileFields).map((value) => value ?? ""),
          ]
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : participants;

    return [...rows].sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.accuracyPct !== a.accuracyPct) return b.accuracyPct - a.accuracyPct;
      return a.displayName.localeCompare(b.displayName, "he");
    });
  }, [participants, search]);

  const averageScore =
    filtered.length === 0
      ? 0
      : Math.round(
          filtered.reduce((sum, row) => sum + row.averageScore, 0) /
            filtered.length,
        );
  const averageAccuracy =
    filtered.length === 0
      ? 0
      : Math.round(
          filtered.reduce((sum, row) => sum + row.accuracyPct, 0) /
            filtered.length,
        );

  if (status === "idle" || status === "loading") {
    return <p className="text-[13px] text-bsy-stone-700">טוען משתתפים…</p>;
  }

  if (status === "error") {
    return (
      <p className="text-[13px] text-red-700">שגיאה בטעינת המשתתפים: {error}</p>
    );
  }

  if (participants.length === 0) {
    return (
      <div className="rounded-[12px] border border-bsy-stone-100 bg-[color:var(--bsy-paper-card)] p-8 text-center">
        <p className="m-0 text-[14px] text-bsy-stone-700">
          עדיין אין משתתפים להצגה.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="משתמשים" value={filtered.length} />
        <Metric
          label="השתתפויות"
          value={filtered.reduce((sum, row) => sum + row.participationCount, 0)}
        />
        <Metric label="ממוצע למשתמש" value={averageScore} />
        <Metric label="דיוק ממוצע" value={`${averageAccuracy}%`} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="חיפוש לפי שם, אימייל, טלפון, יחידה, צוות, חידון או קוד"
          className="w-full min-w-0 flex-1 rounded-md border border-bsy-stone-100 bg-white px-3 py-2 text-[14px] outline-none focus:border-bsy-forest"
        />
        <button
          type="button"
          onClick={() => exportParticipantsCsv(filtered)}
          className="w-full rounded-md bg-bsy-forest px-3 py-2 text-[13px] font-bold text-white sm:w-auto"
        >
          ייצוא CSV
        </button>
      </div>

      <ul className="grid gap-3 md:hidden">
        {filtered.map((row) => (
          <li
            key={`${row.identityProvider}:${row.identityKey}:mobile`}
            className="rounded-md border border-bsy-stone-100 bg-white p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-bold text-bsy-ink">
                  {row.displayName}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-bsy-stone-700">
                  {row.namesSeen.length > 1
                    ? row.namesSeen.join(", ")
                    : (row.latestEmail ?? row.latestPhone)}
                </div>
              </div>
              <div className="shrink-0 text-left">
                <div
                  className="font-[var(--font-display)] text-[22px] leading-none text-bsy-brown"
                  dir="ltr"
                >
                  {row.totalScore}
                </div>
                <div className="mt-1 text-[11px] text-bsy-stone-400">ניקוד</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
              <MobileField label="אימייל" value={row.latestEmail} ltr />
              <MobileField label="טלפון" value={row.latestPhone} ltr />
              <MobileField
                label="משחקים"
                value={String(row.participationCount)}
                ltr
              />
              <MobileField
                label="יחידה"
                value={row.profileFields.unit ?? row.profileFields["יחידה"]}
              />
              <MobileField
                label="צוות"
                value={row.profileFields.team ?? row.profileFields["צוות"]}
              />
              <MobileField label="דיוק" value={`${row.accuracyPct}%`} ltr />
              <MobileField label="תשובות" value={String(row.answerCount)} ltr />
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-md border border-bsy-stone-100 bg-white md:block">
        <table className="min-w-full border-collapse text-right text-[13px]">
          <thead className="bg-bsy-stone-50 text-[11px] uppercase tracking-[0.14em] text-bsy-stone-700">
            <tr>
              <th className="px-3 py-2">שם</th>
              <th className="px-3 py-2">אימייל</th>
              <th className="px-3 py-2">טלפון</th>
              <th className="px-3 py-2">שמות שנראו</th>
              <th className="px-3 py-2">יחידה</th>
              <th className="px-3 py-2">צוות</th>
              <th className="px-3 py-2">משחקים</th>
              <th className="px-3 py-2">נראה לאחרונה</th>
              <th className="px-3 py-2">ניקוד</th>
              <th className="px-3 py-2">דיוק</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={`${row.identityProvider}:${row.identityKey}`}
                className="border-t border-bsy-stone-100"
              >
                <td className="px-3 py-2 font-bold text-bsy-ink">
                  {row.displayName}
                </td>
                <td className="px-3 py-2" dir="ltr">
                  {row.latestEmail ?? "—"}
                </td>
                <td className="px-3 py-2" dir="ltr">
                  {row.latestPhone}
                </td>
                <td className="max-w-[220px] truncate px-3 py-2">
                  {row.namesSeen.join(", ")}
                </td>
                <td className="px-3 py-2">
                  {row.profileFields.unit ?? row.profileFields["יחידה"] ?? "—"}
                </td>
                <td className="px-3 py-2">
                  {row.profileFields.team ?? row.profileFields["צוות"] ?? "—"}
                </td>
                <td className="px-3 py-2 font-mono" dir="ltr">
                  {row.participationCount}
                </td>
                <td className="px-3 py-2" dir="ltr">
                  {formatShortDateTime(row.lastSeenAt)}
                </td>
                <td className="px-3 py-2 font-mono" dir="ltr">
                  {row.totalScore}
                </td>
                <td className="px-3 py-2 font-mono" dir="ltr">
                  {row.accuracyPct}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResultsCard({ row }: { row: ResultsListRow }) {
  const timestamp = row.endedAt ?? row.startedAt ?? row.createdAt;
  const date = timestamp ? new Date(timestamp) : null;
  const validDate = date && !Number.isNaN(date.getTime()) ? date : null;
  const dateText = validDate
    ? validDate.toLocaleString("he-IL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const finishers = row.topThree;
  const winner = finishers[0] ?? null;
  const runnersUp = finishers.slice(1);
  const hasFinishers = finishers.length > 0;

  return (
    <AdminCard>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <CardEyebrow tone="forest">
            {row.status && row.status !== "ended"
              ? row.gameMode === "async"
                ? "תוצאות ביניים · משחק אסינכרוני"
                : "תוצאות ביניים · משחק פתוח"
              : "תוצאות משחק"}
          </CardEyebrow>
          {dateText && validDate ? (
            <time
              dateTime={validDate.toISOString()}
              className="shrink-0 text-[11px] text-bsy-stone-400"
              dir="ltr"
            >
              {dateText}
            </time>
          ) : null}
        </div>
        <CardTitle size="md" clamp={2}>
          {row.quizTitle}
        </CardTitle>
        <p className="m-0 mt-0.5 text-[12px] text-bsy-stone-400">
          <span>קוד </span>
          <span className="font-bold text-bsy-stone-700" dir="ltr">
            {row.pin}
          </span>
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Metric label="משתתפים" value={row.participantCount} />
        <Metric label="ניקוד ממוצע" value={row.averageScore} />
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <CardEyebrow tone="forest">דירוג</CardEyebrow>
        {!hasFinishers ? (
          <p className="m-0 text-[13px] text-bsy-stone-700">
            עדיין אין תוצאות ניקוד להצגה.
          </p>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
            {winner ? <LeaderRow rank={1} entry={winner} prominent /> : null}
            {runnersUp.map((entry, i) => (
              <LeaderRow key={entry.participantId} rank={i + 2} entry={entry} />
            ))}
          </ol>
        )}
      </div>

      <div className="mt-auto">
        <CardActions
          primary={
            <PrimaryAction
              href={`/admin/quizzes/${row.quizId}/sessions/${row.id}/results`}
            >
              תוצאות מלאות
            </PrimaryAction>
          }
        />
      </div>
    </AdminCard>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-bsy-stone-50 px-3 py-2.5">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-bsy-stone-700">
        {label}
      </span>
      <span
        className="font-[var(--font-display)] text-[24px] leading-none text-bsy-brown"
        dir="ltr"
      >
        {value}
      </span>
    </div>
  );
}

function MobileField({
  label,
  value,
  ltr = false,
}: {
  label: string;
  value: string | null | undefined;
  ltr?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-md bg-bsy-stone-50 px-2.5 py-2">
      <div className="text-[10.5px] font-bold text-bsy-stone-400">{label}</div>
      <div
        className="mt-0.5 truncate text-[12.5px] text-bsy-stone-700"
        dir={ltr ? "ltr" : "rtl"}
      >
        {value && value.length > 0 ? value : "—"}
      </div>
    </div>
  );
}

function LeaderRow({
  rank,
  entry,
  prominent = false,
}: {
  rank: number;
  entry: Top;
  prominent?: boolean;
}) {
  const tone = RANK_TONE[rank - 1] ?? RANK_TONE[2]!;
  const containerCls = prominent
    ? "flex items-center gap-3 rounded-md bg-bsy-lime/10 px-3 py-2.5 ring-1 ring-bsy-lime/30"
    : "flex items-center gap-3 px-3 py-1.5";
  const nameCls = prominent
    ? "min-w-0 flex-1 truncate text-[14px] font-bold text-bsy-ink"
    : "min-w-0 flex-1 truncate text-[13px] text-bsy-stone-700";
  const scoreCls = prominent
    ? "shrink-0 font-[var(--font-display)] text-[22px] leading-none text-bsy-brown"
    : "shrink-0 font-[var(--font-display)] text-[16px] leading-none text-bsy-stone-700";
  return (
    <li className={containerCls}>
      <span
        className={[
          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-1 ring-inset",
          tone.label,
          tone.ring,
          prominent ? "bg-bsy-paper" : "bg-bsy-stone-50",
        ].join(" ")}
        aria-hidden="true"
      >
        <span
          className={["block h-1.5 w-1.5 rounded-full", tone.dot].join(" ")}
        />
      </span>
      <span className="sr-only">מקום {rank}</span>
      <span className={nameCls}>{entry.name}</span>
      <span className={scoreCls} dir="ltr">
        {entry.score}
      </span>
    </li>
  );
}

function exportParticipantsCsv(rows: AdminParticipantAnalyticsRow[]) {
  const profileKeys = Array.from(
    new Set(rows.flatMap((row) => Object.keys(row.profileFields))),
  ).filter((key) => !["firstName", "lastName", "phone", "email"].includes(key));

  const headers = [
    "שם לתצוגה",
    "שמות שנראו",
    "אימייל",
    "טלפון אחרון",
    "ספק זיהוי",
    "השתתפויות",
    "נראה לראשונה",
    "נראה לאחרונה",
    "ניקוד כולל",
    "ניקוד ממוצע",
    "תשובות",
    "תשובות נכונות",
    "דיוק",
    "קודי משחק",
    ...profileKeys.map(profileLabel),
  ];

  const csvRows = rows.map((row) => [
    row.displayName,
    row.namesSeen.join(" | "),
    row.latestEmail ?? "",
    row.latestPhone,
    row.identityProvider,
    String(row.participationCount),
    row.firstSeenAt,
    row.lastSeenAt,
    String(row.totalScore),
    String(row.averageScore),
    String(row.answerCount),
    String(row.correctCount),
    `${row.accuracyPct}%`,
    row.participations.map((participation) => participation.pin).join(" | "),
    ...profileKeys.map((key) => row.profileFields[key] ?? ""),
  ]);

  downloadCsv("participants.csv", [headers, ...csvRows]);
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value: string) {
  const normalized = value.replace(/\r?\n/g, " ");
  return /[",\n]/.test(normalized)
    ? `"${normalized.replace(/"/g, '""')}"`
    : normalized;
}

function profileLabel(key: string) {
  const labels: Record<string, string> = {
    unit: "יחידה",
    team: "צוות",
  };
  return labels[key] ?? key;
}

function formatShortDateTime(value: string) {
  return new Date(value).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
