"use client";
import { useState } from "react";
import type { LocationGate as Gate } from "@/src/lib/schemas/question-settings";
import { haversineKm } from "@/src/lib/scoring";
export function LocationGate({
  pin,
  questionId,
  gate,
  onUnlock,
}: {
  pin: string;
  questionId: string;
  gate: Gate;
  onUnlock: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "אפשרו גישה למיקום כדי לבדוק אם הגעתם לתחנה.",
  );
  function check() {
    if (!navigator.geolocation) {
      setMessage("המכשיר אינו תומך בקבלת מיקום.");
      return;
    }
    setBusy(true);
    setMessage("בודקים מיקום…");
    navigator.geolocation.getCurrentPosition(
      async ({ coords, timestamp }) => {
        try {
          const distance = Math.round(
            haversineKm({ lat: coords.latitude, lng: coords.longitude }, gate) *
              1000,
          );
          const response = await fetch(
            `/api/participant/${encodeURIComponent(pin)}/unlock`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                questionId,
                lat: coords.latitude,
                lng: coords.longitude,
                accuracy: coords.accuracy,
                measuredAt: new Date(timestamp).toISOString(),
              }),
            },
          );
          const result = await response.json();
          if (response.ok && result.status === "unlocked") {
            await onUnlock();
            return;
          }
          setMessage(
            result.error === "outside_radius"
              ? `אתם במרחק ${distance} מטרים מהתחנה. יש להתקרב לטווח של ${gate.radiusM} מטרים.`
              : result.error === "location_inaccurate"
                ? "דיוק המיקום נמוך. עברו לשטח פתוח ונסו שוב."
                : "לא ניתן לפתוח את התחנה כעת. נסו שוב או פנו למפעיל.",
          );
        } catch {
          setMessage("אין חיבור. בדקו את הרשת ונסו שוב.");
        } finally {
          setBusy(false);
        }
      },
      (error) => {
        setBusy(false);
        setMessage(
          error.code === 1
            ? "הגישה למיקום חסומה. אפשרו אותה בהגדרות הדפדפן ונסו שוב."
            : "לא התקבל מיקום. נסו שוב בשטח פתוח.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }
  return (
    <main
      dir="rtl"
      className="flex min-h-screen flex-col items-center justify-center gap-5 bg-bsy-paper p-6 text-center"
    >
      <h1 className="text-2xl">התחנה נעולה לפי מיקום</h1>
      <p role="status" aria-live="polite">
        {message}
      </p>
      <p>רדיוס הפתיחה: {gate.radiusM} מטרים</p>
      <a
        className="text-bsy-forest underline"
        href={`https://www.google.com/maps/dir/?api=1&destination=${gate.lat},${gate.lng}`}
        target="_blank"
        rel="noreferrer"
      >
        ניווט לתחנה
      </a>
      <button
        type="button"
        className="rounded-md bg-bsy-forest px-5 py-3 text-white"
        disabled={busy}
        onClick={check}
      >
        {busy ? "בודקים…" : "בדיקת מיקום ופתיחת התחנה"}
      </button>
      <p className="text-sm">
        בחזרה ממסך הנעילה או מאפליקציית הניווט, בדקו מיקום שוב.
      </p>
    </main>
  );
}
