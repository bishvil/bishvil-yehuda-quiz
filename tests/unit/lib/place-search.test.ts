import { afterEach, describe, expect, it, vi } from "vitest";

import { searchMapPlaces } from "@/src/lib/maps/place-search";

describe("searchMapPlaces", () => {
  const originalMaptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;

  afterEach(() => {
    process.env.NEXT_PUBLIC_MAPTILER_KEY = originalMaptilerKey;
    vi.unstubAllGlobals();
  });

  it("uses bounded Nominatim search without a hard country code filter", async () => {
    delete process.env.NEXT_PUBLIC_MAPTILER_KEY;
    const fetchMock = vi.fn(async () =>
      Response.json([
        {
          place_id: 1,
          name: "כרמי צור",
          lat: "31.6092",
          lon: "35.1014",
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const results = await searchMapPlaces("כרמי צור");

    expect(results).toEqual([
      { id: "1", name: "כרמי צור", lat: 31.6092, lng: 35.1014 },
    ]);
    const calls = fetchMock.mock.calls as unknown as Array<[string]>;
    const url = String(calls[0]?.[0]);
    expect(url).toContain("nominatim.openstreetmap.org/search");
    expect(url).not.toContain("countrycodes=");
  });

  it("queries MapTiler first when a public key is configured", async () => {
    process.env.NEXT_PUBLIC_MAPTILER_KEY = "test-key";
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.maptiler.com")) {
        return Response.json({
          features: [
            {
              id: "mt-1",
              text_he: "שדמות מחולה",
              geometry: { coordinates: [35.5322, 32.3478] },
            },
          ],
        });
      }
      return Response.json([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await searchMapPlaces("שדמות מחולה");

    const calls = fetchMock.mock.calls as unknown as Array<[string]>;
    expect(String(calls[0]?.[0])).toContain("api.maptiler.com");
    expect(results[0]).toEqual({
      id: "mt-1",
      name: "שדמות מחולה",
      lat: 32.3478,
      lng: 35.5322,
    });
  });
});

describe("place search recovery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("reports network failure rather than pretending no places matched", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await expect(searchMapPlaces("ירושלים")).rejects.toThrow(
      "temporarily unavailable",
    );
  });
  it("still uses a working fallback when the first provider fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.maptiler.com"))
          throw new Error("temporarily unavailable");
        return Response.json([
          { place_id: 2, name: "ירושלים", lat: "31.7767", lon: "35.2345" },
        ]);
      }),
    );
    expect(await searchMapPlaces("ירושלים")).toEqual([
      { id: "2", name: "ירושלים", lat: 31.7767, lng: 35.2345 },
    ]);
  });
});
