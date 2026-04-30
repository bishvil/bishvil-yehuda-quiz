import Link from "next/link";

export default function ParticipantNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bsy-paper px-6 text-center">
      <h1 className="font-[var(--font-display)] text-[28px] text-bsy-brown">
        החידון לא נמצא
      </h1>
      <p className="max-w-sm text-[14px] text-bsy-stone-700">
        הקוד שהוקש אינו תואם לחידון פעיל. בדקו עם המארגנים את הקוד או סרקו QR
        שהוצג על המסך.
      </p>
      <Link
        href="/"
        className="rounded-full border border-bsy-stone-200 px-5 py-2 text-[14px] font-bold text-bsy-forest hover:border-bsy-forest"
      >
        חזרה לדף הבית
      </Link>
    </main>
  );
}
