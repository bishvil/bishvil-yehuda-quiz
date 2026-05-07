import type { ReactNode } from "react";

import { CardEyebrow } from "./CardEyebrow";

type Size = "sm" | "md" | "lg" | "xl";

const SIZE_CLS: Record<Size, string> = {
  sm: "text-[16px]",
  md: "text-[20px]",
  lg: "text-[28px]",
  xl: "text-[40px]",
};

interface StatBlockProps {
  label: string;
  value: ReactNode;
  size?: Size;
  display?: boolean;
  ltr?: boolean;
  align?: "start" | "center";
  className?: string;
}

export function StatBlock({
  label,
  value,
  size = "md",
  display = false,
  ltr = false,
  align = "start",
  className,
}: StatBlockProps) {
  const valueCls = [
    SIZE_CLS[size],
    "leading-[1] text-bsy-brown",
    display ? "font-[var(--font-display)] tracking-[0.04em]" : "font-bold",
  ].join(" ");
  return (
    <div
      className={[
        "flex flex-col gap-1.5",
        align === "center" ? "items-center text-center" : "",
        className ?? "",
      ].join(" ")}
    >
      <CardEyebrow>{label}</CardEyebrow>
      <div className={valueCls} dir={ltr ? "ltr" : undefined}>
        {value}
      </div>
    </div>
  );
}
