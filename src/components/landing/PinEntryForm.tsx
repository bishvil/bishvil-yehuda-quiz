"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputFocusShadow = "0 0 0 3px rgba(48, 96, 48, 0.15)";

/**
 * Inline PIN entry form for the landing page.
 * Participants type their 6-digit session code and are routed to /{pin}
 * the moment the 6th digit is entered, or on pressing כניסה.
 */
export default function PinEntryForm() {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
    setPin(val);
    if (val.length === 6) {
      setLoading(true);
      router.push(`/${val}`);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length === 6 && !loading) {
      setLoading(true);
      router.push(`/${pin}`);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-sm flex-col items-center gap-3"
      aria-label="הצטרפות לחידון"
      aria-busy={loading}
      noValidate
    >
      <label htmlFor="pin-input" className="sr-only">
        קוד PIN בן 6 ספרות
      </label>
      <p id="pin-help" className="sr-only">
        הקלדת 6 ספרות תכניס אותך לחידון
      </p>
      <input
        id="pin-input"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        value={pin}
        onChange={handleChange}
        disabled={loading}
        placeholder="000000"
        dir="ltr"
        autoComplete="one-time-code"
        enterKeyHint="go"
        className="text-center font-mono text-2xl tracking-[0.38em] focus:outline-none disabled:opacity-50 md:text-3xl"
        style={{
          width: "clamp(12rem, 22vw, 16rem)",
          borderRadius: "var(--radius-pill)",
          border: "1px solid var(--color-border)",
          background: "rgba(255, 255, 255, 0.88)",
          color: "var(--bsy-ink)",
          caretColor: "var(--bsy-green-forest)",
          boxShadow:
            "var(--shadow-sm), inset 0 1px 2px rgba(74, 63, 38, 0.06)",
          padding: "0.85rem 1.2rem",
          transition:
            "background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out)",
        }}
        onFocus={(e) => {
          e.currentTarget.style.background = "var(--color-bg-elevated)";
          e.currentTarget.style.borderColor = "var(--bsy-green-forest)";
          e.currentTarget.style.boxShadow = inputFocusShadow;
        }}
        onBlur={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.88)";
          e.currentTarget.style.borderColor = "var(--color-border)";
          e.currentTarget.style.boxShadow =
            "var(--shadow-sm), inset 0 1px 2px rgba(74, 63, 38, 0.06)";
        }}
        aria-label="קוד PIN בן 6 ספרות"
        aria-describedby="pin-help"
      />
    </form>
  );
}
