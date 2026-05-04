# בשביל יהודה — Design System
**Bishvil Yehuda — Heritage along a path of value**
*"מורשת בדרך ערך"*

A design system for **בשביל יהודה** — an Israeli educational/heritage organization that gives historical tours and overviews of Jewish history across **Judea, Samaria, and the Land of Israel**. The flagship is a **mobile-first website**.

---

## The brand at a glance

"בשביל" is a play on words: in Hebrew, *bishvil* means both **"on the path of"** and **"for the sake of"**. So *בשביל יהודה* simultaneously reads as "on the path of Judah" (a literal hiking trail) and "for the sake of Judah." The organization wraps Jewish history in the metaphor of walking the land.

The brand is a family of sister projects, all sharing the visual DNA (mountains + hiker silhouette + warm green/earth palette + the tagline *"מורשת בדרך ערך"*):

| Logo | Project | Region |
|---|---|---|
| `logo_main.png`    | בשביל / בשביל כללי           | Master / generic identity |
| `logo_yehuda.png`  | בשביל יהודה                  | Judea (the flagship) |
| `logo_haari.png`   | בשביל הארי (lion)            | The Ari trail (Galilee, mystical history) |
| `logo_tzafon.png`  | בשביל הצפון (deer)           | The North |
| `logo_etzion.png`  | בשביל עציון (oak)            | Gush Etzion |
| `logo_shomeron.png`| בשביל השומרון                | Samaria |
| `logo_haganat.png` | בשביל הגנת היישוב (fortress) | Defense-of-the-Yishuv tour |

Each sibling logo keeps the same hiker, mountains, and tagline but swaps in a **regional emblem-animal/landmark** (lion, deer, oak, fortress wall) — a mark-system pattern worth preserving in any future expansion.

## Sources

The system was synthesized from these uploaded materials (all stored in `/reference/` for reference):

- `reference/colors_fonts.pdf` — short brand sheet listing fonts (קוהרנטי / מקיאטו / עץ הדעת — all Fontbit) and the three brand colors with purchase links.
- `reference/brand_basic.pdf` — the basic brand book for *בשביל יהודה*. Specifies headline font **Fb TreeOfKnowledge**, body font **Fb Coherenti Sans**, two CMYK palettes (booklet vs. logo), and the tagline lockup.
- 6 logo files (master + 5 regional variants), copied to `assets/logos/`.

No codebase or Figma was provided. Visual recreations in `ui_kits/` are extrapolated from the brand book + logo dominants — please review carefully against any production designs.

---

## Index

```
.
├── README.md                 ← you are here
├── SKILL.md                  ← agent skill manifest (Claude Code-compatible)
├── colors_and_type.css       ← all design tokens (CSS vars) + base styles
├── assets/
│   └── logos/                ← 6 logos (master + 5 regional)
├── reference/                ← original brand PDFs (for human reference)
├── preview/                  ← Design System tab cards (one HTML per token group)
├── ui_kits/
│   └── website/              ← mobile-first website recreation
│       ├── README.md
│       ├── index.html        ← clickable demo
│       └── *.jsx             ← components
└── uploads/                  ← raw originals (PNGs, PDFs)
```

---

## CONTENT FUNDAMENTALS

**Language.** Hebrew, RTL. The tone is warm, slightly literary, never breezy. Copy reads like a knowledgeable, generous tour guide — proud of the land, careful with history, never preachy.

**Voice & person.** Second-person inclusive ("נצא יחד לדרך", "תגלו", "בואו אתנו") is common in marketing copy; first-person plural ("אנחנו…") in mission statements. Direct second-person singular ("אתה / את") is used sparingly in CTAs.

**Casing & punctuation.** Hebrew has no case. Headlines often **omit final punctuation**, like a sign on a trail. Quotation marks (״ ״) are used for historical primary sources. Avoid exclamation marks except for clear calls to action.

**Tagline / signature.** Every surface ends with **״מורשת בדרך ערך״** (*"Heritage along a path of value"*). Treat it like a wax seal — small, in the hand-style display font, set in forest green. Place it under the logo in lockups and at the bottom of long-form content.

