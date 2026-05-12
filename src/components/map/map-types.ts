/** Geographic coordinate. WGS-84 degrees. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Subset of the `react-map-gl` view-state shape we control. */
export interface MapViewState {
  longitude: number;
  latitude: number;
  zoom: number;
}

export type MapStyleHint = "maptiler-streets" | "israel-hiking" | "osm-liberty";
