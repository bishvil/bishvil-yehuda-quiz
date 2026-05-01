# ADR-0011 — Interactive Map Question (MapLibre + react-map-gl)

**Status:** Accepted
**Date:** 2026-05-01
**Deciders:** Wave 3 Phase 2 interactive-map agent

---

## Context

Wave 1/Wave 2 shipped a placeholder "map" question type that rendered a raster
background image and stored the participant's pin and the correct target as
percentages of the image's bounding rectangle (`pin.x`, `pin.y`, `target.x`,
`target.y`, all `0..100`). Scoring was a Euclidean distance against a `tolerance`
that lived on `questions.tolerance` in the same `0..100` percent scale (see
ADR-0006 §5; the formula is hard-coded in the `submit_answer` PL/pgSQL RPC at
`supabase/migrations/20260430185604_submit_answer_rpc.sql:227-231`).

The percent-of-image approach was always a stub. Wave 3 needs a real
interactive map: participants click anywhere on a pannable, zoomable, Hebrew-
labeled map of Israel and the answer is scored by **geographic distance** in
kilometers against a per-question `target` lat/lng and a `toleranceKm` radius.
The reference behaviour is `https://israel-map-game-two.vercel.app` (Mapbox-
based; we use MapLibre with a near-identical component API via `react-map-gl`
v8.x and its `react-map-gl/maplibre` subpath).

This ADR pins:

- The library, tile source, and Hebrew/RTL strategy.
- The new persisted shape (`map.geo`, `pin_lat`, `pin_lng`, `tolerance_km`).
- How the new geo path **coexists** with the legacy `{x,y}` shape so the parallel
  Wave 3 Phase 2 subtasks (uploads, drag-and-drop) can land their commits
  without typecheck conflicts.
- The cache-privacy contract for the new fields.
- The bundle and SSR posture.

Cross-references:
- ADR-0006 (Answer Submission and Scoring Policy) — supersedes its §5 map
  formula for **questions whose `map.geo` block is set**. The legacy `{x,y}`
  formula in ADR-0006 §5 still applies to questions stored under the legacy
  shape; the integration tail will sunset the legacy path once the editor and
  participant renderer are switched over.
- ADR-0008 (Cache and Privacy Contract) — `map.geo.target` is a forbidden
  public field, parity with `correct_ids`. Server scoring receives the target
  server-side; participant payloads MUST omit `map.geo.target` until the
  question is `revealed`.
- ADR-0010 (Storage Policy for Admin Uploads) — explicitly out-of-scope for
  background imagery on geographic maps; raster background uploads only apply
  to the legacy `{x,y}` map type and are deferred.

---

## Decision

### 1. Library and Tile Source

**Engine:** **MapLibre GL JS** v5.x via **`react-map-gl` v8.x** using the
`react-map-gl/maplibre` subpath import. NOT Mapbox.

Rationale:

- MapLibre GL JS is the BSD-licensed fork of `mapbox-gl-js` v1.13. Same
  WebGL pipeline, same style spec, same RTL plugin protocol. No `mapbox-gl`
  dependency, no Mapbox access token, no MAU pricing cliff.
- `react-map-gl@8.x` exposes a single component surface (`Map`, `Marker`,
  `Source`, `Layer`, `NavigationControl`) that works against either engine
  via subpath imports — `react-map-gl/maplibre` for us. Both `mapbox-gl` and
  `maplibre-gl` are listed as optional peers (`peerDependenciesMeta.optional:
  true`); we install only `maplibre-gl`.
- `react-map-gl/maplibre` Map component documented props we use:
  `mapStyle: string | StyleSpecification`, `initialViewState`, `style`,
  `onClick: (e: MapLayerMouseEvent) => void` (the event exposes
  `event.lngLat.lat` and `event.lngLat.lng`), `onLoad`, `RTLTextPlugin: string`,
  `attributionControl`, `dragRotate`, `ref` (returns a `MapRef` whose
  `getMap()` yields the underlying `maplibregl.Map`).

**Tile source — primary:** **MapTiler free tier** (100k tile loads/month;
requires an API key). The key is a **public** browser-exposed value and lives
in `NEXT_PUBLIC_MAPTILER_KEY`.

