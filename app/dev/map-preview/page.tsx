/**
 * Dev-only sandbox for the InteractiveMap shared wrapper (ADR-0011).
 *
 * - Unauthenticated; the proxy/middleware does not gate `/dev/*`.
 * - Renders fixture data only; no quiz state, no PII, no DB access.
 * - The integration tail / coordinator may delete this file once the
 *   interactive map question is wired into the real admin editor and the
 *   participant play screen.
 *
 * Not exported from any sitemap and excluded from any future production
 * route inventory by the `/dev/*` prefix convention used elsewhere in the
 * project.
 */

import dynamic from "next/dynamic";
import Link from "next/link";

const MapPreviewClient = dynamic(
  () => import("./map-preview-client").then((m) => m.MapPreviewClient),
  {
    loading: () => (
      <div
        className="flex h-[420px] items-center justify-center rounded-md border border-bsy-stone-200 bg-bsy-paper-warm text-sm text-bsy-stone-700"
        aria-live="polite"
      >
        טוען מפה...
      </div>
    ),
  },
);

export const metadata = {
  title: "Dev — Map preview",
  robots: { index: false, follow: false },
};

export default function MapPreviewPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <Link
          href="/"
          className="text-[12px] text-bsy-stone-700 hover:underline"
        >
          ← חזרה לדף הבית
        </Link>
        <h1 className="font-suez text-2xl text-bsy-ink">Dev — מפה אינטראקטיבית</h1>
        <p className="text-sm text-bsy-stone-700">
          ארגז חול לבדיקת ה־<code>InteractiveMap</code>. לחיצה על המפה תניח
          סיכה אדומה במקום הלחיצה. גרירה והגדלה זמינות; סיבוב מנוטרל.
        </p>
      </header>

      <section className="overflow-hidden rounded-lg border border-bsy-stone-200 bg-white shadow-sm">
        <div className="h-[420px] w-full">
          <MapPreviewClient />
        </div>
      </section>

      <footer className="text-[11px] text-bsy-stone-700">
        <p>
          סגנון מפה ברירת מחדל: OSM Liberty (לא דורש מפתח). אם הוגדר{" "}
          <code>NEXT_PUBLIC_MAPTILER_KEY</code>, יישום הסגנון של MapTiler.
          ראה ADR־0011 §1.
        </p>
      </footer>
    </main>
  );
}
