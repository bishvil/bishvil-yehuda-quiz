import Image from "next/image";
import type { ReactNode } from "react";

import type { QuestionType } from "@/src/lib/constants";
import { QUESTION_TYPE_LABELS } from "@/src/lib/constants";

interface QuestionCardProps {
  type: QuestionType;
  prompt: string;
  imageUrl?: string | null;
  /** Admin-supplied alt text; empty string signals decorative image. */
  imageAlt?: string | null;
  /** Children render inside the prompt card (e.g. an image illustration). */
  children?: ReactNode;
}

/**
 * White card on cream background carrying the question prompt + optional
 * eyebrow type label. Keeps emoji-free per design-intake.md §8.
 */
export function QuestionCard({ type, prompt, imageUrl, imageAlt, children }: QuestionCardProps) {
  const eyebrow = buildEyebrow(type);
  return (
    <div className="rounded-md border border-bsy-stone-100 bg-white p-5 shadow-[0_1px_2px_rgba(74,63,38,0.06)]">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-bsy-forest">
        {eyebrow}
      </p>
      {imageUrl ? (
        <div className="relative mb-3 aspect-[16/10] overflow-hidden rounded-md bg-bsy-paper-warm">
          <Image
            src={imageUrl}
            alt={imageAlt ?? ""}
            fill
            sizes="(max-width: 640px) 100vw, 640px"
            className="object-cover"
          />
        </div>
      ) : null}
      {children}
      <h3 className="m-0 font-[var(--font-display)] text-[22px] leading-snug text-bsy-brown">
        {prompt}
      </h3>
    </div>
  );
}

function buildEyebrow(type: QuestionType): string {
  const base = QUESTION_TYPE_LABELS[type];
  if (type === "multi") return `${base} · ניתן לסמן יותר מאחת`;
  if (type === "map") return `${base} · הקישו על המפה כדי לסמן`;
  return base;
}
