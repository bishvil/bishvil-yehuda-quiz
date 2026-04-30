/**
 * Display-safe name per ADR-0007 §4 / ADR-0008 §3:
 * `first_name + ' ' + last_name_initial + '.'`. Used wherever a participant
 * name is shown publicly (leaderboard, lobby greeting). Full last name and
 * phone are server-only.
 */
export function buildDisplayName(args: {
  firstName: string;
  lastName: string;
}): string {
  const first = args.firstName.trim();
  const last = args.lastName.trim();

  if (!first) return last || "משתתף.ת";
  if (!last) return first;

  // Take the first grapheme of the last name. Hebrew letters are single
  // codepoints so charAt is fine for this language; we still use Array.from
  // to be safe against pathological combining marks.
  const lastInitial = Array.from(last)[0] ?? "";
  return `${first} ${lastInitial}.`;
}

export function avatarInitial(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return "ב";
  return Array.from(trimmed)[0] ?? "ב";
}
