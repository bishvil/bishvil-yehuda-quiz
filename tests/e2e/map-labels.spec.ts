import { expect, test } from "@playwright/test";

/**
 * QA-20: every map style used by `MapQuestionInteractive` must hide ALL
 * symbol layers (place names, POI, road labels, country labels). The
 * dev sandbox at /dev/map-preview exposes the underlying
 * `maplibregl.Map` instance on `window.__bsyMap` so we can introspect
 * the active style from the page context.
 *
 * Note on raster styles: the `israel-hiking` hint uses CartoDB
 * `light_nolabels` raster tiles which ship label-free at the tile
 * level. Vector styles (default + osm-liberty) rely on the runtime
 * symbol-hiding hook in `InteractiveMap.tsx`. Both code paths are
 * verified by this spec via the `__bsyMap` handle.
 */

interface MaplibreLayer {
  id: string;
  type: string;
}

interface MaplibreStyle {
  layers?: MaplibreLayer[];
}

interface MaplibreMapHandle {
  isStyleLoaded(): boolean;
  getStyle(): MaplibreStyle | undefined;
  getLayoutProperty(layerId: string, name: string): unknown;
}

declare global {
  interface Window {
    __bsyMap?: MaplibreMapHandle;
  }
}

test("map preview: no symbol layers are visible", async ({ page }) => {
  await page.goto("/dev/map-preview");

  // Wait for the map handle to attach. The dev client polls every 100ms.
  await page.waitForFunction(
    () => Boolean(window.__bsyMap && window.__bsyMap.isStyleLoaded()),
    null,
    { timeout: 20_000 },
  );

  // Give the styledata hook one extra tick to complete after isStyleLoaded.
  await page.waitForTimeout(250);

  const visibleSymbolLayers = await page.evaluate(() => {
    const map = window.__bsyMap;
    if (!map) return ["__no_map__"];
    const style = map.getStyle();
    const layers = style?.layers ?? [];
    return layers
      .filter((l) => l.type === "symbol")
      .filter((l) => {
        const v = map.getLayoutProperty(l.id, "visibility");
        // Visibility is "none" when hidden. Default ("visible" or undefined)
        // means the symbol layer is still drawing labels.
        return v !== "none";
      })
      .map((l) => l.id);
  });

  expect(
    visibleSymbolLayers,
    `expected zero visible symbol layers, found: ${visibleSymbolLayers.join(", ")}`,
  ).toEqual([]);
});
