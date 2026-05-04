"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { AdminTopBar } from "@/src/components/admin/AdminTopBar";
import { LogoUploader } from "@/src/components/admin/upload/LogoUploader";
import type { AdminBrand } from "@/src/lib/participant/brands";

interface BrandsScreenProps {
  adminBrands: AdminBrand[];
  currentUserBrand: string | null;
}

interface BrandFormState {
  name: string;
  tagline: string;
  logoUrl: string | null;
}

type ScreenMode =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "edit"; brand: AdminBrand };

type BrandsAction =
  | { type: "add"; brand: AdminBrand }
  | { type: "update"; brand: AdminBrand }
  | { type: "archive"; id: string };

function brandsReducer(state: AdminBrand[], action: BrandsAction): AdminBrand[] {
  switch (action.type) {
    case "add":
      return [action.brand, ...state];
    case "update":
      return state.map((b) => (b.id === action.brand.id ? action.brand : b));
    case "archive":
      return state.filter((b) => b.id !== action.id);
  }
}

const EMPTY_FORM: BrandFormState = {
  name: "",
  tagline: "",
  logoUrl: null,
};

/**
 * Canonical brand identifier — the value written to `quizzes.brand_id` and
 * `app_metadata.brand`. Matches `ParticipantBrand.id` (slug for system brands,
 * UUID for custom brands) so user-default and quiz-default share one shape.
 * `AdminBrand.id` (raw UUID) is reserved for entity ops on `/api/admin/brands/:id`.
 */
function canonicalBrandId(b: AdminBrand): string {
  return b.slug ?? b.id;
}

function brandToForm(b: AdminBrand): BrandFormState {
  return {
    name: b.name,
    tagline: b.tagline,
    logoUrl: b.logoUrl,
  };
}

