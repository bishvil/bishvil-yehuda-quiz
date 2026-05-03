export interface NavItem {
  href: string;
  label: string;
  glyph: string;
  disabled?: boolean;
  /** Match prefix for "active" highlighting. */
  matches: (pathname: string) => boolean;
}

export const NAV: NavItem[] = [
  {
    href: "/admin/quizzes",
    label: "החידונים שלי",
    glyph: "◇",
    matches: (p) =>
      p === "/admin/quizzes" ||
      (p.startsWith("/admin/quizzes/") && !p.includes("/sessions")),
  },
  {
    href: "/admin/sessions",
    label: "משחקים פעילים",
    glyph: "◊",
    matches: (p) => p === "/admin/sessions" || p.startsWith("/admin/sessions/"),
  },
  {
    href: "/admin/results",
    label: "תוצאות וניתוח",
    glyph: "◯",
    matches: (p) => p === "/admin/results" || p.startsWith("/admin/results/"),
  },
];

export const DISABLED_NAV: NavItem[] = [];
