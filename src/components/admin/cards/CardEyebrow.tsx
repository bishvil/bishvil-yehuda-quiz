import type { ReactNode } from "react";

interface CardEyebrowProps {
  children: ReactNode;
  tone?: "forest" | "stone";
  className?: string;
}

export function CardEyebrow({
  children,
  tone = "forest",
  className,
}: CardEyebrowProps) {
  const color = tone === "forest" ? "text-bsy-forest" : "text-bsy-stone-400";
  return (
    <div
      className={[
        "text-[10.5px] font-bold uppercase tracking-[0.18em]",
        color,
        className ?? "",
      ].join(" ")}
    >
      {children}
    </div>
  );
}
