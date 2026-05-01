"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BrandBlock } from "@/src/components/participant/BrandBlock";
import { CodeInput } from "@/src/components/participant/CodeInput";
import { JoinFormField } from "@/src/components/participant/JoinFormField";
import { PrimaryButton } from "@/src/components/participant/PrimaryButton";
import type { ParticipantBrand } from "@/src/lib/participant/brands";
import { joinSession } from "@/src/lib/participant/api-client";
import {
  isValidParticipantPin,
  PARTICIPANT_PIN_LENGTH,
} from "@/src/lib/participant/pin";

const TEAM_OPTIONS = ["צוות א׳", "צוות ב׳", "צוות ג׳", "צוות ד׳"] as const;

interface JoinScreenProps {
  pin: string;
  brand: ParticipantBrand;
  quizTitle: string;
  customLogo: string | null;
  customLogoLabel: string | null;
  sessionStatus: "draft" | "scheduled" | "live" | "paused" | "ended";
}

export function JoinScreen({
  pin,
  brand,
  quizTitle,
  customLogo,
  customLogoLabel,
  sessionStatus,
}: JoinScreenProps) {
  const router = useRouter();
  const [code, setCode] = useState(() =>
    isValidParticipantPin(pin) ? pin : "",
  );
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [unit, setUnit] = useState("");
  const [team, setTeam] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const codeFilled = code.length === PARTICIPANT_PIN_LENGTH;
  const requiredFilled =
    phone.trim().length >= 6 &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0;
  const sessionUnavailable = sessionStatus === "ended";
  const canSubmit = codeFilled && requiredFilled && !submitting;
  const statusBanner =
    sessionStatus === "ended"
      ? {
          copy: "החידון הסתיים. תודה שהשתתפתם.",
          className: "border-bsy-error/30 bg-bsy-error/10 text-bsy-error",
        }
      : sessionUnavailable
        ? {
            copy: "החידון אינו זמין כעת. נסו שוב מאוחר יותר או פנו למארח.",
            className: "border-bsy-warn/40 bg-bsy-warn/10 text-bsy-warn",
          }
        : null;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const response = await joinSession(code, {
        phone: phone.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        unit: unit.trim() || undefined,
        team: team || undefined,
      });

      if ("error" in response) {
        setError(translateJoinError(response.error, response.message));
        setSubmitting(false);
        return;
      }

      router.replace(`/${code}/lobby`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `אירעה שגיאה — ${caught.message}`
          : "אירעה שגיאה. נסו שוב.",
      );
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-stretch bg-bsy-paper px-6 pb-8 pt-10 [background:radial-gradient(ellipse_100%_60%_at_50%_-10%,var(--bsy-paper-warm)_0%,var(--bsy-paper)_60%)] sm:items-center">
      <div className="mx-auto flex w-full max-w-md flex-col gap-9">
        <div className="text-center">
          <BrandBlock
            brand={brand}
            customLogo={customLogo}
            customLogoLabel={customLogoLabel}
            size="md"
            showTagline
          />
        </div>

        <section className="rounded-[20px] border border-bsy-stone-100 bg-white px-6 pb-6 pt-6 shadow-[0_2px_6px_rgba(74,63,38,0.08)]">
          <header className="mb-5 text-center">
            <h2 className="m-0 mb-1 font-[var(--font-display)] text-[26px] text-bsy-brown">
              הצטרפות לחידון
            </h2>
            <p className="mx-auto max-w-xs text-sm leading-relaxed text-bsy-stone-700">
              הזינו את קוד החידון ומלאו פרטים קצרים לזיהוי בלוח התוצאות
            </p>
            <p className="mt-1 text-[12px] text-bsy-stone-400">{quizTitle}</p>
          </header>

          {statusBanner ? (
            <div
              role="status"
              dir="rtl"
              className={[
                "mb-5 rounded-[var(--radius-md)] border px-4 py-3 text-sm leading-relaxed sm:px-5",
                statusBanner.className,
              ].join(" ")}
            >
              {statusBanner.copy}
            </div>
          ) : null}

          <CodeInput
            value={code}
            onChange={setCode}
            autoFocus={code.length === 0}
          />

          <div className="mt-6 grid grid-cols-1 gap-0">
            <JoinFormField
              id="join-phone"
              label="מספר נייד"
              type="tel"
              required
              value={phone}
              onChange={setPhone}
              placeholder="050-1234567"
              helpText="נשתמש בו כדי לזהות אתכם בלוח התוצאות"
            />
            <div className="grid grid-cols-2 gap-3">
              <JoinFormField
                id="join-first-name"
                label="שם פרטי"
                type="text"
                required
                value={firstName}
                onChange={setFirstName}
                placeholder="כפי שירשם בלוח"
              />
              <JoinFormField
                id="join-last-name"
                label="שם משפחה"
                type="text"
                required
                value={lastName}
                onChange={setLastName}
                placeholder="כפי שירשם בלוח"
              />
            </div>
            <JoinFormField
              id="join-unit"
              label="גדוד / פלוגה"
              type="text"
              value={unit}
              onChange={setUnit}
              placeholder="גדוד 890"
            />
            <JoinFormField
              id="join-team"
              label="צוות"
              type="select"
              value={team}
              onChange={setTeam}
              options={TEAM_OPTIONS.map((option) => ({
                value: option,
                label: option,
              }))}
            />
          </div>

          {error ? (
            <div
              role="alert"
              className="mt-2 rounded-md border border-bsy-error/30 bg-bsy-error/10 px-3 py-2 text-[13px] text-bsy-error"
            >
              {error}
            </div>
          ) : null}

          <div className="mt-3">
            <PrimaryButton
              variant="primary"
              block
              withArrow
              disabled={!canSubmit || sessionUnavailable}
              onClick={handleSubmit}
              type="button"
            >
              {submitting ? "מצטרפים…" : "הצטרפות לחידון"}
            </PrimaryButton>
          </div>

          <div className="my-5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-bsy-stone-400">
            <span className="h-px flex-1 bg-bsy-stone-100" />
            <span>או</span>
            <span className="h-px flex-1 bg-bsy-stone-100" />
          </div>

          <div className="flex items-center gap-3 rounded-md bg-bsy-paper-warm p-3">
            <span
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-bsy-stone-100 bg-white"
            >
              <QrGlyph />
            </span>
            <span className="flex-1">
              <span className="block font-[var(--font-display)] text-[14px] font-bold text-bsy-brown">
                סריקת קוד QR
              </span>
              <span className="block text-[12px] text-bsy-stone-700">
                המדריך מציג את הקוד על המסך
              </span>
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}

