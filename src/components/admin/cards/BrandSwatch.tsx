interface BrandSwatchProps {
  name: string;
  color?: string;
  size?: "sm" | "md";
}

function firstGlyph(name: string): string {
  if (!name) return "·";
  const trimmed = name.trim();
  if (!trimmed) return "·";
  const codepoints = Array.from(trimmed);
  return codepoints[0] ?? "·";
}

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([a-f\d]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const v = parseInt(match[1]!, 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

export function BrandSwatch({ name, color, size = "md" }: BrandSwatchProps) {
  const dim = size === "sm" ? "h-7 w-7 text-[14px]" : "h-9 w-9 text-[18px]";
  const rgb = color ? hexToRgb(color) : null;
  const style = rgb
    ? {
        backgroundColor: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.14)`,
        color: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
      }
    : undefined;
  const fallbackCls = rgb ? "" : "bg-bsy-stone-100 text-bsy-brown";
  return (
    <span
      aria-hidden="true"
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-md font-[var(--font-display)] leading-none",
        dim,
        fallbackCls,
      ].join(" ")}
      style={style}
    >
      {firstGlyph(name)}
    </span>
  );
}
