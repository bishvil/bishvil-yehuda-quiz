export {
  decideHostPrimaryButton,
  type HostPrimaryAction,
  type HostPrimaryButtonState,
  type HostPrimaryDecisionInput,
} from "./primary-button";

/**
 * Bar percentages and fill ratios for the answer-distribution view.
 * Keeps the math out of the React tree and unit-testable.
 */
export interface AnswerBarDatum {
  optionId: string;
  count: number;
  percent: number;
  fillFraction: number;
}

export function computeAnswerBars(args: {
  options: Array<{ id: string }>;
  counts: Record<string, number>;
}): AnswerBarDatum[] {
  const counts = args.options.map((option) => args.counts[option.id] ?? 0);
  const total = counts.reduce((sum, n) => sum + n, 0);
  const max = counts.reduce((m, n) => (n > m ? n : m), 0);

  return args.options.map((option, index) => {
    const c = counts[index] ?? 0;
    const percent = total > 0 ? Math.round((c / total) * 100) : 0;
    const fillFraction = max > 0 ? Math.min(1, c / max) : 0;
    return {
      optionId: option.id,
      count: c,
      percent,
      fillFraction,
    };
  });
}
