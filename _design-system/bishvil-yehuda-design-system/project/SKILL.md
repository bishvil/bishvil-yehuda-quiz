---
name: bishvil-yehuda-design
description: Use this skill to generate well-branded interfaces and assets for "בשביל יהודה" (Bishvil Yehuda) — a Hebrew, RTL Israeli heritage organization. Contains essential design guidelines, colors, type tokens, fonts, logo assets, and a mobile-first website UI kit for prototyping or production work.
user-invocable: true
---

Read the `README.md` file within this skill to understand the brand, then explore the other available files:

- `colors_and_type.css` — drop-in CSS with all design tokens and base styles. Import this first.
- `assets/logos/` — master + 5 regional logos (PNG).
- `ui_kits/website/` — mobile-first website recreation (RTL Hebrew). Read its `README.md` and `index.html`.
- `preview/` — individual specimen cards for each design-system concept.
- `reference/` — original brand PDFs (Hebrew) for cross-checking decisions.

If creating visual artifacts (slides, mocks, throwaway prototypes), copy the assets you need out of `assets/logos/`, link `colors_and_type.css`, and produce static HTML the user can view. Do **not** reference cross-project files; copy them in.

If working on production code, copy assets in and use the README's CONTENT FUNDAMENTALS, VISUAL FOUNDATIONS, and ICONOGRAPHY sections to enforce voice and visual consistency.

If the user invokes this skill without other guidance, ask:

1. What surface? (web page, mobile screen, slide, social card, print)
2. Which sibling brand? (master, יהודה, הארי, הצפון, עציון, הגנת היישוב — they share the system but lock up differently)
3. Hebrew only, or bilingual?
4. Long-form (blog/article) or short-form (landing/CTA)?

Then act as an expert designer for this brand and output an HTML artifact (or production code, depending on the need). Hard rules:

- All text is in Hebrew with `dir="rtl"` and `lang="he"`. Do not invent English copy unless asked.
- Headlines use `--font-display` in `--bsy-brown`. Body uses `--font-body` in `--bsy-ink`.
- Background defaults to `--bsy-paper` (warm cream), never pure white.
- Buttons are pill-shaped (`--radius-pill`).
- The tagline ״מורשת בדרך ערך״ is treated like a wax seal — small, hand-style font, forest green, near the logo.
- No emoji. No bluish-purple gradients. No glassmorphism. No colored left-border cards.
- Photography is warm and golden-hour; landscapes of Judea / Israel.

The shipped display font is **BA Hamossad** (self-hosted at `fonts/BAHamossad-Regular.ttf`) — a calligraphic Hebrew face that stands in for the licensed **Fb TreeOfKnowledge** (עץ הדעת) until the licensed file arrives. Body uses **Heebo** (Google Fonts) as a stand-in for **Fb Coherenti Sans** (קוהרנטי). Casual accents use **Suez One** in place of **Fb Macchiato** (מקיאטו). All three substitutions are already wired into `colors_and_type.css` — use the CSS variables `--font-display`, `--font-body`, `--font-hand` and the swap is automatic when licensed files replace them.
