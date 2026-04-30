import type { ReactNode } from "react";

import {
  DEFAULT_PARTICIPANT_BRAND,
  type ParticipantBrand,
} from "@/src/lib/participant/brands";

import { AdminSidebar } from "./AdminSidebar";

interface AdminShellProps {
  children: ReactNode;
  brand?: ParticipantBrand;
}

/**
 * Page-level shell: hidden mobile sidebar + sticky-ish content column.
 * The sidebar collapses below `md` (768px) — the page itself takes over
 * with its own mobile-specific top strip per spec.
 */
export function AdminShell({
  children,
  brand = DEFAULT_PARTICIPANT_BRAND,
}: AdminShellProps) {
  return (
    <div className="flex min-h-screen w-full bg-bsy-paper">
      <AdminSidebar
        brandName={brand.name}
        brandTagline={brand.tagline}
        brandLogoUrl={brand.logoUrl}
      />
      <main className="flex min-h-screen flex-1 flex-col">{children}</main>
    </div>
  );
}