**Vocabulary.** Lean into trail/landscape language as a metaphor for learning: *מסלול* (route), *תחנה* (station/stop), *מורשת* (heritage), *סיפור המקום* (the story of the place), *צידה לדרך* (provisions for the road). Avoid generic startup-speak (engagement, platform, leverage).

**Examples (paraphrased from the brand surface):**

- ✅ *"בואו לצעוד אִתנו במסלולי המורשת של יהודה ושומרון"* — invitation, plural, warm.
- ✅ *"כל אבן כאן מספרת סיפור."* — short, declarative, a guide's aside.
- ✅ *"תחנה הבאה: חברון."* — trail-marker phrasing repurposed as section header.
- ❌ *"Discover Israel's #1 heritage platform!"* — wrong language, wrong register.
- ❌ *"לחץ כאן כדי להמשיך"* — too sterile; prefer *"להמשך הסיפור →"*.

**Emoji.** **No.** This brand never uses emoji. Iconography is iconographic — silhouettes, line marks, regional emblem animals — not emoji.

---

## VISUAL FOUNDATIONS

### Color
The palette is split into two tiers, both pulled from **the actual logo PNGs** (sampled by histogram-binning) and cross-checked against the CMYK in the brand book:

The values below were sampled from the actual logo PNGs (histogram-binned from non-edge pixels). They are slightly less saturated than the CMYK in the brand book, which reads better on screen and in UI; the brand book values are kept as the print reference inside `reference/colors_fonts.pdf`.

**Logo colors** — outdoor, sunlit, used on imagery and signage:
- `--bsy-green-bright`  `#A0C040` — primary brand lime (grass, ridge)
- `--bsy-green-light`   `#B4DC64` — highlight / sun-on-grass
- `--bsy-green-sage`    `#90B090` — distant ridge, neutral surface
- `--bsy-tan`           `#A08050` — warm sand (paths, hills)

**Booklet colors** — deeper, more editorial, used in long-form content:
- `--bsy-green-forest`  `#306030` — text and silhouettes
- `--bsy-tan-mid`       `#8C6E40` — accent rule, secondary heading
- `--bsy-brown`         `#6E5430` — primary heading color

**Paper neutrals** — never pure white. The brand prefers a warm cream `#FAF7F0` evoking parchment / a tour pamphlet. White (`#FFFFFF`) is reserved for elevated cards on top of cream.

**No blue brand color.** Blue appears only as a small Israeli-flag accent in some compositions, and only as a semantic info color (`--bsy-info`).

### Type
| Role | Brand spec | Currently shipped |
|---|---|---|
| Display / headlines | **Fb TreeOfKnowledge** (עץ הדעת) | **BA Hamossad** — calligraphic Hebrew display, self-hosted at `fonts/BAHamossad-Regular.ttf` (placeholder until the licensed Fontbit family arrives) |
| Body / UI           | **Fb Coherenti Sans** (קוהרנטי)   | **Heebo** — clean Hebrew geometric sans (Google Fonts) |
| Casual / handwritten| **Fb Macchiato** (מקיאטו)         | **Suez One** — chunky display (Google Fonts) |

⚠️ **The two Fontbit families (TreeOfKnowledge, Coherenti, Macchiato) are commercial** and must be licensed and self-hosted to ship as the real brand fonts. **BA Hamossad** is the closest-in-spirit substitute we have on hand — same calligraphic-traditional Hebrew warmth as עץ הדעת — and is wired in via `@font-face` in `colors_and_type.css`. When the licensed `.woff2` files arrive, drop them into `fonts/` and update the `@font-face` block.

Headlines are **brown** (`--bsy-brown`), not black. Body copy is dark warm ink (`--bsy-ink` `#2A2620`). All headings tighten leading and balance line-wrap.

### Backgrounds
- **Default surface:** warm cream `#FBF7EE`. No grey.
- **Elevated cards:** pure white with a soft shadow.
- **Hero / section breaks:** full-bleed photography of Israeli landscape (Judean hills, terraced vineyards, archaeological sites) — warm, golden-hour, never high-contrast or cold.
- **Texture:** an optional faint **paper grain** can sit on top of cream surfaces at ~4% opacity for printed-pamphlet feel. Avoid gradients except very gentle warm-to-cream washes for hero overlays.
- **No** dark-mode hero gradients, no neon, no glassmorphism, no abstract 3D.

