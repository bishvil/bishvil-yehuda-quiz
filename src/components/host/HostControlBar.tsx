import { PrimaryButton } from "@/src/components/participant/PrimaryButton";

import type { HostPrimaryButtonState } from "@/src/lib/host/controls";
import type { SessionStatusEnum } from "@/src/lib/supabase/database.types";

interface HostControlBarProps {
  primary: HostPrimaryButtonState;
  sessionStatus: SessionStatusEnum;
  onPrimary: () => void;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
  /** Inflight flag used to disable the bar while a request is pending. */
  busy?: boolean;
  /** Compact = mobile bottom sheet. Wide = desktop projector. */
  variant?: "wide" | "compact";
}

/**
 * Host control surface — primary CTA on the left (RTL: visually on the
 * right), pause/resume/end on the right.
 *
 * The primary button is driven by `decideHostPrimaryButton`. Pause is only
 * relevant while the session is `live`; resume only while `paused`. End is
 * always available unless the session has already ended (we still surface
 * a confirm in the screen layer).
 */
export function HostControlBar({
  primary,
  sessionStatus,
  onPrimary,
  onPause,
  onResume,
  onEnd,
  busy = false,
  variant = "wide",
}: HostControlBarProps) {
  const showPause = sessionStatus === "live";
  const showResume = sessionStatus === "paused";
  const showEnd =
    sessionStatus === "live" ||
    sessionStatus === "paused" ||
    sessionStatus === "scheduled";

  const isCompact = variant === "compact";

  return (
    <div
      className={[
        "flex flex-col gap-2",
        isCompact ? "" : "md:flex-row md:items-center md:gap-3",
      ].join(" ")}
    >
      <div
        className={[
          "flex items-center gap-2",
          isCompact ? "order-2 justify-between" : "order-2 md:order-1 md:flex-1",
        ].join(" ")}
      >
        {showPause ? (
          <SecondaryAction onClick={onPause} disabled={busy}>
            השהיה
          </SecondaryAction>
        ) : null}
        {showResume ? (
          <SecondaryAction onClick={onResume} disabled={busy}>
            המשך החידון
          </SecondaryAction>
        ) : null}
        {showEnd ? (
          <SecondaryAction onClick={onEnd} disabled={busy} tone="danger">
            סיום החידון
          </SecondaryAction>
        ) : null}
      </div>

      <div
        className={[
          "flex flex-col gap-1",
          isCompact ? "order-1" : "order-1 md:order-2",
        ].join(" ")}
      >
        <PrimaryButton
          variant={primary.action === "advance" ? "accent" : "primary"}
          block
          onClick={onPrimary}
          disabled={primary.disabled || busy || primary.action === "ended"}
        >
          {primary.label}
        </PrimaryButton>
        {primary.hint ? (
          <p className="m-0 text-center text-[11px] text-bsy-stone-400">
            {primary.hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

interface SecondaryActionProps {
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "danger";
  children: React.ReactNode;
}

function SecondaryAction({ onClick, disabled, tone = "neutral", children }: SecondaryActionProps) {
  const toneClass =
    tone === "danger"
      ? "border-bsy-error/30 text-bsy-error hover:border-bsy-error"
      : "border-bsy-stone-200 text-bsy-forest hover:border-bsy-forest";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center rounded-full border bg-white px-4 py-2 text-[13px] font-bold transition-colors",
        "disabled:cursor-not-allowed disabled:border-bsy-stone-100 disabled:text-bsy-stone-400",
        toneClass,
      ].join(" ")}
    >
      {children}
    </button>
  );
}
