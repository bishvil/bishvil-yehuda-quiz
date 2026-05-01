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
];

export const DISABLED_NAV: NavItem[] = [
  {
    href: "/admin/sessions",
    label: "משחקים פעילים",
    glyph: "◊",
    disabled: true,
    matches: (p) => p.includes("/sessions") && !p.includes("/results"),
  },
  {
    href: "/admin/results",
    label: "תוצאות וניתוח",
    glyph: "◯",
    disabled: true,
    matches: (p) => p.includes("/results"),
  },
];
