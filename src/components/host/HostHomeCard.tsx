import Link from "next/link";

import { HostStatusPill } from "@/src/components/host/HostStatusPill";
import { SharePinPopover } from "@/src/components/share/SharePinPopover";
import type { HostSessionRow } from "@/src/lib/sessions/host-sessions";

interface HostHomeCardProps {
  session: HostSessionRow;
}

/**
 * Single row on `/host`. Shows the quiz title, lifecycle pill, the LTR-isolated
 * PIN and one primary action whose label depends on the session status:
 *
 * - `live`            → "כנס לדשבורד"
 * - `scheduled|draft` → "כנס להמתנה" (lobby/waiting state on /host/[pin])
 * - `paused`          → "המשך מהמסך" (resume from host live screen)
 * - `ended`           → "צפה בתוצאות" — disabled until an admin results route ships
 */
export function HostHomeCard({ session }: HostHomeCardProps) {
  const action = primaryAction(session);
  const created = formatDateTime(session.createdAt);

  return (
    <article
      className="flex h-full flex-col justify-between rounded-md border border-bsy-stone-100 bg-white p-4 shadow-[var(--shadow-xs)]"
      data-testid="host-home-card"
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <HostStatusPill status={session.status} />
          <span className="text-[11px] text-bsy-stone-400">נוצר {created}</span>
        </div>

        <h3 className="mt-3 m-0 text-[15px] font-bold text-bsy-brown">
          {session.quizTitle}
        </h3>

        <p className="mt-3 mb-0 flex items-baseline gap-2">
          <span className="text-[11px] text-bsy-stone-400">קוד הצטרפות</span>
          <span
            className="font-[var(--font-display)] text-3xl text-bsy-brown"
            dir="ltr"
            data-testid="host-home-pin"
          >
            {session.pin}
          </span>
        </p>
      </div>

      <div className="mt-4 flex items-center gap-2">
        {action.disabled ? (
          <span
            className="inline-flex cursor-not-allowed items-center rounded-full bg-bsy-stone-50 px-4 py-2 text-[13px] font-bold text-bsy-stone-400"
            aria-disabled="true"
            title="תוצאות יוצגו כאן בעדכון הבא"
          >
            {action.label}
          </span>
        ) : (
          <Link
            href={action.href}
            className="inline-flex items-center rounded-full bg-bsy-green-forest px-4 py-2 text-[13px] font-bold text-bsy-paper hover:opacity-90"
          >
            {action.label}
          </Link>
        )}
        <SharePinPopover pin={session.pin} variant="prominent" />
      </div>
    </article>
  );
}

interface PrimaryAction {
  label: string;
  href: string;
  disabled: boolean;
}

function primaryAction(session: HostSessionRow): PrimaryAction {
  switch (session.status) {
    case "live":
      return { label: "כנס לדשבורד", href: `/host/${session.pin}`, disabled: false };
    case "paused":
      return { label: "המשך מהמסך", href: `/host/${session.pin}`, disabled: false };
    case "scheduled":
    case "draft":
      return { label: "כנס להמתנה", href: `/host/${session.pin}`, disabled: false };
    case "ended":
      return { label: "צפה בתוצאות", href: "#", disabled: true };
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
