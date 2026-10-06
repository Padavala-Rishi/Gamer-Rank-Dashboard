import { useEffect, useRef, useState, type ReactNode } from "react";
import { reducedMotion } from "../lib/celebrate";

/** Counts up to a number when it first appears or changes. */
export function CountUp({ value, ms = 700 }: { value: number; ms?: number }) {
  const [shown, setShown] = useState(reducedMotion() ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reducedMotion()) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(a + (value - a) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{shown}</>;
}

/** A circular progress ring. Fills smoothly; the centre can hold any content. */
export function ProgressRing({ value, size = 84, stroke = 8, children, label, tone = "accent" }: { value: number | null; size?: number; stroke?: number; children?: ReactNode; label: string; tone?: "accent" | "warm" | "cool" }) {
  const v = Math.max(0, Math.min(1, value ?? 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [drawn, setDrawn] = useState(reducedMotion() ? v : 0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setDrawn(v));
    return () => cancelAnimationFrame(t);
  }, [v]);
  const color = tone === "warm" ? "var(--ring-warm)" : tone === "cool" ? "var(--ring-cool)" : "var(--accent)";
  return (
    <div className="ring-wrap" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${Math.round(v * 100)}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ring-track)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - drawn)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}
