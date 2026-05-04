"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { DISABLED_NAV, NAV } from "./admin-nav-items";

export function AdminSidebar({
  brandName,
  brandTagline,
  brandLogoUrl,
}: {
  brandName: string;
  brandTagline: string;
  brandLogoUrl: string;
}) {
  const pathname = usePathname() ?? "";

  return (
    <aside className="hidden w-[220px] shrink-0 flex-col gap-1 border-l border-bsy-stone-100 bg-bsy-paper-warm px-4 py-5 md:flex">
      <div className="mb-4 flex items-center gap-3">
        <div className="relative h-10 w-10 overflow-hidden rounded-md bg-white">
          <Image
            src={brandLogoUrl}
            alt={brandName}
            fill
            sizes="40px"
            className="object-contain mix-blend-multiply"
            priority
          />
        </div>
        <div className="leading-tight">
          <div className="font-[var(--font-display)] text-[15px] text-bsy-brown">
            {brandName}
          </div>
          <div
            className="font-[var(--font-suez)] text-[12px]"
            style={{ color: "var(--bsy-tan-mid)" }}
          >
            ״{brandTagline}״
          </div>
        </div>
      </div>

      <NavGroupHeading>ניהול</NavGroupHeading>
      {NAV.map((item) => {
        const active = item.matches(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
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

      {DISABLED_NAV.length > 0 ? (
        <>
          <NavGroupHeading>בקרוב</NavGroupHeading>
          {DISABLED_NAV.map((item) => (
            <DisabledNav
              key={item.href}
              glyph={item.glyph}
              label={item.label}
            />
          ))}
        </>
      ) : null}

      <NavGroupHeading>הגדרות</NavGroupHeading>
      <SettingsLink
        href="/admin/settings/brands"
        glyph="◐"
        label="מותג ותצוגה"
        active={pathname.startsWith("/admin/settings/brand")}
      />
      <SettingsLink
        href="/admin/settings/team"
        glyph="◒"
        label="צוות"
        active={pathname.startsWith("/admin/settings/team")}
      />
    </aside>
  );
}

function NavGroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-bsy-stone-400">
      {children}
    </div>
  );
}

function DisabledNav({ glyph, label }: { glyph: string; label: string }) {
  return (
    <span
      className="flex cursor-default items-center gap-2 rounded-md px-3 py-2 text-[13px] text-bsy-stone-400"
      title="זמין בגל הבא"
    >
      <span aria-hidden="true">{glyph}</span>
      <span>{label}</span>
    </span>
  );
}

function SettingsLink({
  href,
  glyph,
  label,
  active,
}: {
  href: string;
  glyph: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href as never}
      className={[
        "flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-bold transition-colors",
        active
          ? "bg-white text-bsy-forest shadow-[var(--shadow-xs)]"
          : "text-bsy-stone-700 hover:bg-white/60",
      ].join(" ")}
    >
      <span className="text-bsy-forest" aria-hidden="true">
        {glyph}
      </span>
      <span>{label}</span>
    </Link>
  );
}
