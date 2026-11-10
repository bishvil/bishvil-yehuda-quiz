"use client";

import { useEffect, useRef, useState } from "react";
import { BrandBlock } from "./BrandBlock";
import { PrimaryButton } from "./PrimaryButton";
import { ProgressBar } from "./ProgressBar";
import type { ParticipantBrand } from "@/src/lib/participant/brands";
import type { LocationGate as Gate } from "@/src/lib/schemas/question-settings";
import { haversineKm } from "@/src/lib/scoring";

export function LocationGate({
  pin,
  questionId,
  gate,
  onUnlock,
  quizTitle,
  index,
  total,
  brand,
  customLogo = null,
  customLogoLabel = null,
}: {
  pin: string;
  questionId: string;
  gate: Gate;
  onUnlock: () => Promise<void>;
  quizTitle?: string;
  index?: number;
  total?: number;
  brand?: ParticipantBrand;
  customLogo?: string | null;
  customLogoLabel?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "אפשרו גישה למיקום כדי לבדוק אם הגעתם לתחנה.",
  );
  const [measurement, setMeasurement] = useState<{
    distance: number;
    accuracy: number;
  } | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const mounted = useRef(true);
  const checking = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestRef.current?.abort();
    };
  }, []);
  function finish() {
    checking.current = false;
    if (mounted.current) setBusy(false);
  }
  function check() {
    if (checking.current) return;
    if (!navigator.geolocation) {
      setMessage("המכשיר אינו תומך בקבלת מיקום. פנו למפעיל כדי להמשיך.");
      return;
    }
    checking.current = true;
    setBusy(true);
    setPermissionDenied(false);
    setMessage("בודקים מיקום…");
    navigator.geolocation.getCurrentPosition(
      async ({ coords, timestamp }) => {
        if (!mounted.current) return;
        const distance = Math.round(
          haversineKm({ lat: coords.latitude, lng: coords.longitude }, gate) *
            1000,
        );
        setMeasurement({ distance, accuracy: Math.ceil(coords.accuracy) });
        const controller = new AbortController();
        requestRef.current = controller;
        try {
          const response = await fetch(
            `/api/participant/${encodeURIComponent(pin)}/unlock`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
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
          if (!mounted.current) return;
          if (response.ok && result.status === "unlocked") {
            await onUnlock();
            return;
          }
          setMessage(
            result.error === "outside_radius"
              ? `אתם במרחק ${formatDistance(distance)} מהתחנה. יש להתקרב לטווח של ${gate.radiusM} מטרים.`
              : result.error === "location_inaccurate"
                ? "דיוק המיקום נמוך. עברו לשטח פתוח ונסו שוב."
                : "לא ניתן לפתוח את התחנה כעת. נסו שוב או פנו למפעיל.",
          );
        } catch (error) {
          if (
            mounted.current &&
            !(error instanceof DOMException && error.name === "AbortError")
          )
            setMessage("אין חיבור. בדקו את הרשת ונסו שוב.");
        } finally {
          finish();
        }
      },
      (error) => {
        if (!mounted.current) return;
        setPermissionDenied(error.code === 1);
        setMessage(
          error.code === 1
            ? "הגישה למיקום חסומה. אפשרו אותה בהגדרות הדפדפן ונסו שוב."
            : "לא התקבל מיקום. נסו שוב בשטח פתוח.",
        );
        finish();
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }
  return (
    <main dir="rtl" className="flex min-h-screen flex-col bg-bsy-paper">
      <header className="border-b border-bsy-stone-100 bg-bsy-paper-warm px-5 py-4">
        <div className="mx-auto flex max-w-lg flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-sm font-bold text-bsy-brown">
              {quizTitle ?? "המסלול שלכם"}
            </p>
            {brand ? (
              <BrandBlock
                brand={brand}
                customLogo={customLogo}
                customLogoLabel={customLogoLabel}
                size="sm"
                showTagline={false}
              />
            ) : null}
          </div>
          {index != null && total != null ? (
            <>
              <p className="text-xs font-bold text-bsy-stone-700">
                תחנה {index} מתוך {total}
              </p>
              <ProgressBar
                current={index}
                total={total}
                ariaLabel={`תחנה ${index} מתוך ${total}`}
              />
            </>
          ) : null}
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-5 px-5 py-7">
        <section className="rounded-md border border-bsy-stone-100 bg-white p-5 text-center shadow-[var(--shadow-xs)]">
          <h1 className="font-[var(--font-display)] text-2xl text-bsy-brown">
            התחנה נעולה לפי מיקום
          </h1>
          <p
            role="status"
            aria-live="polite"
            className="mt-4 text-sm leading-7 text-bsy-ink"
          >
            {message}
          </p>
          <p className="mt-3 text-sm text-bsy-stone-700">
            רדיוס הפתיחה: {gate.radiusM} מטרים
          </p>
          {measurement ? (
            <dl className="mt-4 grid grid-cols-2 gap-3 rounded-md bg-bsy-paper p-3 text-sm">
              <div>
                <dt className="text-bsy-stone-700">מרחק מהתחנה</dt>
                <dd className="mt-1 font-bold text-bsy-brown">
                  {formatDistance(measurement.distance)}
                </dd>
              </div>
              <div>
                <dt className="text-bsy-stone-700">דיוק משוער</dt>
                <dd className="mt-1 font-bold text-bsy-brown">
                  עד {measurement.accuracy} מטרים
                </dd>
              </div>
            </dl>
          ) : null}
          <p className="mt-4 text-xs leading-6 text-bsy-stone-700">
            זמן המענה, אם הוגדר, יתחיל רק לאחר פתיחת התחנה.
          </p>
        </section>
        <PrimaryButton block disabled={busy} onClick={check}>
          {busy ? "בודקים…" : "בדיקת מיקום ופתיחת התחנה"}
        </PrimaryButton>
        <a
          className="flex min-h-11 items-center justify-center rounded-full border border-bsy-stone-200 bg-white px-5 py-3 text-sm font-bold text-bsy-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bsy-forest"
          href={`https://www.google.com/maps/dir/?api=1&destination=${gate.lat},${gate.lng}`}
          target="_blank"
          rel="noreferrer"
        >
          ניווט לתחנה
        </a>
        <p className="text-center text-sm leading-7 text-bsy-stone-700">
          בחזרה ממסך הנעילה או מאפליקציית הניווט, בדקו מיקום שוב.
        </p>
        <details
          open={permissionDenied || undefined}
          className="rounded-md border border-bsy-stone-200 bg-white p-4"
        >
          <summary className="min-h-11 cursor-pointer font-bold text-bsy-forest">
            איך מאפשרים גישה למיקום?
          </summary>
          <ul className="mt-2 list-inside list-disc space-y-3 text-sm leading-7 text-bsy-ink">
            <li>
              <strong>ב־iPhone:</strong> הפעילו שירותי מיקום במכשיר. ב־Safari
              פתחו את הגדרות האתר ואפשרו מיקום.
            </li>
            <li>
              <strong>ב־Android:</strong> בדקו שהמיקום במכשיר פעיל. ב־Chrome
              פתחו את פרטי האתר ליד הכתובת, עברו להרשאות ואפשרו מיקום.
            </li>
            <li>
              <strong>במחשב:</strong> פתחו את הרשאות האתר ליד שורת הכתובת ואפשרו
              מיקום. לאחר שינוי ההרשאה חזרו לכאן ובדקו מיקום שוב.
            </li>
          </ul>
        </details>
        <details className="rounded-md border border-bsy-stone-200 bg-white p-4">
          <summary className="min-h-11 cursor-pointer font-bold text-bsy-forest">
            צריכים עזרה מהמפעיל?
          </summary>
          <p className="mt-2 text-sm leading-7">
            פנו למדריך או למי ששלח את קישור המשחק. הציגו את קוד המשחק{" "}
            <b dir="ltr">{pin}</b>
            {index != null ? ` ואת מספר התחנה ${index}` : ""}. מנהל החידון יכול
            לפתוח את התחנה עבורכם ממסך התוצאות.
          </p>
        </details>
      </div>
    </main>
  );
}

function formatDistance(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toLocaleString("he-IL", { maximumFractionDigits: 1 })} ק״מ`
    : `${meters.toLocaleString("he-IL")} מטרים`;
}
