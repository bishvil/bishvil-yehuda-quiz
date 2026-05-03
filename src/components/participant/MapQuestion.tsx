"use client";

import { useRef, type MouseEvent, type PointerEvent } from "react";

interface MapPin {
  x: number;
  y: number;
}

interface MapQuestionProps {
  imageUrl: string;
  pin: MapPin | null;
  /** Tolerance radius in % of map width. Used to size the reveal ring. */
  tolerance: number;
  target: MapPin | null;
  /** Tooltip label rendered next to the correct pin on reveal. */
  targetLabel?: string;
  revealed: boolean;
  /** When true, taps are no-ops (timer expired or already submitted). */
  locked?: boolean;
  onPin: (pin: MapPin) => void;
  helpText: string;
}

/**
 * Generic map question component. The DB schema is `map: { image_url, target }`,
 * so we render the supplied `imageUrl` and overlay pins via absolute %
 * positioning. The bespoke `JudeaMap` SVG from the prototype is intentionally
 * not ported — that was decoration for one specific question.
 */
export function MapQuestion({
  imageUrl,
  pin,
  tolerance,
  target,
  targetLabel,
  revealed,
  locked,
  onPin,
  helpText,
}: MapQuestionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lockedNotRevealed = Boolean(locked) && !revealed;
  const interactionDisabled = revealed || Boolean(locked);

  function handleTap(event: MouseEvent<HTMLDivElement> | PointerEvent<HTMLDivElement>) {
    if (interactionDisabled || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    onPin({ x, y });
  }

  const isCorrect =
    revealed && pin && target
      ? Math.hypot(pin.x - target.x, pin.y - target.y) <= tolerance
      : false;

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        onClick={handleTap}
        className={[
          "relative aspect-[400/280] w-full overflow-hidden rounded-md border border-bsy-stone-100",
          "select-none touch-manipulation bg-bsy-paper-warm shadow-[0_1px_2px_rgba(74,63,38,0.06)]",
          interactionDisabled ? "cursor-default" : "cursor-crosshair",
          lockedNotRevealed ? "[filter:grayscale(0.55)]" : "",
        ].join(" ")}
        role="application"
        aria-label="מפת תשובה — הקישו לסימון מיקום"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          className="block h-full w-full object-cover"
          draggable={false}
        />

        {pin ? (
          <span
            className={[
              "absolute h-[18px] w-[18px] rotate-[-45deg] rounded-[50%_50%_50%_0] border-2 border-white shadow-[0_4px_8px_rgba(0,0,0,0.25)] transition-colors",
              !revealed
                ? "bg-bsy-error"
                : isCorrect
                  ? "bg-bsy-forest"
                  : "bg-bsy-error",
            ].join(" ")}
            style={{
              left: `${pin.x}%`,
              top: `${pin.y}%`,
              marginLeft: "-9px",
              marginTop: "-18px",
            }}
            aria-label={revealed ? (isCorrect ? "סימון נכון" : "סימון לא מדויק") : "הסימון שלך"}
          />
        ) : null}

        {lockedNotRevealed ? (
          <div
            role="status"
            className="pointer-events-none absolute inset-x-2 top-2 rounded-md border border-bsy-stone-300 bg-white/85 px-3 py-1.5 text-center text-[12px] font-bold text-bsy-stone-700 shadow-[0_1px_2px_rgba(74,63,38,0.06)]"
          >
            התחנה ננעלה — הזמן הסתיים.
          </div>
        ) : null}

        {revealed && target ? (
          <>
            <span
              className="pointer-events-none absolute animate-pulse rounded-full border-2 border-dashed border-bsy-forest bg-bsy-lime/20"
              style={{
                left: `${target.x}%`,
                top: `${target.y}%`,
                width: `${tolerance * 2}%`,
                paddingBottom: `${tolerance * 2}%`,
                transform: "translate(-50%, -50%)",
                height: 0,
              }}
              aria-hidden="true"
            />
            <span
              className="absolute h-[22px] w-[22px] rotate-[-45deg] rounded-[50%_50%_50%_0] border-2 border-white bg-bsy-forest shadow-[0_4px_8px_rgba(0,0,0,0.25)]"
              style={{
                left: `${target.x}%`,
                top: `${target.y}%`,
                marginLeft: "-11px",
                marginTop: "-22px",
              }}
              aria-label={targetLabel ?? "המיקום הנכון"}
            >
              {targetLabel ? (
                <span
                  className="absolute whitespace-nowrap rounded-md bg-bsy-forest px-2 py-0.5 text-[11px] font-semibold text-bsy-paper shadow"
                  style={{
                    insetInlineStart: "50%",
                    top: "-4px",
                    transform: "translate(-50%, -100%) rotate(45deg)",
                  }}
                >
                  {targetLabel}
                </span>
              ) : null}
            </span>
          </>
        ) : null}
      </div>
      <p className="px-1.5 text-center text-xs text-bsy-stone-700">{helpText}</p>
    </div>
  );
}
