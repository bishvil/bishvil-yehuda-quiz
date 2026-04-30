"use client";

import type { ChangeEvent } from "react";

interface FieldOption {
  value: string;
  label: string;
}

interface JoinFormFieldProps {
  id: string;
  label: string;
  required?: boolean;
  type: "text" | "tel" | "select";
  value: string;
  placeholder?: string;
  helpText?: string;
  options?: FieldOption[];
  onChange: (next: string) => void;
}

/**
 * Single field in the join card. The DOM input/select uses the warm cream
 * surface from the design system, with a forest focus ring (no blue).
 */
export function JoinFormField({
  id,
  label,
  required = false,
  type,
  value,
  placeholder,
  helpText,
  options,
  onChange,
}: JoinFormFieldProps) {
  function handleChange(
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    onChange(event.target.value);
  }

  const inputClassName = [
    "block w-full rounded-md border-[1.5px] border-bsy-stone-100 bg-bsy-paper-warm",
    "px-3.5 py-3 text-[15px] text-bsy-ink outline-none",
    "transition-colors duration-150",
    "focus:border-bsy-forest focus:bg-white",
    "placeholder:text-bsy-stone-400",
  ].join(" ");

  return (
    <div className="mb-3.5">
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-bold tracking-wide text-bsy-stone-700"
      >
        {label}
        {required ? <span className="ms-1 text-bsy-error">*</span> : null}
      </label>
      {type === "select" && options ? (
        <select
          id={id}
          value={value}
          onChange={handleChange}
          required={required}
          className={inputClassName}
        >
          <option value="" disabled>
            בחרו…
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={type === "tel" ? "tel" : "text"}
          inputMode={type === "tel" ? "tel" : "text"}
          value={value}
          placeholder={placeholder}
          required={required}
          onChange={handleChange}
          autoComplete={type === "tel" ? "tel" : "off"}
          className={inputClassName}
        />
      )}
      {helpText ? (
        <p className="mt-1 text-[11px] leading-snug text-bsy-stone-400">
          {helpText}
        </p>
      ) : null}
    </div>
  );
}