export function BrandsScreen({
  adminBrands: initialBrands,
  currentUserBrand,
}: BrandsScreenProps) {
  const [brands, dispatch] = useReducer(brandsReducer, initialBrands);
  const [mode, setMode] = useState<ScreenMode>({ kind: "list" });
  const [selectedBrand, setSelectedBrand] = useState<string | null>(
    currentUserBrand,
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savedTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (savedTimeoutRef.current !== null) {
        window.clearTimeout(savedTimeoutRef.current);
      }
    },
    [],
  );

  async function pickDefaultBrand(brand: AdminBrand) {
    const brandId = canonicalBrandId(brand);
    setSaving(brand.id);
    setSaveError(null);
    try {
      const res = await fetch("/api/admin/settings/brand", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brand: brandId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        setSaveError(body?.message ?? `שמירה נכשלה (HTTP ${res.status}).`);
        return;
      }
      setSelectedBrand(brandId);
      setSavedTick(1);
      if (savedTimeoutRef.current !== null) {
        window.clearTimeout(savedTimeoutRef.current);
      }
      savedTimeoutRef.current = window.setTimeout(() => {
        setSavedTick(0);
        savedTimeoutRef.current = null;
      }, 1800);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "שמירה נכשלה.");
    } finally {
      setSaving(null);
    }
  }


  async function handleCreate(form: BrandFormState) {
    if (!form.logoUrl) return;
    const res = await fetch("/api/admin/brands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        tagline: form.tagline || undefined,
        logoUrl: form.logoUrl,
      }),
    });
    if (!res.ok) {
      const body = (await res.json()) as { message?: string };
      throw new Error(body.message ?? "שמירה נכשלה.");
    }
    const body = (await res.json()) as { brand: AdminBrand };
    dispatch({ type: "add", brand: body.brand });
    setMode({ kind: "list" });
  }

  async function handleUpdate(id: string, form: BrandFormState) {
    const payload: Record<string, unknown> = {
      name: form.name,
      tagline: form.tagline || null,
      logoUrl: form.logoUrl ?? undefined,
    };
    const res = await fetch(`/api/admin/brands/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = (await res.json()) as { message?: string };
      throw new Error(body.message ?? "עדכון נכשל.");
    }
    const body = (await res.json()) as { brand: AdminBrand };
    dispatch({ type: "update", brand: body.brand });
    setMode({ kind: "list" });
  }

  async function handleArchive(id: string): Promise<string[]> {
    const res = await fetch(`/api/admin/brands/${id}`, { method: "DELETE" });
    if (res.status === 409) {
      const body = (await res.json()) as { quizTitles?: string[] };
      return body.quizTitles ?? [];
    }
    if (!res.ok) {
      const body = (await res.json()) as { message?: string };
      throw new Error(body.message ?? "ארכוב נכשל.");
    }
    dispatch({ type: "archive", id });
    return [];
  }

  return (
    <main dir="rtl" className="min-h-screen bg-bsy-paper">
      <AdminTopBar
        crumbs={[{ label: "הגדרות" }, { label: "ספריית מותגים" }]}
        tools={
          savedTick > 0 ? (
            <span className="text-[12px] text-bsy-forest">נשמר</span>
          ) : null
        }
      />

      <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-[13px] font-bold text-bsy-brown">
                ספריית מותגים
              </h2>
              <p className="mt-1 text-[12px] text-bsy-stone-700">
                המותג המסומן כברירת מחדל יוקצה לחידונים חדשים שתיצור (ניתן
                לשנות לכל חידון בנפרד) ויוצג גם בלוח הניהול.
              </p>
            </div>
            {mode.kind === "list" && (
              <button
                type="button"
                onClick={() => setMode({ kind: "create" })}
                className="shrink-0 rounded-full border border-bsy-forest px-4 py-1.5 text-[13px] font-bold text-bsy-forest hover:bg-bsy-forest/5 transition"
              >
                צור מותג חדש
              </button>
            )}
          </div>

          {mode.kind === "create" && (
            <div className="mb-6">
              <BrandForm
                title="מותג חדש"
                initialValues={EMPTY_FORM}
                onCancel={() => setMode({ kind: "list" })}
                onSubmit={handleCreate}
              />
            </div>
          )}

          {mode.kind === "edit" && (
            <div className="mb-6">
              <BrandForm
                title={`עריכת "${mode.brand.name}"`}
                initialValues={brandToForm(mode.brand)}
                onCancel={() => setMode({ kind: "list" })}
                onSubmit={(form) => handleUpdate(mode.brand.id, form)}
              />
            </div>
          )}

          {saveError && (
            <div
              role="alert"
              className="mb-4 rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700"
            >
              {saveError}
            </div>
          )}

          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {brands.map((b) => (
              <BrandCard
                key={b.id}
                brand={b}
                isDefault={selectedBrand === canonicalBrandId(b)}
                isSettingDefault={saving === b.id}
                onSetDefault={() => void pickDefaultBrand(b)}
                onEdit={() => setMode({ kind: "edit", brand: b })}
                onArchive={handleArchive}
              />
            ))}
          </ul>

          {brands.length === 0 && (
            <p className="text-[13px] text-bsy-stone-400">אין מותגים עדיין.</p>
          )}
        </section>
      </div>
    </main>
  );
}


interface BrandCardProps {
  brand: AdminBrand;
  isDefault: boolean;
  isSettingDefault: boolean;
  onSetDefault: () => void;
  onEdit: () => void;
  onArchive: (id: string) => Promise<string[]>;
}

function BrandCard({
  brand,
  isDefault,
  isSettingDefault,
  onSetDefault,
  onEdit,
  onArchive,
}: BrandCardProps) {
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string[] | null>(null);

  const handleArchive = useCallback(async () => {
    if (!window.confirm(`לארכב את המותג "${brand.name}"?`)) return;
    setArchiving(true);
    setArchiveError(null);
    try {
      const blocked = await onArchive(brand.id);
      if (blocked.length > 0) {
        setArchiveError(blocked);
      }
    } catch (err) {
      setArchiveError([err instanceof Error ? err.message : "שגיאה."]);
    } finally {
      setArchiving(false);
    }
  }, [brand.id, brand.name, onArchive]);

  return (
    <li
      className={[
        "rounded-md border-2 bg-white p-4 flex flex-col gap-3 transition",
        isDefault
          ? "border-bsy-forest shadow-[0_0_0_4px_rgb(48_96_48/0.06)]"
          : "border-bsy-stone-100",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        {/* Logo */}
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-bsy-stone-100 bg-bsy-stone-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={brand.logoUrl}
            alt={brand.name}
            className="h-full w-full object-contain"
          />
        </div>

        <div className="grow min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-bsy-brown text-[14px]">
              {brand.name}
            </span>
            {isDefault && (
              <span className="rounded-full bg-bsy-forest/10 px-2 py-0.5 text-[10px] font-bold text-bsy-forest">
                ברירת מחדל
              </span>
            )}
            {brand.isSystem && (
              <span className="rounded-full bg-bsy-stone-100 px-2 py-0.5 text-[10px] font-bold text-bsy-stone-700">
                מערכת
              </span>
            )}
          </div>
          {brand.tagline && (
            <p className="text-[12px] text-bsy-stone-400 mt-0.5">
              {brand.tagline}
            </p>
          )}
        </div>
      </div>

      {/* Archive conflict error */}
      {archiveError && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">
          <p className="font-bold mb-1">
            לא ניתן לארכב — המותג בשימוש בחידונים הבאים:
          </p>
          <ul className="list-disc list-inside">
            {archiveError.map((title) => (
              <li key={title}>{title}</li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-1 font-bold underline"
            onClick={() => setArchiveError(null)}
          >
            סגור
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 border-t border-bsy-stone-50 pt-3">
        {isDefault ? (
          <span className="text-[12px] text-bsy-stone-400 cursor-default">
            ברירת מחדל פעילה
          </span>
        ) : (
          <button
            type="button"
            onClick={onSetDefault}
            disabled={isSettingDefault}
            className="text-[12px] font-bold text-bsy-forest hover:underline disabled:opacity-50"
          >
            {isSettingDefault ? "שומר…" : "קבע כברירת מחדל"}
          </button>
        )}
        <span aria-hidden className="text-bsy-stone-200">·</span>
        <button
          type="button"
          onClick={onEdit}
          className="text-[12px] font-bold text-bsy-forest hover:underline"
        >
          עריכה
        </button>
        {brand.isSystem ? (
          <span
            className="text-[12px] text-bsy-stone-400 cursor-default ms-auto"
            title="לא ניתן לארכב מותג מערכת"
          >
            ארכוב
          </span>
        ) : (
          <button
            type="button"
            onClick={() => void handleArchive()}
            disabled={archiving}
            className="text-[12px] font-bold text-bsy-error hover:underline disabled:opacity-50 ms-auto"
          >
            {archiving ? "מארכב…" : "ארכוב"}
          </button>
        )}
      </div>
    </li>
  );
}


interface BrandFormProps {
  title: string;
  initialValues: BrandFormState;
  onCancel: () => void;
  onSubmit: (form: BrandFormState) => Promise<void>;
}

function BrandForm({
  title,
  initialValues,
  onCancel,
  onSubmit,
}: BrandFormProps) {
  const [form, setForm] = useState<BrandFormState>(initialValues);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(updates: Partial<BrandFormState>) {
    setForm((prev) => ({ ...prev, ...updates }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.logoUrl) {
      setError("יש להעלות לוגו.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="rounded-md border border-bsy-stone-200 bg-white p-5 flex flex-col gap-5"
      dir="rtl"
    >
      <h3 className="text-[14px] font-bold text-bsy-brown">{title}</h3>

      {/* Name */}
      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-bold text-bsy-ink">
          שם המותג <span aria-hidden="true">*</span>
        </span>
        <input
          type="text"
          required
          disabled={submitting}
          value={form.name}
          onChange={(e) => patch({ name: e.target.value })}
          className="rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[13px] disabled:opacity-60"
          placeholder="שם המותג"
        />
      </label>

      {/* Tagline */}
      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-bold text-bsy-ink">תיאור קצר</span>
        <input
          type="text"
          disabled={submitting}
          value={form.tagline}
          onChange={(e) => patch({ tagline: e.target.value })}
          className="rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[13px] disabled:opacity-60"
          placeholder="סלוגן או תיאור"
        />
      </label>

      {/* Logo */}
      <div className="flex flex-col gap-1">
        <span className="text-[12px] font-bold text-bsy-ink">לוגו</span>
        <LogoUploader
          value={form.logoUrl}
          onChange={(url) => patch({ logoUrl: url })}
          disabled={submitting}
        />
      </div>

      {error && (
        <p className="text-[12px] text-bsy-error" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-bsy-stone-50 pt-4">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-bsy-forest px-5 py-2 text-[13px] font-bold text-white hover:bg-bsy-forest/90 disabled:opacity-60 transition"
        >
          {submitting ? "שומר…" : "שמירה"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-full border border-bsy-stone-200 px-4 py-2 text-[13px] font-bold text-bsy-stone-700 hover:border-bsy-stone-300 transition"
        >
          ביטול
        </button>
      </div>
    </form>
  );
}
