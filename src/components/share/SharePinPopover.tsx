"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";

interface SharePinPopoverProps {
  pin: string;
  /** Optional override for the participant URL. Defaults to `${origin}/${pin}`. */
  participantUrl?: string;
  /** Visual variant. `compact` is smaller and uses stone surfaces (admin row); `prominent` is larger (host card). */
  variant?: "compact" | "prominent";
}

const POPOVER_WIDTH = 260;
const POPOVER_GAP = 8;
const POPOVER_MARGIN = 8;
const POPOVER_HEIGHT_FALLBACK = 370;

interface PopoverPosition {
  top: number;
  inlineEnd: number;
}

/**
 * QA-22: copy-link + QR popover for sharing a session PIN.
 *
 * The dialog renders in a portal at document.body so it can never be clipped
 * or stacked beneath ancestor cards / siblings; it is anchored to the trigger
 * button via getBoundingClientRect on open and on viewport changes.
 *
 * - URL is computed lazily on open from `window.location.origin` so it picks
 *   up whichever hostname the host is currently on.
 * - Clipboard write uses the modern API with a textarea fallback for the
 *   non-secure-context case (Tailscale + http combos).
 */
export function SharePinPopover({
  pin,
  participantUrl,
  variant = "compact",
}: SharePinPopoverProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState<PopoverPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const url =
    participantUrl ??
    (open && typeof window !== "undefined"
      ? `${window.location.origin}/${pin}`
      : "");

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const isRtl =
        getComputedStyle(trigger).direction === "rtl" ||
        document.documentElement.dir === "rtl";
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Anchor the popover's inline-end edge to the trigger's inline-end
      // edge, then clamp so the popover stays fully within the viewport.
      const rawInlineEnd = isRtl ? rect.left : vw - rect.right;
      const maxInlineEnd = Math.max(POPOVER_MARGIN, vw - POPOVER_WIDTH - POPOVER_MARGIN);
      const inlineEnd = Math.min(
        Math.max(POPOVER_MARGIN, rawInlineEnd),
        maxInlineEnd,
      );

      // Prefer dropping below the trigger; flip above when there isn't room.
      const dialogHeight =
        dialogRef.current?.getBoundingClientRect().height ?? POPOVER_HEIGHT_FALLBACK;
      const spaceBelow = vh - rect.bottom;
      const top =
        spaceBelow >= dialogHeight + POPOVER_GAP + POPOVER_MARGIN
          ? rect.bottom + POPOVER_GAP
          : Math.max(POPOVER_MARGIN, rect.top - dialogHeight - POPOVER_GAP);

      setPos({ top, inlineEnd });
    };
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !dialogRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(ta);
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const buttonClass =
    variant === "prominent"
      ? "inline-flex items-center rounded-full border border-bsy-stone-200 bg-white px-4 py-2 text-[13px] font-bold text-bsy-brown hover:bg-bsy-stone-50"
      : "inline-flex items-center rounded-full border border-bsy-stone-200 px-3 py-1 text-[12px] font-bold text-bsy-stone-700 hover:bg-bsy-stone-50";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={buttonClass}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        שתף קישור
      </button>

      {open && pos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={dialogRef}
              role="dialog"
              aria-label="שיתוף קישור משחק"
              className="fixed rounded-md border border-bsy-stone-100 bg-white p-3 shadow-[0_12px_32px_-8px_rgba(74,63,38,0.24)]"
              style={{
                top: pos.top,
                insetInlineEnd: pos.inlineEnd,
                width: POPOVER_WIDTH,
                zIndex: 1000,
              }}
              dir="rtl"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-md bg-white p-2">
                  {url ? (
                    <QRCodeSVG value={url} size={160} level="M" includeMargin />
                  ) : null}
                </div>

                <div className="w-full">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-bsy-stone-400">
                    קוד הצטרפות
                  </div>
                  <div
                    className="font-[var(--font-display)] text-2xl text-bsy-brown"
                    dir="ltr"
                  >
                    {pin}
                  </div>
                </div>

                <div className="w-full">
                  <div
                    className="truncate rounded-md border border-bsy-stone-100 bg-bsy-stone-50 px-2 py-1 text-[11px] text-bsy-stone-700"
                    dir="ltr"
                    title={url}
                  >
                    {url || "…"}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={copy}
                  className="w-full rounded-full bg-bsy-forest px-4 py-2 text-[13px] font-bold text-bsy-paper hover:opacity-90"
                >
                  {copied ? "הקישור הועתק" : "העתק קישור"}
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
