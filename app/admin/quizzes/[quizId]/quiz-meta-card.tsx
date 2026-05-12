"use client";

import { LogoUploader } from "@/src/components/admin/upload/LogoUploader";
import { GAME_MODES, type GameMode } from "@/src/lib/constants";
import type { EditableQuiz } from "@/src/lib/admin/quiz-editor";
import type { ParticipantBrand } from "@/src/lib/participant/brands";

const JOIN_FIELD_OPTIONS: { id: string; label: string }[] = [
  { id: "name", label: "שם" },
  { id: "phone", label: "טלפון" },
  { id: "unit", label: "יחידה" },
  { id: "team", label: "צוות" },
];

interface QuizMetaCardProps {
  quiz: EditableQuiz;
  onChange: (next: EditableQuiz) => void;
  disabled?: boolean;
  brands: ParticipantBrand[];
}

export function QuizMetaCard({
  quiz,
  onChange,
  disabled,
  brands,
}: QuizMetaCardProps) {
  return (
    <div className="rounded-md border border-bsy-stone-100 bg-white p-4 md:p-6">
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
          שם החידון
        </span>
        <input
          className="rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[14px]"
          value={quiz.title}
          maxLength={80}
          onChange={(event) => onChange({ ...quiz, title: event.target.value })}
          disabled={disabled}
          data-testid="admin-quiz-title"
        />
      </label>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
            מצב משחק
          </span>
          <select
            className="rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[14px]"
            value={quiz.defaultGameMode}
            onChange={(event) =>
              onChange({
                ...quiz,
                defaultGameMode: event.target.value as GameMode,
              })
            }
            disabled={disabled}
          >
            {GAME_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode === "sync" ? "סינכרוני (מודרך)" : "אסינכרוני (חופשי)"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
            מותג
          </span>
          <select
            className="rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[14px]"
            value={quiz.brandId}
            onChange={(event) =>
              onChange({ ...quiz, brandId: event.target.value })
            }
            disabled={disabled}
          >
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="mt-4 rounded-md border border-bsy-stone-100 p-3">
        <legend className="px-2 text-[11px] font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
          שדות הצטרפות
        </legend>
        <div className="flex flex-wrap gap-2">
          {JOIN_FIELD_OPTIONS.map((field) => {
            const checked = quiz.joinFields.includes(field.id);
            const disabledLocked = field.id === "phone";
            return (
              <label
                key={field.id}
                className={[
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px]",
                  checked
                    ? "border-bsy-forest bg-bsy-forest/10 text-bsy-forest"
                    : "border-bsy-stone-200 bg-white text-bsy-stone-700",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled || disabledLocked}
                  onChange={(event) => {
                    const set = new Set(quiz.joinFields);
                    if (event.target.checked) set.add(field.id);
                    else set.delete(field.id);
                    if (!set.has("phone")) set.add("phone");
                    onChange({ ...quiz, joinFields: Array.from(set) });
                  }}
                  className="h-3.5 w-3.5 accent-bsy-forest"
                />
                <span>{field.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-4 rounded-md border border-bsy-stone-100 p-3">
        <legend className="px-2 text-[11px] font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
          מיתוג ייעודי
        </legend>
        <div className="mt-2 grid gap-2">
          <label
            className={[
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] w-fit",
              quiz.customLogoActive
                ? "border-bsy-forest bg-bsy-forest/10 text-bsy-forest"
                : "border-bsy-stone-200 bg-white text-bsy-stone-700",
            ].join(" ")}
          >
            <input
              type="checkbox"
              checked={quiz.customLogoActive}
              disabled={disabled}
              onChange={(event) =>
                onChange({ ...quiz, customLogoActive: event.target.checked })
              }
              className="h-3.5 w-3.5 accent-bsy-forest"
            />
            <span>פעיל</span>
          </label>
          <p className="text-[11px] text-bsy-stone-400">
            כשפעיל — הלוגו הייעודי מופיע במסך ההצטרפות, בלוח החי ובלוח התוצאות
          </p>
          <div className={quiz.customLogoActive ? undefined : "opacity-60"}>
            <LogoUploader
              value={quiz.customLogo}
              onChange={(customLogo) =>
                onChange({
                  ...quiz,
                  customLogo,
                  customLogoLabel: customLogo ? quiz.customLogoLabel : null,
                })
              }
              disabled={disabled || !quiz.customLogoActive}
            />
          </div>
          <input
            className={[
              "rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[14px]",
              quiz.customLogoActive && quiz.customLogo !== null
                ? ""
                : "opacity-60",
            ].join(" ")}
            placeholder="שם האירוע (לדוגמה: גדוד 890)"
            value={quiz.customLogoLabel ?? ""}
            onChange={(event) =>
              onChange({
                ...quiz,
                customLogoLabel: event.target.value || null,
              })
            }
            disabled={
              disabled || !quiz.customLogoActive || quiz.customLogo === null
            }
          />
        </div>
      </fieldset>
    </div>
  );
}