**Tile source — fallbacks:**

1. **MapLibre demotiles** (`https://demotiles.maplibre.org/style.json`) — the
   actual no-key default. Public vector tiles hosted by the MapLibre project,
   no API key, no signup. This is what `InteractiveMap` falls back to when
   `NEXT_PUBLIC_MAPTILER_KEY` is unset. Labels are sparse outside major
   cities; suitable for dev visual verification but not for production.
2. **Israel Hiking Map raster tiles** (`https://israelhiking.osm.org.il/Hebrew/Tiles/{z}/{x}/{y}.png`)
   — Hebrew labels native to the source. Attribution required:
   `מפת הטיולים של ישראל © OpenStreetMap`. Opted in via
   `map.geo.styleHint = "israel-hiking"` and overlaid as a `RasterSource`
   on top of the demotiles base.
3. **OSM Liberty (MapTiler-hosted)** — labels in local script (Hebrew in IL).
   Available via `map.geo.styleHint = "osm-liberty"` ONLY when a MapTiler
   key is configured. The maputnik.github.io OSM Liberty style is NOT used as
   a no-key fallback because its `tiles.json` endpoint 403s without a
   MapTiler key (verified during this subtask's visual verification).

Selection logic in `InteractiveMap` (`resolveStyleUrl`):

```ts
const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;

if (styleHint === "osm-liberty" && key) {
  return `https://api.maptiler.com/maps/openstreetmap/style.json?key=${key}`;
}
if (styleHint === "israel-hiking") {
  // Demotiles base; consumer overlays raster source + layer in children.
  return "https://demotiles.maplibre.org/style.json";
}
if (key) {
  return `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`;
}
return "https://demotiles.maplibre.org/style.json";
```

For full Hebrew label coverage in production, deploy a MapTiler key. The
demotiles fallback exists so the dev environment renders cleanly without
provisioning a key.

### 2. Hebrew / RTL

**Mandatory.** Hebrew labels must render right-to-left. The MapLibre RTL plugin
mirrors Mapbox's plugin protocol byte-for-byte and can be loaded once per page.

`react-map-gl/maplibre` exposes the plugin URL as a top-level Map prop:

```tsx
<Map RTLTextPlugin="https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.js" ... />
```

The `InteractiveMap` wrapper sets this prop on every Map instance. Internally,
`react-map-gl` calls `maplibregl.setRTLTextPlugin(url, errorCallback, lazy=true)`
once per page — re-mounts after that no-op. If the prop is `false`, the plugin
is disabled (we never use that path). If the URL fails to load, `react-map-gl`
emits an `error` event but the map still renders (labels just stay LTR — which
is the failure mode we explicitly do NOT accept; CI doesn't catch this so QA
must visually verify).

Acceptance criterion: when `:3002/dev/map-preview` is loaded, Hebrew labels
in the IL bounding box (`lat 29.5..33.5`, `lng 34.2..35.9`) render with letters
flowing right-to-left.

### 3. Default Viewport

Centered on Israel, configurable per-question:

```ts
const DEFAULT_CENTER = { lat: 31.5, lng: 34.9 };
const DEFAULT_ZOOM   = 7;
```

A question may override either via `map.geo.center` and `map.geo.zoom`. The
admin editor's "set default view" button captures the current map camera.

### 4. Interaction Model

- **Single click** places the participant's marker (or moves the existing one).
  Subsequent clicks move it. `react-map-gl/maplibre`'s `Map.onClick` receives a
  `MapLayerMouseEvent` whose `event.lngLat` is `{ lng: number, lat: number }`.
- The map remains pannable, zoomable, and (mobile) pinch-to-zoomable. Drag-
  rotate is disabled (`dragRotate={false}`) because rotation has no semantic
  meaning here and confuses participants who tap with two fingers.
- **Submission is explicit** — the existing answer-submit button drives the
  submit. Clicking the map is purely client-side state; no server call is made
  until the participant taps "שליחת תשובה". This satisfies ADR-0006 §1.
- After submit, the marker is locked (no further click handling). On reveal,
  the correct target marker, a dashed line segment between target and
  participant marker, and the numerical distance are added.
- **`map.locked: true`** opt-in (defer to v2). For v1, every map question is
  freely interactive.

### 5. Scoring (haversine, kilometers)

Replaces the `{x,y}` Euclidean formula in ADR-0006 §5 for any question whose
`map.geo` block is set.

```
distance_km = haversine(pin_lat, pin_lng, target_lat, target_lng, R = 6371)
is_correct  = distance_km <= map.geo.toleranceKm
time_bonus  = is_correct ? floor((deadline_at - submitted_at) / time_seconds * time_max) : 0
score       = is_correct ? base + time_bonus : 0
```

`base` and `time_max` derive from `questions.points` exactly as ADR-0006 §5
Open Q1: `base = floor(points * 2/3)`, `time_max = points - base`.

Implementation:

- TypeScript: `src/lib/scoring.ts` gains `haversineKm(a, b)` and
  `isMapAnswerCorrectGeo(pin, target, toleranceKm)`. The legacy
  `isMapAnswerCorrect(pin{x,y}, target{x,y}, tolerance)` is **kept** so the
  existing `MapQuestion.tsx` component and its tests continue to compile until
  the integration tail removes them.
- Postgres: the `submit_answer` RPC is extended with two new optional
  parameters `p_pin_lat numeric` and `p_pin_lng numeric`. When both are
  non-null AND the question's `map->'geo'` block exists, the RPC computes
  haversine in PL/pgSQL and reads `tolerance_km` from `map->'geo'->>'toleranceKm'`.
  Otherwise the legacy x/y/`questions.tolerance` path runs unchanged. The RPC
  writes the participant's pin to either `answers.pin_lat`/`pin_lng` (geo) or
  `answers.pin_x`/`pin_y` (legacy).
- Reveal payload: `{ targetLat, targetLng, distanceKm, toleranceKm }` returned
  in the participant state response only when `question.status == 'revealed'`,
  per ADR-0008 §2.

Per-tolerance partial credit is **out of scope for v1** — binary correct /
incorrect, with the standard time bonus on a correct answer.

### 6. Persisted Schema

#### 6.1 `questions.map` JSON (additive)

The existing top-level `image_url` and `target.{x,y}` keys are preserved for
back-compat. A new optional `geo` block is added:

```ts
type StoredQuestionMap = {
  image_url?: string;                // legacy: raster background URL
  target?: { x: number; y: number };  // legacy: % of bounding rect
  geo?: {
    target: { lat: number; lng: number };
    center?: { lat: number; lng: number };
    zoom?: number;            // 1..18
    toleranceKm: number;      // 0.05 .. 500
    styleHint?: "maptiler-streets" | "israel-hiking" | "osm-liberty";
  };
};
```

The validator at `src/lib/schemas/question-content.ts` is widened to permit
`geo` while remaining permissive about whether the legacy `image_url` is
present (it isn't required when `geo` is set). The `validateStoredQuestionContent`
function will accept a question of `type: 'map'` if **either** the legacy block
or the geo block is fully populated.

#### 6.2 `questions.tolerance` (legacy, retained)

Stays `numeric(6,3)` with the existing `0 < tolerance <= 100` CHECK. Used only
by the legacy %-based path. The geo path uses `map.geo.toleranceKm` from JSON
instead, so we don't need a separate `tolerance_km` column.

#### 6.3 `answers.pin_lat`, `answers.pin_lng` (additive)

Added as nullable `numeric(8,5)` (lat, range −90..90) and `numeric(9,5)` (lng,
range −180..180). The existing `pin_x` and `pin_y` columns stay nullable and
unchanged; an answer row populates exactly one pair.

A new CHECK constraint asserts:
- `pin_lat` between −90 and 90
- `pin_lng` between −180 and 180
- the (lat,lng) pair and the (x,y) pair are not both populated on the same row

#### 6.4 Why additive, not destructive

If we collapsed `map.target` from `{x,y}` → `{lat,lng}` and dropped
`pin_x`/`pin_y`, the parallel subtasks would type-error in their working trees
because:

- `src/components/admin/QuestionEditor.tsx` lines 113-175 read
  `question.map?.target.x` / `.y`.
- `src/components/participant/MapQuestion.tsx` reads `pin: {x,y}` and
  `target: {x,y}`.

The coordinator directive on this task forbids editing those two files, and
the playbook's per-commit CI gate (`pnpm typecheck && pnpm lint && pnpm test &&
pnpm build`) would reject the migration commit. The additive shape lets the
geo path land in this subtask AND lets the integration tail remove the legacy
fields in a single follow-up commit once the editor and participant renderer
are switched.

### 7. SSR / Bundle / Lazy Loading

`maplibre-gl` instantiates a WebGL context on construction. It cannot run in
Node, so every map component **must** be loaded with `next/dynamic` and
`ssr: false`. Direct imports will fail Next 16 production builds.

Pattern (used in `MapQuestionInteractive` and `MapQuestionEditor`):

```tsx
import dynamic from "next/dynamic";

