import type { ButtonHTMLAttributes } from "react";

interface TypePillProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  active?: boolean;
  label: string;
}

/**
 * Pill-shaped chip used in the question-type selector. Reads the
 * `--radius-pill` token from the design system to keep parity with
 * `_design-system/.../preview/type-pills.html`.
 */
export function TypePill({
  active = false,
  label,
  className = "",
  ...rest
}: TypePillProps) {
  return (
    <button
      type="button"
      className={[
        "inline-flex items-center justify-center rounded-full border px-4 py-1.5 text-[13px] font-bold transition-colors",
        active
          ? "border-bsy-forest bg-bsy-forest text-bsy-paper"
          : "border-bsy-stone-200 bg-white text-bsy-stone-700 hover:border-bsy-stone-400",
        className,
      ].join(" ")}
      aria-pressed={active}
      {...rest}
    >
      {label}
    </button>
  );
}