function translateJoinError(code: string, fallback: string): string {
  switch (code) {
    case "SESSION_NOT_FOUND":
      return "לא נמצא חידון פעיל לקוד הזה.";
    case "INVALID_REQUEST":
      return "אנא בדקו את הפרטים — שדה אחד או יותר חסר.";
    case "PARTICIPANT_CREATE_FAILED":
      return "כבר נרשמתם לחידון הזה. נסו לרענן את הדף.";
    case "AUTH_FAILED":
    case "TOKEN_SCOPE_FAILED":
      return "אירעה שגיאת זיהוי. נסו שוב.";
    default:
      return fallback || "אירעה שגיאה. נסו שוב.";
  }
}

function QrGlyph() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <rect
        x="3"
        y="3"
        width="10"
        height="10"
        stroke="currentColor"
        fill="none"
        strokeWidth="2"
      />
      <rect x="6" y="6" width="4" height="4" fill="currentColor" />
      <rect
        x="19"
        y="3"
        width="10"
        height="10"
        stroke="currentColor"
        fill="none"
        strokeWidth="2"
      />
      <rect x="22" y="6" width="4" height="4" fill="currentColor" />
      <rect
        x="3"
        y="19"
        width="10"
        height="10"
        stroke="currentColor"
        fill="none"
        strokeWidth="2"
      />
      <rect x="6" y="22" width="4" height="4" fill="currentColor" />
      <rect x="17" y="17" width="4" height="4" fill="currentColor" />
      <rect x="23" y="17" width="3" height="3" fill="currentColor" />
      <rect x="17" y="23" width="3" height="3" fill="currentColor" />
      <rect x="25" y="25" width="4" height="4" fill="currentColor" />
    </svg>
  );
}