const InteractiveMap = dynamic(
  () => import("@/src/components/map/InteractiveMap").then(m => m.InteractiveMap),
  { ssr: false, loading: () => <MapSkeleton /> },
);
```

Bundle impact: `maplibre-gl@5.24` + `react-map-gl@8.1` add roughly **750 kB
gzipped** to the route graph. Mitigation:

- The dynamic import keeps it out of the participant join-and-lobby bundles.
  Routes that never render a map question pay zero.
- The CSS file `maplibre-gl/dist/maplibre-gl.css` is imported from inside the
  dynamic module. App Router code-splits CSS imports following the same module
  boundary, so the CSS only ships on routes that hydrate `InteractiveMap`.
- The shared wrapper memoizes `mapStyle` so the engine never reloads the style
  on prop changes that don't actually move the camera.

### 8. Privacy / ADR-0008 Compliance

The new geo fields slot into ADR-0008 §2's forbidden-public-field rules:

| Field | Public payload? | Why |
|---|---|---|
| `map.geo.target` | **forbidden** | Reveals correct location. Server-only until `revealed`. |
| `map.geo.center` | allowed | Camera default, not the answer. |
| `map.geo.zoom` | allowed | Camera default, not the answer. |
| `map.geo.toleranceKm` | allowed | Public — same posture as the legacy `tolerance` field. |
| `map.geo.styleHint` | allowed | Style preference, not the answer. |
| `answers.pin_lat`, `answers.pin_lng` | private (per-user) | Same posture as `pin_x/y`. |

The participant state route at `app/api/participant/[pin]/state/route.ts` and
the host live route at `app/api/host/[pin]/live/route.ts` already strip
`map.target` and `correct_ids` for non-reveal payloads; the same code path
will strip `map.geo.target`. The reveal payload's `mapTarget` field becomes a
union of `{x,y} | {lat,lng} | null` — consumers branch on key presence.

### 9. Testing Strategy

- **Unit (math):** `tests/unit/scoring.test.ts` gains haversine cases:
  Tel Aviv (32.0853, 34.7818) ↔ Jerusalem (31.7683, 35.2137) ≈ **54 km**;
  identical points → 0 km; antipodal points (0,0) ↔ (0,180) → ≈ 20 015 km.
- **Unit (scoring):** `isMapAnswerCorrectGeo` boundary cases — exactly at the
  tolerance, just inside, just outside.
- **Component (hook-level):** `tests/unit/map-question-editor.test.tsx`
  exercises the click→state hook (`useMapMarkerState`) without rendering
  WebGL — the hook is extracted from the component and tested in isolation.
  Rendering `InteractiveMap` in jsdom would require a WebGL polyfill which
  is not worth the dependency (and `react-map-gl`'s own test suite uses the
  same separation).
- **E2E (deferred):** Playwright cannot drive WebGL clicks deterministically
  on headless Chrome without a flag; deferred to a later wave.

### 10. Component Inventory

- `src/components/map/InteractiveMap.tsx` — shared MapLibre wrapper. Sets the
  RTL plugin, renders the `Map` from `react-map-gl/maplibre`, accepts
  `onMarkerPlace(lat, lng)`, optional `markers: Array<{lat, lng, color, key}>`,
  optional `paths: Array<[{lat, lng}, {lat, lng}]>` (for the reveal segment),
  controlled `viewState` plus `onMove`, and a `disabled` flag (for post-
  submission lock).
- `src/components/map/useMapMarkerState.ts` — pure hook that owns the marker
  placement state machine. Consumed by both editor and participant component.
  Testable without a WebGL context.
- `src/components/MapQuestionInteractive.tsx` — participant view. Renders the
  question prompt + `InteractiveMap` with click-to-place. Self-contained; the
  integration tail wires it into the existing `participant/play-screen.tsx`.
- `src/components/admin/MapQuestionEditor.tsx` — admin authoring. Click-to-set
  target, draggable target marker (`Marker draggable onDragEnd`), tolerance
  slider with log-scale 0.1..500 km, "Use current view as default" button.
  Self-contained; the integration tail wires it into `QuestionEditor.tsx`.

A dev-only sandbox at `app/dev/map-preview/page.tsx` is added to allow visual
verification on `:3002` without going through the full quiz lifecycle. It is
**not** authentication-gated and renders only static fixture data; the
integration tail is free to remove it.

### 11. Migration Plan

`supabase/migrations/<ts>_map_geo_answers.sql`:

```sql
-- ANSWERS: add lat/lng columns and a CHECK guarding pair-exclusivity.
alter table public.answers
  add column pin_lat numeric(8,5),
  add column pin_lng numeric(9,5);

