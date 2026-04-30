import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "accent" | "ghost";

interface PrimaryButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: Variant;
  block?: boolean;
  withArrow?: boolean;
  children: ReactNode;
  type?: "button" | "submit" | "reset";
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-bsy-forest text-bsy-paper hover:bg-bsy-forest-deep disabled:bg-bsy-stone-200 disabled:text-bsy-stone-400",
  accent:
    "bg-bsy-lime text-bsy-forest-deep hover:bg-[#b8d456] disabled:bg-bsy-stone-200 disabled:text-bsy-stone-400",
  ghost:
    "bg-transparent text-bsy-forest border border-bsy-stone-200 hover:border-bsy-forest disabled:border-bsy-stone-100 disabled:text-bsy-stone-400",
};

/**
 * Pill-shaped CTA used across screens. Implements the design-intake.md §8
 * RTL arrow rule — `←` after the label means "forward" in Hebrew.
 */
export function PrimaryButton({
  variant = "primary",
  block = false,
  withArrow = false,
  children,
  className = "",
  type = "button",
  ...rest
}: PrimaryButtonProps) {
  return (
    <button
      type={type}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-full font-bold transition-all duration-200 ease-out",
        "active:scale-[0.97] disabled:cursor-not-allowed",
        block ? "w-full px-5 py-3.5 text-base" : "px-6 py-2.5 text-[15px]",
        VARIANT_CLASSES[variant],
        className,
      ].join(" ")}
      {...rest}
    >
      <span>{children}</span>
      {withArrow ? <span aria-hidden="true">←</span> : null}
    </button>
  );
}
