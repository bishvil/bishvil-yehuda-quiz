import type { ReactNode } from "react";

interface AdminTopBarProps {
  /** Crumb segments — last element is rendered bold. */
  crumbs: { label: string; href?: string }[];
  /** Right-aligned tools cluster (save indicator, action buttons). */
  tools?: ReactNode;
}

/**
 * Top toolbar over admin pages. Mirrors `.admin-toolbar` in the prototype:
 * RTL crumbs on the leading side, tools cluster on the trailing side.
 * On mobile it stacks vertically so the tools never push off-screen.
 */
export function AdminTopBar({ crumbs, tools }: AdminTopBarProps) {
  return (
    <header className="flex flex-col gap-2 border-b border-bsy-stone-100 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
      <nav
        aria-label="breadcrumb"
        className="flex items-center gap-2 text-[12px] text-bsy-stone-700"
      >
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          const node =
            c.href && !last ? (
              <a
                key={`${c.label}-${i}`}
                href={c.href}
                className="hover:text-bsy-forest"
              >
                {c.label}
              </a>
            ) : (
              <strong
                key={`${c.label}-${i}`}
                className={last ? "font-bold text-bsy-brown" : ""}
              >
                {c.label}
              </strong>
            );
          return (
            <span key={`crumb-wrap-${i}`} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden="true">/</span>}
              {node}
            </span>
          );
        })}
      </nav>
      {tools ? (
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          {tools}
        </div>
      ) : null}
    </header>
  );
}
