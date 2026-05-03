"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

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
  const pathname = usePathname() ?? "";
  const lastPathRef = useRef(pathname);

  // Close drawer on route change
  useEffect(() => {
    if (lastPathRef.current !== pathname) {
      lastPathRef.current = pathname;
      setOpen(false);
    }
  }, [pathname]);

  // Close on ESC key
  const handleClose = useCallback(() => setOpen(false), []);
  
  useEffect(() => {
    if (!open) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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
          onClick={() => setOpen(!open)}
          className="p-1 text-bsy-stone-700 hover:bg-white/60 rounded text-2xl leading-none"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {/* Drawer backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-in drawer (RTL - slides from right) */}
      <nav
        className={[
          "fixed right-0 top-0 z-50 h-screen w-[220px] bg-bsy-paper-warm border-l border-bsy-stone-100 overflow-y-auto transition-transform duration-300 md:hidden",
          "flex flex-col gap-1 px-4 py-5",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        dir="rtl"
      >
        {/* Close button at top */}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setOpen(false)}
            className="p-1 text-bsy-stone-700 hover:bg-white/60 rounded text-xl leading-none"
            aria-label="Close menu"
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
            <div className="text-[10px] text-bsy-stone-400">{brandTagline}</div>
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
              onClick={() => setOpen(false)}
              className={[
                "flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-bold transition-colors",
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
        <span
          className="flex cursor-default items-center gap-2 rounded-md px-3 py-2 text-[13px] text-bsy-stone-400"
          title="זמין בגל הבא"
        >
          <span aria-hidden="true">◐</span>
          <span>מותג ותצוגה</span>
        </span>
        <span
          className="flex cursor-default items-center gap-2 rounded-md px-3 py-2 text-[13px] text-bsy-stone-400"
          title="זמין בגל הבא"
        >
          <span aria-hidden="true">◒</span>
          <span>צוות</span>
        </span>
      </nav>
    </>
  );
}
