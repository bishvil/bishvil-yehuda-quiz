"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { DISABLED_NAV, NAV } from "./admin-nav-items";

interface AdminMobileNavProps {
  brandName: string;
  brandTagline: string;
  brandLogoUrl: string;
}

export function AdminMobileNav({
  brandName,
  brandTagline,
  brandLogoUrl,
}: AdminMobileNavProps) {
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname() ?? "";
  const lastPathRef = useRef(pathname);

  // Close drawer on route change
  useEffect(() => {
    if (lastPathRef.current !== pathname) {
      lastPathRef.current = pathname;
      setOpen(false);
    }
  }, [pathname]);

  const handleClose = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const drawer = drawerRef.current;
    const trigger = triggerRef.current;
    const focusable = () =>
      Array.from(
        drawer?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusable()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
        return;
      }
      if (event.key !== "Tab") return;
      const targets = focusable();
      const first = targets[0],
        last = targets[targets.length - 1];
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !drawer?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !drawer?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    const handleResize = () => {
      if (window.innerWidth >= 768) handleClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open, handleClose]);

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex md:hidden items-center justify-between border-b border-bsy-stone-100 bg-bsy-paper-warm px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="relative h-8 w-8 overflow-hidden rounded bg-white">
            <Image
              src={brandLogoUrl}
              alt={brandName}
              fill
              sizes="32px"
              className="object-contain mix-blend-multiply"
              priority
            />
          </div>
          <div className="text-sm font-bold text-bsy-brown">{brandName}</div>
        </div>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(!open)}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-2xl leading-none text-bsy-stone-700 hover:bg-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bsy-forest"
          aria-label={open ? "סגירת תפריט הניהול" : "פתיחת תפריט הניהול"}
          aria-expanded={open}
          aria-controls={drawerId}
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {/* Drawer backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={handleClose}
          aria-hidden="true"
        />
      )}

      {/* Slide-in drawer (RTL - slides from right) */}
      <div
        id={drawerId}
        ref={drawerRef}
        role="dialog"
        aria-label="תפריט ניהול"
        aria-modal={open ? true : undefined}
        aria-hidden={!open}
        inert={!open}
        className={[
          "fixed right-0 top-0 z-50 h-screen w-[220px] bg-bsy-paper-warm border-l border-bsy-stone-100 transition-transform duration-300 md:hidden",
          "flex flex-col",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        dir="rtl"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-4 pt-5">
          {/* Close button at top */}
          <div className="flex justify-end mb-4">
            <button
              onClick={handleClose}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-xl leading-none text-bsy-stone-700 hover:bg-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bsy-forest"
              type="button"
              aria-label="סגירת תפריט הניהול"
            >
              ✕
            </button>
          </div>

          {/* Brand info */}
          <div className="mb-4 flex items-center gap-2">
            <div className="relative h-8 w-8 overflow-hidden rounded-md bg-white">
              <Image
                src={brandLogoUrl}
                alt={brandName}
                fill
                sizes="32px"
                className="object-contain mix-blend-multiply"
                priority
              />
            </div>
            <div className="text-xs leading-tight">
              <div className="font-[var(--font-display)] text-[13px] text-bsy-brown">
                {brandName}
              </div>
              <div
                className="font-[var(--font-suez)] text-[11px]"
                style={{ color: "var(--bsy-tan-mid)" }}
              >
                ״{brandTagline}״
              </div>
            </div>
          </div>

          {/* Navigation items */}
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-bsy-stone-400 mt-3 mb-1">
            ניהול
          </div>
          {NAV.map((item) => {
            const active = item.matches(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleClose}
                className={[
                  "flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-[13px] font-bold transition-colors",
                  active
                    ? "bg-white text-bsy-forest shadow-[var(--shadow-xs)]"
                    : "text-bsy-stone-700 hover:bg-white/60",
                ].join(" ")}
              >
                <span className="text-bsy-forest" aria-hidden="true">
                  {item.glyph}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}

          {/* Disabled coming soon items */}
          {DISABLED_NAV.length > 0 ? (
            <>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-bsy-stone-400 mt-3 mb-1">
                בקרוב
              </div>
              {DISABLED_NAV.map((item) => (
                <span
                  key={item.href}
                  className="flex cursor-default items-center gap-2 rounded-md px-3 py-2 text-[13px] text-bsy-stone-400"
                  title="זמין בגל הבא"
                >
                  <span aria-hidden="true">{item.glyph}</span>
                  <span>{item.label}</span>
                </span>
              ))}
            </>
          ) : null}

          {/* Settings section */}
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-bsy-stone-400 mt-3 mb-1">
            הגדרות
          </div>
          <Link
            href={"/admin/settings/brands" as never}
            onClick={handleClose}
            className="flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-[13px] font-bold text-bsy-stone-700 hover:bg-white/60"
          >
            <span aria-hidden="true">◐</span>
            <span>מותג ותצוגה</span>
          </Link>
          <Link
            href={"/admin/settings/team" as never}
            onClick={handleClose}
            className="flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-[13px] font-bold text-bsy-stone-700 hover:bg-white/60"
          >
            <span aria-hidden="true">◒</span>
            <span>צוות</span>
          </Link>
        </div>
        <form
          action="/api/auth/signout"
          method="post"
          className="shrink-0 border-t border-bsy-stone-100 bg-bsy-paper-warm px-4 py-4"
        >
          <button
            type="submit"
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-bsy-stone-200 bg-white px-3 py-2 text-[12px] font-bold text-bsy-stone-700 transition-colors hover:bg-bsy-stone-50"
          >
            התנתק
          </button>
        </form>
      </div>
    </>
  );
}
