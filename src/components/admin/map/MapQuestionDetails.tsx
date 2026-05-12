"use client";

import type { LatLng } from "@/src/components/map/InteractiveMap";

interface MapQuestionDetailsProps {
  target: LatLng;
  center?: LatLng;
  zoom?: number;
  onUseCurrentView: () => void;
  onResetView: () => void;
}

export function MapQuestionDetails({
  target,
  center,
  zoom,
  onUseCurrentView,
  onResetView,
}: MapQuestionDetailsProps) {
  return (
    <div className="grid grid-cols-2 gap-2 text-[12px]">
      <div className="rounded-md border border-bsy-stone-200 bg-white px-3 py-2">
        <div className="font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
          יעד (lat / lng)
        </div>
        <div className="font-mono text-[13px] text-bsy-ink" dir="ltr">
          {target.lat.toFixed(5)}, {target.lng.toFixed(5)}
        </div>
      </div>
      <div className="rounded-md border border-bsy-stone-200 bg-white px-3 py-2">
        <div className="font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
          ברירת מחדל לתצוגה
        </div>
        <div className="flex items-center justify-between gap-2">
          {center && zoom !== undefined ? (
            <span className="font-mono text-[13px] text-bsy-ink" dir="ltr">
              {center.lat.toFixed(2)}, {center.lng.toFixed(2)} @ {zoom}
            </span>
          ) : (
            <span className="text-bsy-stone-400">ברירת מחדל ארצית</span>
          )}
          <div className="flex gap-1">
            <button
              type="button"
              className="rounded-md border border-bsy-stone-200 px-2 py-1 text-[11px] hover:border-bsy-forest"
              onClick={onUseCurrentView}
            >
              השתמש במבט הנוכחי
            </button>
            {center ? (
              <button
                type="button"
                className="rounded-md border border-bsy-stone-200 px-2 py-1 text-[11px] text-bsy-stone-700 hover:border-bsy-error hover:text-bsy-error"
                onClick={onResetView}
              >
                איפוס
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
