type ChipStatus =
  | "draft"
  | "scheduled"
  | "live"
  | "paused"
  | "ended"
  | "archived";

const COPY: Record<ChipStatus, { label: string; tone: string; dot?: string }> = {
  draft: {
    label: "טיוטה",
    tone: "bg-bsy-stone-100 text-bsy-stone-700",
    dot: "bg-bsy-stone-400",
  },
  scheduled: {
    label: "מתוזמן",
    tone: "bg-bsy-stone-100 text-bsy-stone-700",
    dot: "bg-bsy-stone-400",
  },
  live: {
    label: "פעיל",
    tone: "bg-bsy-lime/30 text-bsy-forest-deep",
    dot: "bg-bsy-forest",
  },
  paused: {
    label: "מושהה",
    tone: "bg-[color:var(--bsy-warn)]/15 text-[color:var(--bsy-warn)]",
    dot: "bg-[color:var(--bsy-warn)]",
  },
  ended: {
    label: "הסתיים",
    tone: "bg-bsy-stone-100 text-bsy-stone-700",
    dot: "bg-bsy-stone-400",
  },
  archived: {
    label: "בארכיון",
    tone: "bg-bsy-stone-100 text-bsy-stone-700",
    dot: "bg-bsy-stone-400",
  },
};

export function StatusChip({
  status,
  label,
}: {
  status: ChipStatus;
  label?: string;
}) {
  const { label: defaultLabel, tone, dot } = COPY[status];
  const isLive = status === "live";
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide",
        tone,
      ].join(" ")}
    >
      <span className="relative inline-block h-1.5 w-1.5 rounded-full">
        <span className={["absolute inset-0 rounded-full", dot ?? ""].join(" ")} />
        {isLive ? (
          <span className="absolute inset-0 animate-ping rounded-full bg-bsy-forest/50 motion-reduce:hidden" />
        ) : null}
      </span>
      {label ?? defaultLabel}
    </span>
  );
}

export type { ChipStatus };
