import type { HTMLAttributes, ReactNode } from "react";

type Tone = "default" | "muted" | "live";

interface AdminCardProps extends HTMLAttributes<HTMLElement> {
  tone?: Tone;
  interactive?: boolean;
  children: ReactNode;
}

const TONE_BORDER: Record<Tone, string> = {
  default: "border-bsy-stone-100",
  muted: "border-bsy-stone-100",
  live: "border-bsy-stone-100",
};

export function AdminCard({
  tone = "default",
  interactive = true,
  className,
  children,
  ...rest
}: AdminCardProps) {
  const base = [
    "group relative flex h-full flex-col rounded-[12px] border bg-[color:var(--bsy-paper-card)] p-5 md:p-6",
    "shadow-[0_1px_2px_rgba(74,63,38,0.06),0_4px_12px_-4px_rgba(74,63,38,0.08)]",
    "transition-[box-shadow,border-color,transform] duration-200 ease-[cubic-bezier(0.22,0.61,0.36,1)]",
    TONE_BORDER[tone],
  ];
  if (interactive && tone !== "muted") {
    base.push(
      "hover:border-bsy-stone-200 hover:shadow-[0_2px_4px_rgba(74,63,38,0.08),0_12px_24px_-8px_rgba(74,63,38,0.12)] hover:-translate-y-px motion-reduce:hover:translate-y-0",
    );
  }
  if (tone === "muted") base.push("opacity-70");
  if (tone === "live")
    base.push(
      "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:rounded-t-[12px] before:bg-bsy-lime",
    );
  if (className) base.push(className);
  return (
    <article className={base.join(" ")} {...rest}>
      {children}
    </article>
  );
}
