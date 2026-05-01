# Wave 3 Phase 2 — Interactive Map Question Integration Brief

This brief is for the **integration-tail subtask** that wires the
already-shipped interactive-map components into the master `QuestionEditor`
and the participant `play-screen`. The interactive-map subtask (4b) shipped
everything except those two file edits because the parallel uploads (4) and
DnD (5) subtasks would have conflicted on the same files.

The integration tail must:

1. Wire the admin authoring component into `QuestionEditor.tsx` for
   `type === 'map'` questions.
2. Wire the participant interactive component into `app/[pin]/play/play-screen.tsx`
   so it renders for `map.geo` questions.
3. Provision the optional `NEXT_PUBLIC_MAPTILER_KEY` env variable.
4. Optionally remove the dev sandbox at `app/dev/map-preview/`.
5. Optionally remove the legacy `MapQuestion.tsx` and `pin_x` / `pin_y`
   columns once the new path is fully wired (separate follow-up commit).

The relevant ADR is **[ADR-0011](../decisions/ADR-0011-interactive-map.md)**.
The new shape is **additive** — both legacy `{x,y}` and new `{lat,lng}`
paths coexist, so this brief is non-destructive: the integration tail can
pick a question type rather than migrating every `map` question.

---

## 1. What's already shipped (DO NOT re-implement)

- `src/components/map/InteractiveMap.tsx` — shared MapLibre wrapper. RTL
  plugin, click→`{lat,lng}` adapter, draggable Markers, GeoJSON reveal
  segment.
- `src/components/map/useMapMarkerState.ts` — pure marker state machine.
- `src/components/MapQuestionInteractive.tsx` — participant view.
- `src/components/admin/MapQuestionEditor.tsx` — admin authoring.
- `src/lib/scoring.ts` — `haversineKm`, `isMapAnswerCorrectGeo`.
- `src/lib/schemas/question-content.ts` — accepts `map.geo` block.
- `src/lib/admin/validation.ts` — accepts geo `mapSchema` discriminated union.
- `src/lib/auth/validation.ts` — accepts `pin: { lat, lng }` submissions.
- `src/lib/sessions/participant-payload.ts` — public-safe payload widened
  to carry `map.geo` (target stripped) and `extractMapGeoTarget` helper.
- DB migrations:
  `supabase/migrations/20260501065640_map_geo_answers.sql`
  `supabase/migrations/20260501065641_submit_answer_geo.sql`
- App:
  `app/api/quiz/[pin]/question/[qIdx]/route.ts` — public payload shape.
  `app/api/participant/[pin]/state/route.ts` — reveal includes `mapGeoTarget`.
  `app/api/session/[pin]/answer/route.ts` — RPC arg branch on pin shape.
- Dev sandbox: `app/dev/map-preview/` (unauthenticated, fixture-only).

---

## 2. Editor wiring — `src/components/admin/QuestionEditor.tsx`

The current file (lines 113-175) inlines a `map.image_url + target.{x,y}`
fieldset for the legacy raster shape. Replace that branch with a render of
`MapQuestionEditor` whenever the editable question's `map` either has the
`geo` block or is missing entirely (new map question — default to geo).

### 2.1 Imports

Add near the existing imports at the top of `QuestionEditor.tsx`:

```tsx
import {
  MapQuestionEditor,
  defaultMapQuestionGeoDraft,
  type MapQuestionGeoDraft,
} from "@/src/components/admin/MapQuestionEditor";
```

### 2.2 Replace the inline `map`-type block

Locate the block:

```tsx
{question.type === "map" ? (
  <Field label="מפה ויעד">
    <div className="rounded-md border border-bsy-stone-200 bg-white p-3">
      <input ... />        {/* image_url */}
      <NumberField ... />  {/* target.x */}
      <NumberField ... />  {/* target.y */}
      <NumberField label="סובלנות (%)" ... />
    </div>
  </Field>
) : null}
```

Replace it with:

```tsx
{question.type === "map" ? (
  <Field label="מפה ויעד">
    <MapQuestionEditor
      value={readMapGeoDraft(question)}
      onChange={(next) => update(writeMapGeoDraft(next))}
    />
  </Field>
) : null}
```

`update` is the existing `useCallback` declared a few lines above. The two
helpers below convert between `EditableQuestion["map"]` and the editor's
`MapQuestionGeoDraft`. Add them near the bottom of `QuestionEditor.tsx`:

```ts
function readMapGeoDraft(q: EditableQuestion): MapQuestionGeoDraft | null {
  const geo = q.map?.geo;
  if (!geo) return null;
  return {
    target: { lat: geo.target.lat, lng: geo.target.lng },
    toleranceKm: geo.toleranceKm,
    center: geo.center,
    zoom: geo.zoom,
    styleHint: geo.styleHint,
  };
}

function writeMapGeoDraft(
  next: MapQuestionGeoDraft,
): Partial<EditableQuestion> {
  // ADR-0011 §6.4: do not also write the legacy {x,y} target keys; the
  // pair-exclusivity CHECK on `answers` is mirrored by the
  // `questions_map_payload_present_check` on questions.
  return {
    map: {
      geo: {
        target: next.target,
        toleranceKm: next.toleranceKm,
        center: next.center,
        zoom: next.zoom,
        styleHint: next.styleHint,
      },
    },
    tolerance: null, // The geo path uses map.geo.toleranceKm, not the column.
  };
}
```

### 2.3 Type widening on `EditableQuestion`

The current `EditableQuestion["map"]` type in
`src/lib/admin/quiz-editor.ts` is the legacy `{ image_url, target: {x,y} }`
shape only. Widen it to a discriminated union mirroring the validator:

```ts
export type EditableQuestionMap =
  | { image_url: string; target: { x: number; y: number }; geo?: never }
  | {
      image_url?: never;
      target?: never;
      geo: {
        target: { lat: number; lng: number };
        center?: { lat: number; lng: number };
        zoom?: number;
        toleranceKm: number;
        styleHint?: "maptiler-streets" | "israel-hiking" | "osm-liberty";
      };
    };
```

Audit `normalizeQuestionForType` in `src/lib/admin/quiz-editor.ts` and the
PUT-payload builder in `app/admin/quizzes/[quizId]/quiz-editor-screen.tsx`
(approx. lines 145-180): on a type-switch into `'map'` from anything else,
default to the geo block via `defaultMapQuestionGeoDraft()`.

### 2.4 Default the new map type to geo

In `normalizeQuestionForType`, change the `'map'` arm so a freshly-typed
map question defaults to a geo draft:

```ts
case "map": {
  return {
    ...stripped,
    type: "map",
    map: {
      geo: {
        target: { lat: 31.5, lng: 34.9 },
        toleranceKm: 5,
      },
    },
    tolerance: null,
    options: null,
    correctIds: null,
    imageUrl: null,
  };
}
```

The legacy raster shape stays available for an explicit "raster mode"
button if you decide to keep it; the simpler v1 is to default to geo and
hide the legacy authoring path entirely.

---

## 3. Participant renderer wiring — `app/[pin]/play/play-screen.tsx`

The current `renderMapQuestion` helper (around line 356 of
`play-screen.tsx`) renders the legacy `MapQuestion` component using
`question.map.image_url` + `question.tolerance`. Branch on `map.geo` and
render `MapQuestionInteractive` instead when the geo block is present.

### 3.1 Imports

Add to the import block:

```tsx
import dynamic from "next/dynamic";

const MapQuestionInteractive = dynamic(
  () =>
    import("@/src/components/MapQuestionInteractive").then(
      (m) => m.MapQuestionInteractive,
    ),
  { ssr: false },
);
```

(Already dynamic-imported inside `MapQuestionInteractive`, but a second
dynamic import here keeps the route-level chunk graph tidy.)

### 3.2 Branch in `renderMapQuestion`

```tsx
function renderMapQuestion({
  question,
  mapPin,
  mapGeoPin, // NEW — see §3.3 for state plumbing
  isRevealed,
  mapTarget,
  mapGeoTarget, // NEW — comes from reveal payload
  onPin,
  onGeoPin,
}: RenderMapArgs) {
  // Geographic path — ADR-0011 §5.
  if (question.map && "geo" in question.map && question.map.geo) {
    return (
      <MapQuestionInteractive
        geo={question.map.geo}
        pin={mapGeoPin}
        onPin={onGeoPin}
        revealed={isRevealed}
        target={isRevealed ? mapGeoTarget : null}
      />
    );
  }

  // Legacy raster path — kept verbatim.
  const mapMeta = extractMapMeta(question.map);
  if (!mapMeta) {
    return (
      <div className="...">מפת השאלה חסרה. צרו קשר עם המארגנים.</div>
    );
  }
  // ... existing MapQuestion render unchanged
}
```

### 3.3 New state shape

Add a parallel `{lat,lng} | null` pin alongside the existing `{x,y} | null`
pin in `play-screen.tsx`. The two are mutually exclusive per question;
the pair-exclusivity DB CHECK enforces it server-side.