alter table public.answers
  add constraint answers_pin_geo_range_check
  check (
    (pin_lat is null or (pin_lat >= -90 and pin_lat <= 90))
    and (pin_lng is null or (pin_lng >= -180 and pin_lng <= 180))
  ) not valid;

alter table public.answers
  add constraint answers_pin_pair_exclusive_check
  check (
    -- Either the legacy %-pair, OR the geo pair, but not both populated.
    not (
      (pin_x is not null or pin_y is not null)
      and (pin_lat is not null or pin_lng is not null)
    )
  ) not valid;

alter table public.answers validate constraint answers_pin_geo_range_check;
alter table public.answers validate constraint answers_pin_pair_exclusive_check;

-- The `submit_answer` RPC is replaced (next migration file in the same
-- commit) with a signature that accepts p_pin_lat / p_pin_lng and routes
-- the scoring path on the basis of which pair is supplied.
```

The RPC migration drops the previous function signature (PostgreSQL allows
overloading by argument types so we drop the explicit old signature
`submit_answer(uuid, uuid, uuid, text[], numeric, numeric)` and re-create
with the extended six-numeric signature). The RPC is the only consumer of
`questions.tolerance` for the legacy path and of `map->'geo'->>'toleranceKm'`
for the new path; both are read inside the function.

### 12. Open Questions

1. **Style hint surface.** The `styleHint` enum is a v1 escape hatch; we keep
   it minimal until we see real authoring patterns. Adding a new style
   requires a one-line change in `resolveStyleUrl`.
2. **Map clustering on the host live view** — out of scope; the host live
   route currently shows a static raster summary and is not blocked by this
   ADR.
3. **Sunset of the legacy `{x,y}` path.** Once the integration tail wires
   the new components into `QuestionEditor` and `play-screen`, a follow-up
   ADR (or a §amendment to this one if appropriate) should document removing
   the `image_url` / `target.{x,y}` keys, the `pin_x` / `pin_y` columns, and
   the `MapQuestion.tsx` component. This subtask deliberately defers that to
   keep the parallel Wave 3 commits compatible.

---

## Consequences

- New runtime dependency surface: `maplibre-gl@^5.24`, `react-map-gl@^8.1`,
  `@types/geojson@^7946`. Roughly +750 kB gzipped on routes that mount the
  map.
- A new env variable, `NEXT_PUBLIC_MAPTILER_KEY`, is documented but not
  required. Without it, the wrapper falls back to OSM Liberty so the dev
  environment still renders cleanly.
- The participant-state and host-live routes pass `map.geo` through (minus
  `target`) on the same code path as today's `map.image_url`.
- The `submit_answer` RPC has two new optional parameters and two new code
  paths; the legacy path is preserved bit-for-bit.
- Test coverage for haversine and the geo scoring path lands in this
  subtask; e2e is deferred.
- The dev-only `app/dev/map-preview/page.tsx` is committed for visual QA
  and is fair game for the integration tail to delete or move.
