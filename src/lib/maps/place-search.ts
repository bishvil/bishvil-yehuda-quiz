export interface PlaceSearchResult {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

const ISRAEL_AREA_BBOX = {
  west: 33.8,
  south: 29.3,
  east: 36.0,
  north: 33.5,
} as const;

const RESULT_LIMIT = 8;

export async function searchMapPlaces(
  query: string,
): Promise<PlaceSearchResult[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) return [];

  const results: PlaceSearchResult[] = [];

  for (const provider of [searchMapTilerPlaces, searchNominatimPlaces]) {
    const providerResults = await provider(normalizedQuery).catch(() => []);
    results.push(...providerResults);
    if (results.length >= RESULT_LIMIT) break;
  }

  return mergePlaceResults(results).slice(0, RESULT_LIMIT);
}

async function searchMapTilerPlaces(
  query: string,
): Promise<PlaceSearchResult[]> {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (!key) return [];

  const params = new URLSearchParams({
    key,
    language: "he,en",
    bbox: [
      ISRAEL_AREA_BBOX.west,
      ISRAEL_AREA_BBOX.south,
      ISRAEL_AREA_BBOX.east,
      ISRAEL_AREA_BBOX.north,
    ].join(","),
    limit: String(RESULT_LIMIT),
    autocomplete: "true",
    fuzzyMatch: "true",
    worldview: "default",
  });

  const response = await fetch(
    `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?${params.toString()}`,
  );
  if (!response.ok) throw new Error("MapTiler place search failed");

  const data = (await response.json()) as {
    features?: Array<{
      id?: string;
      text?: string;
      text_he?: string;
      place_name?: string;
      center?: [number, number];
      geometry?: { coordinates?: [number, number] };
    }>;
  };

  return (data.features ?? [])
    .map((feature, index): PlaceSearchResult | null => {
      const coordinates = feature.center ?? feature.geometry?.coordinates;
      const lng = coordinates?.[0];
      const lat = coordinates?.[1];
      if (
        typeof lat !== "number" ||
        typeof lng !== "number" ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
      ) {
        return null;
      }
      return {
        id: feature.id ?? `maptiler-${index}`,
        name:
          feature.text_he ?? feature.text ?? feature.place_name ?? "מיקום במפה",
        lat,
        lng,
      };
    })
    .filter((result): result is PlaceSearchResult => result !== null);
}

async function searchNominatimPlaces(
  query: string,
): Promise<PlaceSearchResult[]> {
  const params = new URLSearchParams({
    format: "jsonv2",
    q: query,
    limit: String(RESULT_LIMIT),
    bounded: "1",
    viewbox: [
      ISRAEL_AREA_BBOX.west,
      ISRAEL_AREA_BBOX.north,
      ISRAEL_AREA_BBOX.east,
      ISRAEL_AREA_BBOX.south,
    ].join(","),
    "accept-language": "he,en",
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
  );
  if (!response.ok) throw new Error("Nominatim place search failed");

  const data = (await response.json()) as Array<{
    place_id?: number;
    osm_id?: number;
    display_name?: string;
    name?: string;
    lat?: string;
    lon?: string;
  }>;

  return data
    .map((result, index): PlaceSearchResult | null => {
      const lat = Number(result.lat);
      const lng = Number(result.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        id: String(result.place_id ?? result.osm_id ?? `nominatim-${index}`),
        name:
          result.name ??
          result.display_name?.split(",")[0]?.trim() ??
          "מיקום במפה",
        lat,
        lng,
      };
    })
    .filter((result): result is PlaceSearchResult => result !== null);
}

function mergePlaceResults(results: PlaceSearchResult[]): PlaceSearchResult[] {
  const seen = new Set<string>();
  const merged: PlaceSearchResult[] = [];
  for (const result of results) {
    const key = `${result.name}:${result.lat.toFixed(4)}:${result.lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(result);
  }
  return merged;
}
