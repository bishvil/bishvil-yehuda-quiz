# Design System Intake — Bishvil Yehuda Quiz

> This is a **bridge document**, not a re-documentation of the design system.
> For brand rules, color values, typography, spacing, iconography, and voice
> guidelines, the authoritative source is:
> `_design-system/bishvil-yehuda-design-system/project/`
> Read `SKILL.md` and `README.md` there before implementing any UI component.

---

## 1. Source File Map

| Path | Role | Notes |
|---|---|---|
| `_design-system/.../SKILL.md` | **Hard brand rules** — law for all agents | RTL, fonts, no-emoji, pill buttons, font substitutions |
| `_design-system/.../README.md` | Brand narrative, visual + content guidelines | Full color palette derivation |
| `_design-system/.../colors_and_type.css` | **Canonical token file** — all CSS custom properties | All `--bsy-*` vars + semantic aliases + type scale + spacing + radii + shadows + motion + layout |
| `_design-system/.../styles/tokens.css` | Secondary token file (design system docs page chrome) | Subset of `colors_and_type.css` plus `ds-*` layout helpers; NOT the file to import in production |
| `_design-system/.../preview/*.html` | 13 component specimens | buttons, badges, cards, forms, spacing, radii, shadows, typography, iconography, logos |
| `_design-system/.../ui_kits/website/*.jsx` | Mobile-first JSX component patterns for the heritage website | TrailCard, Hero, Header, FilterChips, BottomNav, TrailDetail — website surfaces, not quiz surfaces |
| `_design-system/.../fonts/BAHamossad-Regular.ttf` | Self-hosted display font | Must be copied to `public/fonts/` — see §3 |
| `_design-system/.../assets/logos/*.png` | 6 brand logos (master + 5 regional) | PNG only, no SVG masters available yet — flag as open issue |
| `_prototype/untitled/project/styles/tokens.css` | Prototype token file | **Identical to `colors_and_type.css`** — the prototype was built from the same source. Use `colors_and_type.css` as canonical. |
| `_prototype/untitled/project/styles/app.css` | Prototype component CSS (~1983 lines) | Defines quiz-specific UI patterns: quiz screens, host bars, player lists, timer, code cells. Reference for Wave 2 component implementation. |
| `_prototype/untitled/project/*.jsx` | 4 prototype surfaces + data | Source of truth for screen inventory and game flow. See §4. |

---

## 2. Token Conflicts and Resolution

The prototype `tokens.css` and the design-system `colors_and_type.css` are effectively identical — both were generated from the same brand source. **Only one survives into production.**

**Decision:** Import `colors_and_type.css` (design-system file) as the canonical source. Do NOT import the prototype's `tokens.css`. When a prototype CSS rule references a token not in `colors_and_type.css`, check `tokens.css` from `_design-system/styles/` — it covers doc chrome; if still not found, it's a prototype-only value and must be re-expressed using canonical tokens.

One notable difference: the prototype `--font-hand` stack leads with `BA Hamossad` before `Suez One`:
```css
/* Prototype (correct — Suez One is Latin-only, breaks Hebrew taglines) */
--font-hand: 'BA Hamossad', 'Fb Macchiato', 'Frank Ruhl Libre', 'Suez One', serif;
```
Use the prototype's `--font-hand` definition, not the design-system one.

---

## 3. Font Wiring for Next.js

### 3.1 BAHamossad (self-hosted)

The TTF lives at `_design-system/.../fonts/BAHamossad-Regular.ttf`. It must be served from within the Next.js app.

**Step 1 — copy asset:**
```bash
mkdir -p public/fonts
cp _design-system/bishvil-yehuda-design-system/project/fonts/BAHamossad-Regular.ttf public/fonts/
```

**Step 2 — declare in `app/globals.css` with `@font-face`:**
```css
@font-face {
  font-family: 'BA Hamossad';
  src: url('/fonts/BAHamossad-Regular.ttf') format('truetype');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

Do **not** use `next/font/local` for BAHamossad — `next/font/local` requires woff/woff2; the only file available is TTF. When (if) the licensed Fontbit fonts arrive as woff2, switch to `next/font/local` for the production font stack.

### 3.2 Google Fonts (Heebo body, Suez One accent)

Load via `next/font/google` in `app/layout.tsx`:
```tsx
import { Heebo, Suez_One } from 'next/font/google';

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  weight: ['300', '400', '500', '700', '800', '900'],
  variable: '--font-heebo',
  display: 'swap',
});

