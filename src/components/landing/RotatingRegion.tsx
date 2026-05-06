"use client";

import { useEffect, useState } from "react";

const REGIONS = [
  "יהודה",
  "השומרון",
  "עציון",
  "הצפון",
  "הארי",
  "הגנת היישוב",
] as const;

const INTERVAL_MS = 2800;

/**
 * Hero title rotator: cycles the region word on the line below "בשביל".
 * Lives on its own line so width changes don't push "בשביל" around.
 */
export default function RotatingRegion() {
  const [index, setIndex] = useState(0);
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      setIndex((n) => (n + 1) % REGIONS.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [reduced]);

  const activeIndex = reduced ? 0 : index;

  return (
    <span
      className="rotating-region"
      role="text"
      aria-label={REGIONS[activeIndex]}
    >
      {REGIONS.map((word, idx) => (
        <span
          key={word}
          aria-hidden="true"
          data-active={idx === activeIndex ? "" : undefined}
        >
          {word}
        </span>
      ))}
    </span>
  );
}
