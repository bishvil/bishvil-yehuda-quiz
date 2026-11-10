"use client";

interface MapToleranceControlProps {
  minKm: number;
  maxKm: number;
  valueKm: number;
  sliderValue: number;
  onSliderChange: (value: number) => void;
  onTextChange: (value: string) => void;
}

export function MapToleranceControl({
  minKm,
  maxKm,
  valueKm,
  sliderValue,
  onSliderChange,
  onTextChange,
}: MapToleranceControlProps) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="text-[12px] font-bold text-bsy-stone-700">
        טווח טעות מותר בתשובת מפה (ק״מ)
      </legend>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={sliderValue}
          onChange={(event) => onSliderChange(Number(event.target.value))}
          aria-label="רדיוס סובלנות בק״מ"
          className="min-h-11 min-w-0 flex-1 accent-bsy-forest"
        />
        <input
          type="number"
          min={minKm}
          max={maxKm}
          step={0.1}
          value={Number(valueKm.toFixed(2))}
          onChange={(event) => onTextChange(event.target.value)}
          className="min-h-11 w-24 rounded-md border border-bsy-stone-200 bg-white px-2 py-1 font-mono text-[13px]"
          aria-label="רדיוס סובלנות בק״מ — קלט טקסטואלי"
        />
      </div>
      <span className="text-[11px] text-bsy-stone-400">
        זהו מרחק התשובה מהיעד, ולא רדיוס פתיחת GPS. בין {minKm} ל־{maxKm} ק״מ.
      </span>
    </fieldset>
  );
}
