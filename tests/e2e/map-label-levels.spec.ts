import { test, expect } from "@playwright/test";

test("settlement label levels and satellite/street switches update map layers without accumulating filters", async ({
  page,
}) => {
  // Deterministic vector style exercises real MapLibre without depending on tile services.
  await page.route("https://tiles.openfreemap.org/styles/liberty", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: 8,
        sources: {
          places: {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          },
        },
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#eee" },
          },
          {
            id: "place-city",
            type: "symbol",
            source: "places",
            filter: ["==", "class", "city"],
          },
          {
            id: "place-village",
            type: "symbol",
            source: "places",
            filter: ["==", "class", "village"],
          },
          { id: "country-label", type: "symbol", source: "places" },
        ],
      }),
    }),
  );
  await page.goto("/dev/map-preview");
  await page.getByRole("combobox", { name: "רקע" }).selectOption("streets");
  await page.getByRole("combobox", { name: "שמות" }).selectOption("major");
  const mapState = () =>
    page.evaluate(() => {
      const map = window.__bsyMap as unknown as
        | {
            isStyleLoaded(): boolean;
            getFilter(id: string): unknown;
            getLayoutProperty(id: string, key: string): unknown;
            getStyle(): { layers: Array<{ id: string }> };
          }
        | undefined;
      if (
        !map?.isStyleLoaded() ||
        !map.getStyle().layers.some((layer) => layer.id === "place-city")
      )
        return null;
      return {
        filter: map.getFilter("place-city"),
        city: map.getLayoutProperty("place-city", "visibility"),
        country: map.getLayoutProperty("country-label", "visibility"),
        background:
          map.getLayoutProperty("background", "visibility") ?? "visible",
      };
    });
  await expect
    .poll(mapState)
    .toMatchObject({ city: "visible", country: "none", background: "visible" });
  const major = await mapState();
  expect(JSON.stringify(major?.filter)).toContain("rank");
  await page.getByRole("combobox", { name: "שמות" }).selectOption("all");
  await expect
    .poll(async () => JSON.stringify((await mapState())?.filter))
    .not.toContain("rank");
  const all = await mapState();
  await page.getByRole("combobox", { name: "רקע" }).selectOption("satellite");
  await expect.poll(mapState).toMatchObject({ background: "none" });
  await page.getByRole("combobox", { name: "רקע" }).selectOption("streets");
  await expect.poll(mapState).toMatchObject({ background: "visible" });
  expect((await mapState())?.filter).toEqual(all?.filter);
  await page.getByRole("combobox", { name: "שמות" }).selectOption("major");
  await expect.poll(mapState).toMatchObject({ filter: major?.filter });
});