### Layout & spacing
4-pt base scale (`--space-1` … `--space-10`). Mobile-first: content is anchored to a 16-px gutter; max content width on desktop is **1100px**. Generous vertical rhythm — sections breathe at `--space-9` (64) on mobile, `--space-10` (80) on desktop. Lockups are **center-aligned** for hero/title surfaces, right-aligned (RTL "start") for body.

### Borders & radii
- Border color is always a stone neutral (`--color-border`), never green.
- Corner radii are gentle: `--radius-md` (12) on cards, `--radius-pill` for buttons & chips. Avoid the cheap "rounded-XL on everything" look — buttons are pills, cards are softly rounded rectangles.

### Shadows
Warm-tinted, never cold-blue. All shadows derive from `rgba(74, 63, 38, …)`. Five steps from `--shadow-xs` (1-px hairline) to `--shadow-lg` (lifted card). Inner shadow is reserved for inset inputs.

### Animation & states
Subtle. Always purposeful, never decorative.
- **Default easing:** `--ease-out` (`cubic-bezier(0.22, 0.61, 0.36, 1)`).
- **Default duration:** `--dur-base` (220 ms).
- **Hover (links):** color darkens from forest → deep forest, underline thickens.
- **Hover (buttons):** background shifts one shade darker; subtle 1-px lift via shadow.
- **Press:** scale `0.97`, shadow flattens. No bounces, no springs.
- **Page transitions:** opacity-only fade, 220 ms. No slide-ins.
- **Reduced motion:** respect `prefers-reduced-motion: reduce` — disable scale, keep color shifts.

### Transparency & blur
Used sparingly. Acceptable: a sticky mobile header with `backdrop-filter: blur(8px)` on `rgba(251, 247, 238, 0.85)`. **Never** glass cards, never overlapping translucent panes.

### Imagery
Photography is **warm, sunlit, golden-hour**. Subjects: Israeli landscape (Judean hills, Galilee, Hebron's terraces), people walking, ruins, old maps. Treatments are minimal — slight warmth boost, never B&W, never heavy grain. If photography isn't available, use the **landscape-illustration motif from the logos** (overlapping mountain silhouettes in the brand greens + tan) as a stylized hero.

### Cards
Soft white surface, `--radius-md`, `--shadow-sm`, optional 1-px stone border. Padding `--space-5` mobile, `--space-6` desktop. Heading uses display font in brown; meta uses small forest-green eyebrow. **Never** a colored left-border accent — that motif feels foreign to this brand.

---

## ICONOGRAPHY

**No icon font in source.** The brand's distinctive iconographic vocabulary is **silhouettes and emblem-animals** rather than UI glyphs:

- The **hiker with backpack** is the brand's anchor mark, present in every logo.
- Each regional sibling adds a **single emblem**: lion (האר״י), deer (הצפון), oak (עציון), fortress wall (הגנת היישוב).
- **Mountain triangles** in the three brand greens + tan, with a **white walking-path swoosh** through them.

For UI iconography (search, menu, share, etc.) we recommend **Lucide** (`lucide.dev`) at stroke-1.5, in `--bsy-green-forest`. Lucide's hand-drawn-but-clean line style sits well with the brand's earth tone and avoids the slick-tech feel of, say, Material Symbols. *This is a substitution to be flagged.*

```html
<!-- Lucide via CDN (used in UI kit) -->
<script src="https://unpkg.com/lucide@latest"></script>
<i data-lucide="map" stroke-width="1.5"></i>
```

**Emoji:** never. **Unicode dingbats** (←, →, ✕): allowed for breadcrumbs and close buttons only. **Custom illustrations:** the hiker silhouette and mountain motif from the logo are the only "decorative" SVGs the brand owns; use them as page accents (e.g. a small hiker walking across the bottom of an empty state).

Available logo assets live in `assets/logos/`. PNGs only — no SVG masters were provided. **Please send SVG masters** for the master logo and each regional sibling so we can recolor and scale freely.

---

## Caveats & open questions

See the bottom of the chat. The most urgent items: licensed fonts, SVG logo masters, real photography, and codebase/Figma for the live website.
