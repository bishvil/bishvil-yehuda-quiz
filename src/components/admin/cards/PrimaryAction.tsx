import type { ReactNode } from "react";

const BASE =
  "inline-flex items-center gap-1.5 rounded-full bg-bsy-forest px-4 py-2 text-[13px] font-bold text-bsy-paper transition-colors hover:bg-bsy-forest-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bsy-forest disabled:cursor-not-allowed disabled:opacity-60";

export function PrimaryAction({
  href,
  onClick,
  children,
  arrow = true,
  testId,
  disabled,
}: {
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  arrow?: boolean;
  testId?: string;
  disabled?: boolean;
}) {
  const content = (
    <>
      <span>{children}</span>
      {arrow ? <span aria-hidden="true">←</span> : null}
    </>
  );
  if (href && !disabled) {
    return (
      <a href={href} className={BASE} data-testid={testId}>
        {content}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={BASE}
      data-testid={testId}
    >
      {content}
    </button>
  );
}
