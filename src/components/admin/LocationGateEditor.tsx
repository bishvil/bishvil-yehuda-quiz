"use client";
import type { EditableQuestion } from "@/src/lib/admin/quiz-editor";
export function LocationGateEditor({
  question,
  update,
  readOnly,
}: {
  question: EditableQuestion;
  update: (patch: Partial<EditableQuestion>) => void;
  readOnly: boolean;
}) {
  const gate = question.settings?.locationGate;
  return (
    <fieldset
      disabled={readOnly}
      className="rounded-md border border-bsy-stone-200 p-3"
    >
      <legend>פתיחה לפי מיקום (במשחק אסינכרוני)</legend>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={Boolean(gate)}
          onChange={(e) =>
            update({
              settings: {
                ...question.settings,
                locationGate: e.target.checked
                  ? { lat: 31.5, lng: 34.9, radiusM: 100 }
                  : null,
              },
            })
          }
        />
        התחנה תיפתח רק בהגעה למקום
      </label>
      {gate ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(
            [
              ["lat", "קו רוחב", -90, 90],
              ["lng", "קו אורך", -180, 180],
              ["radiusM", "רדיוס במטרים", 20, 5000],
            ] as const
          ).map(([key, label, min, max]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                dir="ltr"
                step={key === "radiusM" ? 1 : 0.00001}
                min={min}
                max={max}
                className="w-full rounded border p-2"
                value={gate[key]}
                onChange={(e) => {
                  if (
                    e.target.value !== "" &&
                    Number.isFinite(e.target.valueAsNumber)
                  )
                    update({
                      settings: {
                        ...question.settings,
                        locationGate: {
                          ...gate,
                          [key]: e.target.valueAsNumber,
                        },
                      },
                    });
                }}
              />
            </label>
          ))}
          <button
            type="button"
            className="col-span-3 text-bsy-forest"
            onClick={() =>
              navigator.geolocation?.getCurrentPosition(
                ({ coords }) =>
                  update({
                    settings: {
                      ...question.settings,
                      locationGate: {
                        ...gate,
                        lat: coords.latitude,
                        lng: coords.longitude,
                      },
                    },
                  }),
                () =>
                  window.alert(
                    "לא ניתן לקבל מיקום. הזינו קואורדינטות או אפשרו גישה למיקום.",
                  ),
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
              )
            }
          >
            השתמש במיקום שלי
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}
