import type { ReactNode } from "react";

interface CardTitleProps {
  children: ReactNode;
  size?: "lg" | "md";
  clamp?: 1 | 2;
  className?: string;
}

export function CardTitle({
  children,
  size = "lg",
  clamp = 2,
  className,
}: CardTitleProps) {
  const sz = size === "lg" ? "text-[24px]" : "text-[19px]";
  const cl =
    clamp === 1
      ? "truncate"
      : "line-clamp-2 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden";
  return (
    <h3
      className={[
        "m-0 font-[var(--font-display)] leading-[1.15] text-bsy-brown",
        sz,
        cl,
        className ?? "",
      ].join(" ")}
    >
      {children}
    </h3>
  );
}
