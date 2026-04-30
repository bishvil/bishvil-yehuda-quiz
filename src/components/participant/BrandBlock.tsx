import Image from "next/image";

import { resolveActiveLogo, type ParticipantBrand } from "@/src/lib/participant/brands";

interface BrandBlockProps {
  brand: ParticipantBrand;
  customLogo: string | null;
  customLogoLabel: string | null;
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
}

/**
 * Brand lockup — logo + tagline. Per design-intake.md §5, customLogo from
 * the quiz overrides the regional brand logo, and customLogoLabel becomes
 * the public-facing brand text. No emoji, no colored left-border cards.
 */
export function BrandBlock({
  brand,
  customLogo,
  customLogoLabel,
  size = "md",
  showTagline = true,
}: BrandBlockProps) {
  const active = resolveActiveLogo({ brand, customLogo, customLogoLabel });

  const heightPx = size === "sm" ? 40 : size === "lg" ? 96 : 64;
  // Image needs both width + height. The aspect of regional logos is roughly
  // 3:1 (landscape lockup). We pick a generous max width and let object-fit
  // handle the rest.
  const widthPx = heightPx * 3;

  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <div
        className="relative flex w-full items-center justify-center"
        style={{ height: `${heightPx}px` }}
      >
        <Image
          src={active.logoUrl}
          alt={active.label}
          width={widthPx}
          height={heightPx}
          priority
          className="h-full w-auto object-contain mix-blend-multiply"
          sizes={`${widthPx}px`}
        />
      </div>
      {showTagline ? (
        <p className="text-bsy-forest font-[var(--font-hand)] text-[13px] tracking-wide">
          {active.isCustom ? `על שם: ${active.label}` : `״${brand.tagline}״`}
        </p>
      ) : null}
    </div>
  );
}
