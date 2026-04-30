/**
 * Lightweight celebratory glyph used on the result screen header. Pure
 * SVG, brand colours from CSS vars so it inherits accent shifts.
 */
export function Spark({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M16 3 L18.5 12 L27 14 L18.5 16 L16 25 L13.5 16 L5 14 L13.5 12 Z"
        fill="var(--bsy-green-bright)"
        stroke="var(--bsy-green-forest)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="6" cy="6" r="1.6" fill="var(--bsy-green-forest)" />
      <circle cx="26" cy="26" r="1.6" fill="var(--bsy-green-forest)" />
      <circle cx="26" cy="7" r="1.2" fill="var(--bsy-green-bright)" />
    </svg>
  );
}
