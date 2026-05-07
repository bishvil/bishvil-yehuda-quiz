"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface MenuItem {
  key: string;
  label: string;
  onClick?: () => void;
  href?: string;
  destructive?: boolean;
  disabled?: boolean;
  title?: string;
}

interface CardActionsProps {
  primary?: ReactNode;
  hint?: ReactNode;
  menu?: MenuItem[];
  menuLabel?: string;
}

export function CardActions({
  primary,
  hint,
  menu,
  menuLabel = "פעולות נוספות",
}: CardActionsProps) {
  return (
    <div className="mt-5 flex items-center justify-between gap-3 border-t border-bsy-stone-100/70 pt-4">
      <div className="flex min-w-0 items-center gap-2">
        {primary}
        {hint ? (
          <span className="truncate text-[12px] text-bsy-stone-700">{hint}</span>
        ) : null}
      </div>
      {menu && menu.length > 0 ? <KebabMenu items={menu} label={menuLabel} /> : null}
    </div>
  );
}

function KebabMenu({ items, label }: { items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLButtonElement | HTMLAnchorElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    firstItemRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-bsy-stone-700 hover:bg-bsy-stone-100 hover:text-bsy-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bsy-forest"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="4" cy="9" r="1.5" fill="currentColor" />
          <circle cx="9" cy="9" r="1.5" fill="currentColor" />
          <circle cx="14" cy="9" r="1.5" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute end-0 top-full z-20 mt-1 min-w-[10rem] overflow-hidden rounded-md border border-bsy-stone-100 bg-[color:var(--bsy-paper-card)] py-1 shadow-[0_8px_24px_-8px_rgba(74,63,38,0.18)]"
        >
          {items.map((item, i) => {
            const cls = [
              "block w-full text-start px-3 py-2 text-[13px]",
              item.disabled
                ? "cursor-not-allowed text-bsy-stone-400"
                : item.destructive
                  ? "text-bsy-error hover:bg-bsy-error/8"
                  : "text-bsy-stone-700 hover:bg-bsy-stone-100 hover:text-bsy-forest",
            ].join(" ");
            const setRef = (el: HTMLButtonElement | HTMLAnchorElement | null) => {
              if (i === 0) firstItemRef.current = el;
            };
            const onActivate = () => {
              if (item.disabled) return;
              setOpen(false);
              item.onClick?.();
            };
            if (item.href && !item.disabled) {
              return (
                <a
                  key={item.key}
                  ref={setRef as (el: HTMLAnchorElement | null) => void}
                  href={item.href}
                  role="menuitem"
                  className={cls}
                  title={item.title}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </a>
              );
            }
            return (
              <button
                key={item.key}
                ref={setRef as (el: HTMLButtonElement | null) => void}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                title={item.title}
                onClick={onActivate}
                className={cls}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export type { MenuItem };