const suezOne = Suez_One({
  subsets: ['hebrew', 'latin'],
  weight: '400',
  variable: '--font-suez',
  display: 'swap',
});
```

Then in `globals.css` override the `--font-body` and `--font-hand` vars:
```css
:root {
  --font-body: var(--font-heebo), 'Fb Coherenti Sans', 'Assistant', system-ui, sans-serif;
  --font-hand: 'BA Hamossad', var(--font-suez), 'Frank Ruhl Libre', serif;
}
```

Apply the CSS variables on `<html>` via `className`:
```tsx
<html lang="he" dir="rtl" className={`${heebo.variable} ${suezOne.variable}`}>
```

---

## 4. Quiz Screen Inventory

Derived from prototype surfaces. These are the screens Wave 2 must implement — each maps to one or more Next.js route segments.

| Screen | Surface | Route (proposed) | Notes |
|---|---|---|---|
| **Join** | Participant mobile | `/join` or `/[pin]` | PIN entry + profile fields |
| **Lobby** | Participant mobile | `/join/lobby` or `/[pin]/lobby` | Waits for host (sync) or "start" button (async) |
| **Quiz** | Participant mobile | `/[pin]/play` | Timer, question card, answer options, submit |
| **Result** | Participant mobile | `/[pin]/result` | Score circle, stats, leaderboard |
| **Host live — desktop** | Host desktop | `/host/[pin]` | Answer bars, timer, player list, reveal/pause controls |
| **Host live — mobile** | Host mobile | `/host/[pin]` (same route, responsive) | Tabs: live / players |
| **Admin — quiz list** | Admin desktop + mobile | `/admin/quizzes` | Quiz index |
| **Admin — quiz editor** | Admin desktop + mobile | `/admin/quizzes/[quizId]` | Question editor, meta, mode, PIN, branding |
| **Admin — results** | Admin desktop | `/admin/quizzes/[quizId]/results` | Post-session analytics |

### Question Types (from `data.js`)

| Type | `type` value | Description |
|---|---|---|
| Multiple choice (single) | `single` | 2–4 options, one correct |
| Multiple choice (multi) | `multi` | 2–4 options, multiple correct |
| True/false | `truefalse` | 2 options only |
| Image identification | `image` | 2–4 options + image asset |
| Map pin | `map` | Tap on SVG map, `tolerance` radius |

### Join Fields (admin-configurable)
- `phone` — mandatory, fixed, tel input. **PII — never in public payloads.**
- `name` — required text input
- `unit` — optional text
- `team` — optional select from admin-defined list

---

## 5. White-Label Asset Fallback Chain

Two-tier brand overriding — both tiers share the same CSS token system:

```
Tier 1 — Regional brand (per-organization):
  BSY_BRANDS[brand.id].logo  →  e.g. assets/logos/logo_yehuda.png

Tier 2 — Per-quiz custom logo (per-event):
  BSY_QUIZ.customLogo  →  e.g. battalion logo uploaded by admin

Resolution order:
  customLogo ?? brand.logo

Public-facing brand text:
  customLogo present → BSY_QUIZ.customLogoLabel  (e.g. "פלוגה ב׳ · חטיבת הצנחנים")
  customLogo absent  → brand.name                (e.g. "בשביל יהודה")
```

The primary color (`--bsy-active-primary`) is injected at runtime via:
```js
document.documentElement.style.setProperty('--bsy-active-primary', brand.primary);
```
In Next.js, this becomes a Server Component prop passed to a `<BrandProvider>` client component that sets the CSS variable.

---

## 6. Tailwind 4 + shadcn/ui Bridge

### 6.1 How Tailwind 4 theming works
Tailwind 4 reads custom properties from an `@theme` block in `globals.css`. Any CSS var exposed there becomes a Tailwind utility. The design system's `--bsy-*` vars are NOT Tailwind-aware by default.

### 6.2 Required alias mapping

Add this to `app/globals.css` **after** the `@font-face` and `@import "tailwindcss"`:

```css
/* Import brand tokens first */
/* @font-face for BAHamossad (§3.1 above) */
@import "tailwindcss";

/* ── shadcn/ui semantic name bridge ── */
@layer base {
  :root {
    /* shadcn expects these exact var names */
    --background:         var(--bsy-paper);          /* #FAF7F0 */
    --foreground:         var(--bsy-ink);             /* #2A2620 */
    --card:               var(--color-bg-elevated);   /* #FFFFFF */
    --card-foreground:    var(--bsy-ink);
    --popover:            var(--color-bg-elevated);
    --popover-foreground: var(--bsy-ink);
    --primary:            var(--bsy-green-forest);    /* #306030 */
    --primary-foreground: var(--bsy-paper);
    --secondary:          var(--bsy-stone-100);       /* #E5DFD2 */
    --secondary-foreground: var(--bsy-ink);
    --muted:              var(--bsy-stone-50);        /* #F2EEE6 */
    --muted-foreground:   var(--bsy-stone-400);       /* #8A8472 */
    --accent:             var(--bsy-green-bright);    /* #A0C040 */
    --accent-foreground:  var(--bsy-green-forest);
    --destructive:        var(--bsy-error);           /* #A53A2A */
    --destructive-foreground: var(--bsy-paper);
    --border:             var(--color-border);        /* var(--bsy-stone-100) */
    --input:              var(--color-border);
    --ring:               var(--bsy-green-forest);
    --radius:             var(--radius-md);           /* 12px */
  }
}

