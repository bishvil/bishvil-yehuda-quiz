"use client";

import {
  useEffect,
  useRef,
  type ClipboardEvent,
  type FocusEvent,
  type KeyboardEvent,
} from "react";

import { PARTICIPANT_PIN_LENGTH } from "@/src/lib/participant/pin";

interface CodeInputProps {
  value: string;
  onChange: (next: string) => void;
  /** When the digits are complete, the parent can auto-advance. */
  onComplete?: (value: string) => void;
  autoFocus?: boolean;
  ariaLabel?: string;
}

/**
 * 6-cell numeric PIN input. Auto-advances on entry, supports backspace
 * walking, and accepts paste of the full code. Direction is forced LTR
 * for the cells themselves so digits render left-to-right while the
 * page direction stays RTL.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  autoFocus = false,
  ariaLabel = "קוד החידון",
}: CodeInputProps) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const cells: string[] = Array.from({ length: PARTICIPANT_PIN_LENGTH }).map(
    (_, index) => value[index] ?? "",
  );

  useEffect(() => {
    if (autoFocus) {
      inputs.current[0]?.focus();
    }
  }, [autoFocus]);

  function update(nextCells: string[]) {
    const firstBlank = nextCells.findIndex((cell) => cell === "");
    const normalizedCells =
      firstBlank === -1 ? nextCells : nextCells.slice(0, firstBlank);
    const joined = normalizedCells.join("");
    onChange(joined);
    if (
      onComplete &&
      joined.length === PARTICIPANT_PIN_LENGTH &&
      firstBlank === -1
    ) {
      onComplete(joined);
    }
  }

  function handleCellChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    if (!digit && !cells[index]) return;
    const next = [...cells];
    next[index] = digit;
    update(next);
    if (digit && index < PARTICIPANT_PIN_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      const next = [...cells];
      next[index] = event.key;
      update(next);
      if (index < PARTICIPANT_PIN_LENGTH - 1) {
        inputs.current[index + 1]?.focus();
      }
      return;
    }
    if (event.key === "Backspace" && cells[index]) {
      event.preventDefault();
      const next = [...cells];
      next[index] = "";
      update(next);
      return;
    }
    if (event.key === "Backspace" && !cells[index] && index > 0) {
      event.preventDefault();
      const next = [...cells];
      next[index - 1] = "";
      update(next);
      inputs.current[index - 1]?.focus();
      return;
    }
    if (event.key === "ArrowLeft" && index < PARTICIPANT_PIN_LENGTH - 1) {
      event.preventDefault();
      inputs.current[index + 1]?.focus();
      return;
    }
    if (event.key === "ArrowRight" && index > 0) {
      event.preventDefault();
      inputs.current[index - 1]?.focus();
    }
  }

  function handleFocus(event: FocusEvent<HTMLInputElement>) {
    event.currentTarget.select();
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    event.preventDefault();
    const next: string[] = Array.from({ length: PARTICIPANT_PIN_LENGTH }).map(
      (_, idx) => pasted[idx] ?? "",
    );
    update(next);
    const lastFilled = next.findIndex((cell) => cell === "");
    const focusIndex = lastFilled === -1 ? PARTICIPANT_PIN_LENGTH - 1 : lastFilled;
    inputs.current[focusIndex]?.focus();
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex justify-center gap-2 [direction:ltr]"
    >
      {cells.map((cell, index) => {
        const isFilled = cell !== "";
        return (
          <input
            key={index}
            ref={(el) => {
              inputs.current[index] = el;
            }}
            value={cell}
            onChange={(event) => handleCellChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onFocus={handleFocus}
            onPaste={handlePaste}
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={1}
            aria-label={`ספרה ${index + 1}`}
            className={[
              "h-14 w-11 rounded-md border-2 text-center font-mono text-2xl font-bold",
              "transition-all duration-150",
              "outline-none focus-visible:ring-4 focus-visible:ring-bsy-lime/30",
              isFilled
                ? "border-bsy-lime bg-white text-bsy-brown"
                : "border-bsy-stone-100 bg-bsy-paper-warm text-bsy-brown",
              "focus:border-bsy-forest focus:bg-white",
            ].join(" ")}
          />
        );
      })}
    </div>
  );
}
