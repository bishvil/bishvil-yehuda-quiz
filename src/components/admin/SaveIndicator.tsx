import { autoSaveCopy, type AutoSaveStatus } from "@/src/lib/admin/auto-save";

interface SaveIndicatorProps {
  status: AutoSaveStatus;
  errorMessage?: string | null;
}

const DOT_CLASS: Record<AutoSaveStatus, string> = {
  idle: "bg-bsy-stone-200",
  saving: "bg-bsy-warn animate-pulse",
  saved: "bg-bsy-lime",
  error: "bg-bsy-error",
};

const TEXT_CLASS: Record<AutoSaveStatus, string> = {
  idle: "text-bsy-stone-400",
  saving: "text-bsy-stone-700",
  saved: "text-bsy-forest",
  error: "text-bsy-error",
};

/**
 * Inline auto-save indicator. Renders a small status dot + Hebrew label
 * mirroring the prototype's `נשמר אוטומטית`. The visual choreography
 * (`saving` pulses, `saved` resolves to lime, `error` flips to brick red)
 * is wired to the four-state machine from `auto-save.ts`.
 */
export function SaveIndicator({ status, errorMessage }: SaveIndicatorProps) {
  const copy = autoSaveCopy(status);
  const label = status === "error" && errorMessage ? errorMessage : copy.label;

  return (
    <span
      className={`inline-flex items-center gap-2 text-[12px] font-bold ${TEXT_CLASS[status]}`}
      role="status"
      aria-live="polite"
      aria-label={copy.ariaLabel}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-[7px] w-[7px] rounded-full ${DOT_CLASS[status]}`}
      />
      <span>{label}</span>
    </span>
  );
}
