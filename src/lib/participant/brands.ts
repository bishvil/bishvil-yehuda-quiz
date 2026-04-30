/**
 * Brand registry — mirrors `_prototype/untitled/project/data.js BSY_BRANDS`.
 * Wave 2 simplification: every regional brand shares the same primary/accent.
 * Per-brand colour overrides are reserved for Wave 3 (the `--bsy-active-primary`
 * runtime injection mechanism is in place per design-intake.md §5).
 */
export interface ParticipantBrand {
  id: string;
  name: string;
  tagline: string;
  logoUrl: string;
  primary: string;
  accent: string;
}

export const PARTICIPANT_BRANDS: Record<string, ParticipantBrand> = {
  yehuda: {
    id: "yehuda",
    name: "בשביל יהודה",
    tagline: "מורשת בדרך ערך",
    logoUrl: "/logos/logo_yehuda.png",
    primary: "#306030",
    accent: "#A0C040",
  },
  haari: {
    id: "haari",
    name: "בשביל הארי",
    tagline: "מורשת בדרך ערך",
    logoUrl: "/logos/logo_haari.png",
    primary: "#306030",
    accent: "#A0C040",
  },
  tzafon: {
    id: "tzafon",
    name: "בשביל הצפון",
    tagline: "מורשת בדרך ערך",
    logoUrl: "/logos/logo_tzafon.png",
    primary: "#306030",
    accent: "#A0C040",
  },
  etzion: {
    id: "etzion",
    name: "בשביל עציון",
    tagline: "מורשת בדרך ערך",
    logoUrl: "/logos/logo_etzion.jpeg",
    primary: "#306030",
    accent: "#A0C040",
  },
};

const FALLBACK_BRAND: ParticipantBrand = {
  id: "yehuda",
  name: "בשביל יהודה",
  tagline: "מורשת בדרך ערך",
  logoUrl: "/logos/logo_yehuda.png",
  primary: "#306030",
  accent: "#A0C040",
};

export const DEFAULT_PARTICIPANT_BRAND: ParticipantBrand =
  PARTICIPANT_BRANDS.yehuda ?? FALLBACK_BRAND;

export function resolveParticipantBrand(brandId: string | null | undefined): ParticipantBrand {
  if (!brandId) return DEFAULT_PARTICIPANT_BRAND;
  return PARTICIPANT_BRANDS[brandId] ?? DEFAULT_PARTICIPANT_BRAND;
}

/**
 * Resolves the active logo + label per design-intake.md §5:
 * customLogo (per-quiz) overrides brand.logo (per-organization).
 */
export function resolveActiveLogo(args: {
  brand: ParticipantBrand;
  customLogo: string | null | undefined;
  customLogoLabel: string | null | undefined;
}): { logoUrl: string; label: string; isCustom: boolean } {
  if (args.customLogo) {
    return {
      logoUrl: args.customLogo,
      label: args.customLogoLabel ?? args.brand.name,
      isCustom: true,
    };
  }

  return {
    logoUrl: args.brand.logoUrl,
    label: args.brand.name,
    isCustom: false,
  };
}
