"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

interface SharePinPopoverProps {
  pin: string;
  /** Optional override for the participant URL. Defaults to `${origin}/${pin}`. */
  participantUrl?: string;
  /** Visual variant. `compact` is smaller and uses stone surfaces (admin row); `prominent` is larger (host card). */
  variant?: "compact" | "prominent";
}

/**
 * QA-22: copy-link + QR popover for sharing a session PIN.
 *
 * - URL is computed at click time from `window.location.origin` so it picks
 *   up the same hostname the host is currently on (Tailscale, prod domain,
 *   localhost during dev). The `participantUrl` prop is an explicit override.
 * - Clipboard write uses the modern API with a textarea fallback so it
 *   keeps working in non-secure contexts (some Tailscale + http combos).
 */
export function SharePinPopover({
  pin,
  participantUrl,
  variant = "compact",
}: SharePinPopoverProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Compute the URL lazily on each open. Reading window during render is
  // fine for a client component, and we want this to refresh if the user
  // somehow navigates between tabs/origins.
  const url =
    participantUrl ??
    (open && typeof window !== "undefined"
      ? `${window.location.origin}/${pin}`
      : "");

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for non-secure contexts where clipboard API is blocked.
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
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={buttonClass}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        שתף קישור
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="שיתוף קישור משחק"
          className="absolute z-50 mt-2 w-[260px] rounded-md border border-bsy-stone-100 bg-white p-3 shadow-[var(--shadow-md)]"
          style={{ insetInlineEnd: 0 }}
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
              <div className="truncate rounded-md border border-bsy-stone-100 bg-bsy-stone-50 px-2 py-1 text-[11px] text-bsy-stone-700" dir="ltr" title={url}>
                {url || "…"}
              </div>
            </div>

            <button
              type="button"
              onClick={copy}
              className="w-full rounded-full bg-bsy-green-forest px-4 py-2 text-[13px] font-bold text-bsy-paper hover:opacity-90"
            >
              {copied ? "הקישור הועתק" : "העתק קישור"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
