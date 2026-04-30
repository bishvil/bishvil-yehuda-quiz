# Website UI kit — בשביל יהודה

A mobile-first, RTL Hebrew recreation of the בשביל יהודה website. **No live codebase or Figma was provided** — this kit is extrapolated from the brand book, logo dominants, and the brand's voice. Treat it as a **starting point** for the production site, not a faithful copy.

## What's here

| File | Role |
|---|---|
| `index.html` | Clickable demo: home → trail detail, side drawer, bottom nav, filter chips |
| `Header.jsx` | Sticky header with menu, logo, search |
| `Hero.jsx` | Full-bleed landscape SVG (mountain motif from the logo) + headline + CTAs |
| `TrailCard.jsx` | Workhorse tour card with stylized landscape thumb, eyebrow, brown title, meta row |
| `FilterChips.jsx` | Horizontal-scroll region filter |
| `BottomNav.jsx` | 4-tab bottom navigation (בית / מסלולים / סיפורים / שלי) |
| `TrailDetail.jsx` | Single-trail detail with stations list and CTA |
| `ui-kit.css` | Component-level CSS on top of the design tokens |

## How to use

```html
<link rel="stylesheet" href="../../colors_and_type.css">
<link rel="stylesheet" href="ui-kit.css">
<!-- React 18.3.1 + Babel pinned versions; see index.html -->
<script type="text/babel" src="Header.jsx"></script>
…
```

## What it intentionally doesn't do

- **No real photography.** Heroes/thumbs use a stylized SVG landscape lifted from the logo motif. Swap for golden-hour photography of the actual trails.
- **No production routing or backend.** Click-thru only.
- **No bilingual support.** Hebrew RTL only — add `lang="en" dir="ltr"` paths if you need an English mirror.
- **Icons are Lucide-style placeholders**, not a licensed in-house icon set. Flag for review.

## What to build next (suggested)

- A *story* / long-read template for sections like "סיפור המקום" (place stories).
- A guides / מדריכים directory page.
- A booking confirmation flow.
- A regional landing page (e.g. בשביל הארי) that swaps the regional emblem-animal in the header.
