"use client";
import { useEffect, useState } from "react";

/** XP bar that fills in on load, and glows when you've earned XP since you last looked. */
export function XpBar({ value, color, storageKey, xp, label }: { value: number; color?: string; storageKey?: string; xp?: number; label: string }) {
  const [w, setW] = useState(0);
  const [glow, setGlow] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  useEffect(() => {
    if (!storageKey || xp == null) return;
    try {
      const prev = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(prev) && prev > 0 && xp > prev) { setGlow(true); setTimeout(() => setGlow(false), 3500); }
      localStorage.setItem(storageKey, String(xp));
    } catch { /* storage unavailable: no glow, no problem */ }
  }, [storageKey, xp]);
  return (
    <div className={`bar ${glow ? "glow" : ""}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <span style={{ width: `${Math.max(0, Math.min(1, w)) * 100}%`, ...(color ? { background: color } : null) }} />
    </div>
  );
}
