"use client";

import type { OptimizeResult } from "./client-image-optimizer";

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

interface OptimizerStatusLineProps {
  result: OptimizeResult;
}

/**
 * Shows a compact before/after summary after a successful optimizer run.
 * Only renders when re-encoding actually happened (result.resized === true).
 * Numbers are wrapped in <bdi dir="ltr"> so they render LTR inside the RTL
 * parent without disrupting Hebrew text flow.
 */
export function OptimizerStatusLine({ result }: OptimizerStatusLineProps) {
  if (!result.resized) return null;

  return (
    <p
      className="text-[11px] text-bsy-stone-500"
      data-testid="optimizer-status-line"
    >
      <bdi dir="ltr">
        {formatBytes(result.beforeBytes)} &rarr; {formatBytes(result.afterBytes)}{" "}
        &middot; {result.naturalWidth}&times;{result.naturalHeight} &rarr;{" "}
        {result.width}&times;{result.height}
      </bdi>
    </p>
  );
}
