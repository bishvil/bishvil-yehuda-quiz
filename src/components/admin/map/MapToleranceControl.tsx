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
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
        רדיוס סובלנות (ק״מ)
      </span>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={sliderValue}
          onChange={(event) => onSliderChange(Number(event.target.value))}
          aria-label="רדיוס סובלנות בק״מ"
          className="flex-1 accent-bsy-forest"
        />
        <input
          type="number"
          min={minKm}
          max={maxKm}
          step={0.1}
          value={Number(valueKm.toFixed(2))}
          onChange={(event) => onTextChange(event.target.value)}
          className="w-24 rounded-md border border-bsy-stone-200 bg-white px-2 py-1 font-mono text-[13px]"
          aria-label="רדיוס סובלנות בק״מ — קלט טקסטואלי"
        />
      </div>
      <span className="text-[11px] text-bsy-stone-400">
        סולם לוגריתמי בין {minKm} ל־{maxKm} ק״מ.
      </span>
    </label>
  );
}
