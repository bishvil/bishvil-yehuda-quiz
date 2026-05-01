"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
      className="flex flex-col items-center gap-3 w-full"
      aria-label="הצטרפות לחידון"
      noValidate
    >
      <label
        htmlFor="pin-input"
        className="text-sm font-medium"
        style={{ color: "var(--bsy-stone-700)" }}
      >
        הצטרפות לחידון — הכנס קוד משתתף
      </label>
      <div className="flex items-center gap-2 flex-wrap justify-center">
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
          autoComplete="off"
          className="w-36 text-center text-xl tracking-[0.35em] font-mono px-4 py-2 focus:outline-none disabled:opacity-50"
          style={{
            borderRadius: "var(--radius-pill)",
            border: "2px solid var(--bsy-stone-200)",
            background: "var(--color-bg-elevated)",
            color: "var(--bsy-ink)",
            caretColor: "var(--bsy-green-forest)",
            transition: "border-color var(--dur-fast) var(--ease-out)",
          }}
          onFocus={(e) =>
            (e.currentTarget.style.borderColor = "var(--bsy-green-forest)")
          }
          onBlur={(e) =>
            (e.currentTarget.style.borderColor = "var(--bsy-stone-200)")
          }
          aria-label="קוד PIN בן 6 ספרות"
        />
        <button
          type="submit"
          disabled={pin.length !== 6 || loading}
          style={{
            borderRadius: "var(--radius-pill)",
            background: "var(--bsy-green-bright)",
            color: "var(--bsy-green-forest)",
            fontWeight: 700,
            padding: "0.5rem 1.25rem",
            fontSize: "0.9375rem",
            border: "none",
            cursor: pin.length === 6 && !loading ? "pointer" : "not-allowed",
            opacity: pin.length !== 6 || loading ? 0.45 : 1,
            transition: "opacity var(--dur-fast) var(--ease-out)",
          }}
        >
          {loading ? "נכנס..." : "כניסה"}
        </button>
      </div>
    </form>
  );
}
