"use client";

import { useEffect, useRef } from "react";

import {
  InteractiveMap,
  type InteractiveMapHandle,
} from "@/src/components/map/InteractiveMap";
import { useMapMarkerState } from "@/src/components/map/useMapMarkerState";

/**
 * Client island for the dev preview. Owns the click→state machine and
 * passes a single marker into the shared wrapper. The fixture target is
 * Tel Aviv-Jaffa city hall (32.0853, 34.7818).
 */
export function MapPreviewClient() {
  const pin = useMapMarkerState();
  const mapHandleRef = useRef<InteractiveMapHandle>(null);

  // QA-20: expose the underlying maplibregl.Map on `window` so the
  // Playwright spec at tests/e2e/map-labels.spec.ts can assert that no
  // symbol layers remain visible. Dev sandbox only — never mounted by
  // production routes (see comment in app/dev/map-preview/page.tsx).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = window.setInterval(() => {
      const map = mapHandleRef.current?.getMap();
      if (map) {
        (window as unknown as { __bsyMap?: unknown }).__bsyMap = map;
      }
    }, 100);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="relative h-full w-full">
      <InteractiveMap
        ref={mapHandleRef}
        exposeRef
        ariaLabel="ארגז חול — מפה אינטראקטיבית"
        onMapClick={pin.place}
        markers={
          pin.position
            ? [
                {
                  key: "user-pin",
                  position: pin.position,
                  color: "#a23b3b",
                  ariaLabel: "סימון המשתמש",
                },
              ]
            : []
        }
      />
      <div
        dir="rtl"
        className="pointer-events-none absolute inset-x-0 bottom-2 z-10 flex justify-center"
      >
        {pin.position ? (
          <span className="pointer-events-auto rounded-full bg-bsy-ink/85 px-3 py-1 font-mono text-[11px] text-bsy-paper">
            lat {pin.position.lat.toFixed(4)} · lng {pin.position.lng.toFixed(4)}
          </span>
        ) : (
          <span className="pointer-events-auto rounded-full bg-bsy-ink/70 px-3 py-1 text-[11px] text-bsy-paper">
            הקש על המפה כדי להניח סיכה
          </span>
        )}
      </div>
    </div>
  );
}