/* ── Tailwind 4 @theme block — exposes BSY vars as Tailwind utilities ── */
@theme {
  --color-bsy-forest:    #306030;
  --color-bsy-lime:      #A0C040;
  --color-bsy-paper:     #FAF7F0;
  --color-bsy-ink:       #2A2620;
  --color-bsy-brown:     #6E5430;
  --color-bsy-stone-100: #E5DFD2;
  --color-bsy-stone-400: #8A8472;
  --color-bsy-error:     #A53A2A;
  --color-bsy-warn:      #C28A2A;
  --color-bsy-info:      #2A7C9C;

  --font-display: 'BA Hamossad', serif;
  --font-body:    var(--font-heebo), sans-serif;
  --font-hand:    'BA Hamossad', var(--font-suez), serif;

  --radius-pill: 999px;
  --radius-md:   12px;
  --radius-sm:   6px;
}
```

### 6.3 shadcn component customization rules

- **Buttons:** override `border-radius` to `var(--radius-pill)` globally in the button component variant.
- **Background:** shadcn defaults to white — must use `var(--background)` = cream `#FAF7F0`.
- **No blue focus rings:** set `--ring` to `var(--bsy-green-forest)`.
- **No dark mode** in this project — do not add `dark:` variants unless explicitly requested.

---

## 7. Quiz-Specific Component Inventory (Wave 2)

These components are in `_prototype/untitled/project/styles/app.css` and the surface JSX files. They do NOT exist in the website UI kit. Wave 2 must build them from scratch using the design tokens above.

| Component | Source reference | Notes |
|---|---|---|
| `<CodeInput>` | `participant.jsx` JoinScreen | 6 digit-cells, auto-advance, backspace, numeric only |
| `<QuestionCard>` | `participant.jsx` QuizScreen | eyebrow type label, optional image, prompt text |
| `<AnswerOption>` | `participant.jsx` QuizScreen | pill-shaped, selected/correct/wrong/dim states |
| `<MapQuestion>` | `participant.jsx` QuizScreen | SVG tap target, user pin, tolerance ring, correct pin |
| `<TimerBar>` | `participant.jsx`, `host-mobile.jsx` | countdown, warn state at ≤5s (red flash) |
| `<ProgressBar>` | `participant.jsx` QuizScreen | thin bar, `(qIdx+1)/total * 100%` |
| `<FeedbackCard>` | `participant.jsx` QuizScreen | correct/wrong variant, explanation text |
| `<ScoreCircle>` | `participant.jsx` ResultScreen | SVG circle with `strokeDasharray` progress |
| `<Leaderboard>` | `participant.jsx` ResultScreen | ranked rows, "me" highlighted row |
| `<AnswerBars>` | `desktop.jsx`, `host-mobile.jsx` | host-only, vertical bars with % and count |
| `<PlayerList>` | `desktop.jsx`, `host-mobile.jsx` | avatar, name, score, answered/waiting dot |
| `<AdminQuestionEditor>` | `desktop.jsx`, `admin-mobile.jsx` | type pills, prompt textarea, option editor, time/points |
| `<BrandBlock>` | all surfaces | logo + name/tagline, respects customLogo override |

---

## 8. RTL Hard Rules (from SKILL.md)

- `<html lang="he" dir="rtl">` — already set in `app/layout.tsx`. Do not remove.
- All text copy in Hebrew. No English in user-facing strings.
- Use `margin-inline-start` / `padding-inline-start` (not `margin-left`) everywhere.
- `text-align: start` not `text-align: left`.
- Arrow CTAs use `←` (pointing right in RTL = forward). The pattern is `להמשך הסיפור ←`.
- No emoji anywhere in the UI. No colored left-border cards.
- Buttons are pill-shaped (`border-radius: var(--radius-pill)`).
- Headlines use `--font-display` (BA Hamossad) in `--bsy-brown`. Body in `--font-body` in `--bsy-ink`.
- Background is `--bsy-paper` (warm cream), never pure white. White only for elevated cards.

---

## 9. Missing Assets and Open Issues

| Item | Status | Blocker |
|---|---|---|
| Licensed Fontbit fonts (עץ הדעת, קוהרנטי, מקיאטו) | ❌ Not available | Commercial license; BA Hamossad + Heebo + Suez One are placeholders |
| SVG logo masters (all 6) | ❌ PNG only | Can't recolor or scale without rasterization artifacts |
| Golden-hour photography | ❌ Not available | UI kit uses SVG landscape placeholders |
| `illustrations.jsx` map SVG (`JudeaMap`, `MachpelaImg`, `Spark`, `QrMark`) | In prototype only | Must be extracted/ported to `components/illustrations/` in Wave 2 |
| Logo assets in `public/` | Not copied yet | Needed before any UI renders. Copy from `_prototype/untitled/project/assets/logos/` |
| No-emoji CI lint rule | Not implemented | Grep for Unicode emoji codepoints (`\p{Emoji}`) in `app/` and `components/` — add to lint config in Wave 2 |
| `BSY_BRANDS` — currently all brands share same `primary`/`accent` | Prototype simplification | Real implementation may want per-brand primary color (the `--bsy-active-primary` CSS var mechanism already supports it) |
