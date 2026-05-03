import type { ReactNode } from "react";

import { QUESTION_TYPE_LABELS } from "@/src/lib/constants";
import type { QuestionTypeEnum } from "@/src/lib/supabase/database.types";

interface HostQuestionCardProps {
  type: QuestionTypeEnum;
  prompt: string;
  ordinal: number;
  totalQuestions: number;
  imageUrl?: string | null;
  children?: ReactNode;
}

/**
 * Question prompt card for the host view. Larger type than the participant
 * version since the desktop variant is meant to be projected, but we keep
 * the same paper/cream surface and accent eyebrow for visual continuity.
 */
export function HostQuestionCard({
  type,
  prompt,
  ordinal,
  totalQuestions,
  imageUrl,
  children,
}: HostQuestionCardProps) {
  return (
    <div className="rounded-md border border-bsy-stone-100 bg-white p-5 shadow-[0_1px_2px_rgba(74,63,38,0.06)] md:p-6">
      <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-bsy-forest">
        <span>{QUESTION_TYPE_LABELS[type]}</span>
        <span className="text-bsy-stone-400">
          תחנה {ordinal} מתוך {totalQuestions}
        </span>
      </div>
      {imageUrl ? (
        <div className="mb-3 aspect-[16/9] overflow-hidden rounded-md bg-bsy-paper-warm">
          {/* Generic external image — eslint-disable-next-line @next/next/no-img-element */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      ) : null}
      {children}
      <h3 className="m-0 font-[var(--font-display)] text-[24px] leading-tight text-bsy-brown md:text-[32px] lg:text-[36px]">
        {prompt}
      </h3>
    </div>
  );
}
