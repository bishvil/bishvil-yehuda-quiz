# Wave 3 Phase 2 Uploads Integration Brief

This brief is for the integration tail subtask. The upload pipeline is already
implemented outside the editor files:

- `app/api/admin/uploads/logo/route.ts`
- `app/api/admin/uploads/question-image/route.ts`
- `src/components/admin/upload/LogoUploader.tsx`
- `src/components/admin/upload/QuestionImageUploader.tsx`

Do not re-derive upload behavior in the editor. Wire these components into the
existing auto-save state and keep map-related code separate for subtask 4b.

## 1. Editor Screen Logo Wiring

File: `app/admin/quizzes/[quizId]/quiz-editor-screen.tsx`

Add this import near the existing admin component imports around lines 7-10:

```tsx
import { LogoUploader } from "@/src/components/admin/upload/LogoUploader";
```

Replace the current custom-logo fieldset around lines 565-615:

```tsx
<fieldset className="mt-4 rounded-md border border-bsy-stone-100 p-3">
  <legend className="px-2 text-[11px] font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
    מיתוג ייעודי
  </legend>
  <label className="flex items-center gap-2 text-[12px]">
    <input
      type="checkbox"
      checked={quiz.customLogo !== null}
      onChange={(event) =>
        onChange({
          ...quiz,
          customLogo: event.target.checked
            ? (quiz.customLogo ?? "https://")
            : null,
        })
      }
      disabled={disabled}
      className="h-3.5 w-3.5 accent-bsy-forest"
    />
    <span>פעיל</span>
  </label>
  {quiz.customLogo !== null ? (
    <div className="mt-2 grid gap-2">
      <input
        className="rounded-md border border-bsy-stone-200 bg-white px-3 py-2 font-mono text-[12px]"
        dir="ltr"
        placeholder="https://…/logo.png"
        value={quiz.customLogo}
        onChange={(event) =>
          onChange({ ...quiz, customLogo: event.target.value })
        }
        disabled={disabled}
      />
      <input
        className="rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[14px]"
        placeholder="שם האירוע (לדוגמה: גדוד 890)"
        value={quiz.customLogoLabel ?? ""}
        onChange={(event) =>
          onChange({
            ...quiz,
            customLogoLabel: event.target.value || null,
          })
        }
        disabled={disabled}
      />
      <p className="text-[11px] text-bsy-stone-400">
        העלאת קבצים תיכנס בגל הבא — עד אז ניתן להדביק כתובת תמונה ציבורית.
      </p>
    </div>
  ) : null}
</fieldset>
```

With this:

```tsx
<fieldset className="mt-4 rounded-md border border-bsy-stone-100 p-3">
  <legend className="px-2 text-[11px] font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
    מיתוג ייעודי
  </legend>
  <div className="mt-2 grid gap-2">
    <LogoUploader
      value={quiz.customLogo}
      onChange={(customLogo) =>
        onChange({
          ...quiz,
          customLogo,
          customLogoLabel: customLogo ? quiz.customLogoLabel : null,
        })
      }
      disabled={disabled}
    />
    {quiz.customLogo !== null ? (
      <input
        className="rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[14px]"
        placeholder="שם האירוע (לדוגמה: גדוד 890)"
        value={quiz.customLogoLabel ?? ""}
        onChange={(event) =>
          onChange({
            ...quiz,
            customLogoLabel: event.target.value || null,
          })
        }
        disabled={disabled}
      />
    ) : null}
  </div>
</fieldset>
```

No new state hook is needed. `LogoUploader` calls `onChange(url)` after upload
and `onChange(null)` on removal; the existing debounced quiz auto-save will
persist `customLogo` and `customLogoLabel`.

## 2. Question Editor Image Wiring

File: `src/components/admin/QuestionEditor.tsx`

Add this import near the existing local component imports around line 5:

```tsx
import { QuestionImageUploader } from "./upload/QuestionImageUploader";
```

Replace the current image-question URL block around lines 96-111:

```tsx
{question.type === "image" ? (
  <Field
    label="כתובת התמונה"
    help="הדבק כתובת ציבורית של תמונה. העלאות יישמרו לגל הבא."
  >
    <input
      className="w-full rounded-md border border-bsy-stone-200 bg-white px-3 py-2 font-mono text-[12px]"
      dir="ltr"
      value={question.imageUrl ?? ""}
      placeholder="https://…/photo.jpg"
      onChange={(event) =>
        update({ imageUrl: event.target.value || null })
      }
    />
  </Field>
) : null}
```

With this:

```tsx
{question.type === "image" ? (
  <div className="flex flex-col gap-1.5">
    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
      תמונת השאלה
    </span>
    <QuestionImageUploader
      value={question.imageUrl}
      onChange={(imageUrl) => update({ imageUrl })}
    />
  </div>
) : null}
```

Do not wrap `QuestionImageUploader` in the existing `Field` helper, because
`Field` renders a `<label>` and the uploader contains its own input and checkbox
controls. The snippet above avoids nested labels.

No new state hook is needed. The uploader includes the required manual external
URL fallback behind the Hebrew toggle `שימוש בכתובת חיצונית`; it calls the same
`update({ imageUrl })` path, so the existing question auto-save remains the
single persistence mechanism.

## 3. Expected Behavior After Wiring

- Logo uploads call `POST /api/admin/uploads/logo`, store the returned `url` in
  `quiz.customLogo`, and clear `customLogoLabel` when the logo is removed.
- Question image uploads call `POST /api/admin/uploads/question-image` and store
  the returned `url` in `question.imageUrl`.
- Both controls validate MIME and size client-side before upload and show Hebrew
  upload/error/preview states.
- Both server routes also validate auth, MIME, size, multipart shape, and return
  `private, no-store` JSON.
- No map upload behavior is included here.

## 4. Tests Already Added

- `tests/unit/api/admin-upload-routes.test.ts`
- `tests/unit/admin/upload-controls.test.tsx`

No e2e upload smoke was added in this subtask because the editor wiring is
intentionally deferred to the integration tail and real Supabase Storage uploads
are brittle in CI. Add a browser smoke after the tail task mounts these controls
if PM2/Supabase local storage is stable in the target environment.
