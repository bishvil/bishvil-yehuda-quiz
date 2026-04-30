import Image from "next/image";

import { resolveActiveLogo, type ParticipantBrand } from "@/src/lib/participant/brands";
import type { SessionStatusEnum } from "@/src/lib/supabase/database.types";

import { HostStatusPill } from "./HostStatusPill";

interface HostHeaderProps {
  brand: ParticipantBrand;
  customLogo: string | null;
  customLogoLabel: string | null;
  pin: string;
  sessionStatus: SessionStatusEnum;
  responseCount: number;
  totalPlayers: number;
  questionOrdinal: number | null;
  totalQuestions: number;
}

/**
 * Top strip on the host dashboard — branding + PIN + at-a-glance counters.
 * The chrome is shared between desktop projector and mobile field view; the
 * counters drop the explanatory copy on small screens but keep the numbers.
 */
export function HostHeader({
  brand,
  customLogo,
  customLogoLabel,
  pin,
  sessionStatus,
  responseCount,
  totalPlayers,
  questionOrdinal,
  totalQuestions,
}: HostHeaderProps) {
  const active = resolveActiveLogo({ brand, customLogo, customLogoLabel });

  return (
    <header className="flex items-center justify-between gap-3 border-b border-bsy-stone-100 bg-bsy-paper-warm px-4 py-3 md:px-6">
      <div className="flex items-center gap-3 overflow-hidden">
        <Image
          src={active.logoUrl}
          alt={active.label}
          width={120}
          height={40}
          className="h-9 w-auto object-contain mix-blend-multiply md:h-10"
          priority
        />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[11px] font-bold uppercase tracking-[0.16em] text-bsy-forest">
            תצוגת מדריך
          </span>
          <span className="font-mono text-[12px] text-bsy-stone-700" dir="ltr">
            {pin}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        <HostStatusPill status={sessionStatus} />

        <div className="hidden items-center gap-4 text-[13px] text-bsy-stone-700 sm:flex">
          <CounterChip
            value={`${responseCount}/${totalPlayers}`}
            label="ענו"
          />
          <CounterChip
            value={
              questionOrdinal && totalQuestions
                ? `${questionOrdinal}/${totalQuestions}`
                : `–/${totalQuestions || 0}`
            }
            label="תחנות"
          />
        </div>

        {/* Compact counters for mobile */}
        <div className="flex items-center gap-2 text-[12px] text-bsy-stone-700 sm:hidden">
          <span className="font-[var(--font-display)] text-bsy-brown">
            {responseCount}/{totalPlayers}
          </span>
        </div>
      </div>
    </header>
  );
}

interface CounterChipProps {
  value: string;
  label: string;
}

function CounterChip({ value, label }: CounterChipProps) {
  return (
    <span className="inline-flex items-baseline gap-1 rounded-full border border-bsy-stone-100 bg-white px-3 py-1">
      <span
        className="font-[var(--font-display)] text-base text-bsy-brown"
        dir="ltr"
      >
        {value}
      </span>
      <span className="text-[11px] text-bsy-stone-400">{label}</span>
    </span>
  );
}
