/**
 * Mean Earth radius in km used by the haversine formula. The MapLibre /
 * Mapbox style spec also assumes a spherical earth at 6371 km, so we are
 * dimensionally consistent with the renderer's projection.
 */
export const EARTH_RADIUS_KM = 6371;

/** WGS-84 lat/lng pair, in degrees. */
export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Great-circle distance in kilometres between two WGS-84 points using
 * the haversine formula (ADR-0011 §5). The `Math.asin(Math.min(1, …))`
 * clamps the radicand so antipodal points where floating-point error
 * pushes it fractionally above 1 still return ~πR rather than NaN.
 *
 * Authoritative scoring (correctness, partial-credit ratio, time bonus)
 * lives in the `submit_answer` RPC (ADR-0006). This module is kept
 * deliberately small to avoid drift; it exists for the host live
 * route's "X km from target" label.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