```tsx
const [mapPin, setMapPin] = useState<{ x: number; y: number } | null>(null);
const [mapGeoPin, setMapGeoPin] = useState<{ lat: number; lng: number } | null>(null);
```

When the participant taps "שליחת תשובה", branch the body:

```tsx
const submitPayload = mapGeoPin
  ? { questionId: question.id, pin: { lat: mapGeoPin.lat, lng: mapGeoPin.lng } }
  : mapPin
    ? { questionId: question.id, pin: { x: mapPin.x, y: mapPin.y } }
    : null;
```

Reset both pins on question advance so a stale value doesn't carry over.

### 3.4 Reveal payload

The reveal block in the participant state response now carries both
`mapTarget` (legacy) and `mapGeoTarget` (geo) — exactly one is set per
revealed question. Pull the right one based on the question's `map.geo`
presence and pass it into the renderer.

---

## 4. Environment variable

Document and provision `NEXT_PUBLIC_MAPTILER_KEY` (browser-exposed,
public — MapTiler keys are designed to be embedded; rate limits and
referer pinning are how you protect them).

### 4.1 `.env.example`

Add a new line in the public section:

```
NEXT_PUBLIC_MAPTILER_KEY=
```

### 4.2 `ecosystem.config.js`

Add to the `bishvil-yehuda` entry's `env` block on
`/home/ubuntu/projects/ecosystem.config.js`:

```js
NEXT_PUBLIC_MAPTILER_KEY: 'YOUR_KEY_HERE',
```

The wrapper falls back to the public MapLibre demotiles style when this
is unset, so the integration commit can land before the key is
provisioned. **However**, the demotiles style ships English labels only
— Hebrew RTL label rendering is not visually verifiable until a real
MapTiler key is configured (see `MID NOTE #2` on the parent task).

### 4.3 Production note

When the cloud Supabase project is linked and Vercel deploy comes online,
the same env var must be set in the Vercel project's "Production" and
"Preview" envs.

---

## 5. Dev sandbox cleanup (optional)

`app/dev/map-preview/` was committed for visual QA. It's unauthenticated
but renders only fixture data. Three options:

- **Keep** as-is — useful for future MapLibre debugging.
- **Move** to `app/admin/(dev)/map-preview/` to gate behind admin auth
  while keeping the visual surface.
- **Delete** in the integration commit once `MapQuestionEditor` itself
  exposes a comparable preview through the master `QuestionEditor`.

Whichever you pick, please document in your commit message.

---

## 6. Sunsetting the legacy `{x,y}` path (separate follow-up)

Once §2 and §3 are wired and at least one full quiz round has been
field-tested with the geo path, a follow-up subtask should:

1. Remove `src/components/participant/MapQuestion.tsx` and the
   `renderMapQuestion` legacy branch in `play-screen.tsx`.
2. Remove the inline raster authoring code from `QuestionEditor.tsx`
   (the §2 wiring already replaces it for new questions, but the union
   type still permits the legacy shape to be edited).
3. Drop columns `answers.pin_x`, `answers.pin_y`, and `questions.tolerance`
   in a fresh migration (keep their CHECK constraints in the same drop).
4. Tighten `storedQuestionMapSchema` to require the `geo` block.
5. Tighten `submit_answer` RPC to drop `p_pin_x` / `p_pin_y` parameters.
6. Update ADR-0011 §11 (it currently lists this as the open question).
7. Supersede the relevant clauses of ADR-0006 §5.

This is **not part of the integration tail** — it should land separately
once the new path has run cleanly in production.

---

## 7. Acceptance checklist for the integration tail

- [ ] An admin can create a new map question and see the interactive
      MapLibre editor; click-to-set-target updates the persisted JSON.
- [ ] The tolerance slider's persisted value matches the slider readout.
- [ ] A participant on a `live` session with a map question sees the
      MapLibre map render (not the legacy raster) and can place a pin.
- [ ] Submission writes `pin_lat` + `pin_lng` (verify via Studio at
      `localhost:54323`) and the haversine scoring runs.
- [ ] Reveal shows the participant pin, the target pin, and a dashed
      line between them. Distance text reads correctly in km.
- [ ] Hebrew labels render right-to-left when a `NEXT_PUBLIC_MAPTILER_KEY`
      is set (the keyless demotiles fallback only ships English labels —
      see `MID NOTE #2`).
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green.
- [ ] No regressions in the existing legacy raster `map` question type.
