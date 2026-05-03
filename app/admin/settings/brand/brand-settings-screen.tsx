"use client";

import { useEffect, useState } from "react";

import { AdminTopBar } from "@/src/components/admin/AdminTopBar";
import { PARTICIPANT_BRANDS } from "@/src/lib/participant/brands";

const BRAND_LIST = Object.values(PARTICIPANT_BRANDS);

export function BrandSettingsScreen() {
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/settings/brand", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { brand: string | null };
        if (cancelled) return;
        setSelected(body.brand);
        setStatus("ready");
      } catch {
        if (cancelled) return;
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function pick(brandId: string) {
    setSaving(brandId);
    try {
      const res = await fetch("/api/admin/settings/brand", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brand: brandId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSelected(brandId);
      setSavedTick((t) => t + 1);
      window.setTimeout(() => setSavedTick((t) => Math.max(0, t - 1)), 1800);
    } finally {
      setSaving(null);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-bsy-paper">
      <AdminTopBar
        crumbs={[{ label: "הגדרות" }, { label: "מותג ותצוגה" }]}
        tools={
          savedTick > 0 ? (
            <span className="text-[12px] text-bsy-forest">נשמר</span>
          ) : null
        }
      />

      <section className="mx-auto max-w-4xl px-4 py-6 md:px-6">
        {status === "loading" ? (
          <p className="text-[13px] text-bsy-stone-700">טוען…</p>
        ) : status === "error" ? (
          <p className="text-[13px] text-red-700">לא ניתן לטעון את ההגדרות.</p>
        ) : (
          <>
            <p className="mb-4 text-[13px] text-bsy-stone-700">
              בחר את המותג שיוצג בלוח הניהול שלך. ניתן לעקוף את הבחירה הזו
              בכל חידון בנפרד.
            </p>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {BRAND_LIST.map((b) => {
                const isSelected = selected === b.id;
                const isSaving = saving === b.id;
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => pick(b.id)}
                      disabled={isSaving}
                      aria-pressed={isSelected}
                      className={`flex w-full items-center gap-3 rounded-md border-2 bg-white p-4 text-start transition ${
                        isSelected
                          ? "border-bsy-green-forest"
                          : "border-bsy-stone-100 hover:border-bsy-stone-200"
                      }`}
                    >
                      <span
                        className="inline-block h-10 w-10 rounded-md"
                        style={{ background: b.primary }}
                        aria-hidden="true"
                      />
                      <span className="grow">
                        <span className="block font-bold text-bsy-brown">
                          {b.name}
                        </span>
                        <span className="block text-[11px] text-bsy-stone-400">
                          {b.tagline}
                        </span>
                      </span>
                      {isSelected ? (
                        <span className="text-[12px] font-bold text-bsy-green-forest">
                          נבחר
                        </span>
                      ) : isSaving ? (
                        <span className="text-[12px] text-bsy-stone-400">
                          שומר…
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
