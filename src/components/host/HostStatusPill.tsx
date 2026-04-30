import type { SessionStatusEnum } from "@/src/lib/supabase/database.types";

interface HostStatusPillProps {
  status: SessionStatusEnum;
}

const STATUS_COPY: Record<SessionStatusEnum, { label: string; tone: string }> = {
  draft: { label: "טיוטה", tone: "bg-bsy-stone-100 text-bsy-stone-700" },
  scheduled: { label: "מתוזמן", tone: "bg-bsy-stone-100 text-bsy-stone-700" },
  live: { label: "פעיל", tone: "bg-bsy-lime/25 text-bsy-forest-deep" },
  paused: { label: "מושהה", tone: "bg-[color:var(--bsy-warn)]/15 text-bsy-warn" },
  ended: { label: "הסתיים", tone: "bg-bsy-stone-100 text-bsy-stone-400" },
};

/**
 * Small status pill for the host header. Live = green, paused = amber,
 * everything else = neutral.
 */
export function HostStatusPill({ status }: HostStatusPillProps) {
  const { label, tone } = STATUS_COPY[status];
  const showDot = status === "live";
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
        tone,
      ].join(" ")}
    >
      {showDot ? (
        <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-bsy-forest">
          <span className="absolute inset-0 animate-ping rounded-full bg-bsy-forest/50" />
        </span>
      ) : null}
      {label}
    </span>
  );
}
