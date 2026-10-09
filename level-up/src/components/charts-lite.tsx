import { DOMAIN_COLOR } from "./ui";
import type { AnyCategory } from "@/lib/constants";

/** Tiny dependency-free trend line for cards. `values` are plotted left (oldest) to right (newest). */
export function Sparkline({ values, category, width = 120, height = 32, label }: { values: number[]; category?: AnyCategory; width?: number; height?: number; label: string }) {
  const max = Math.max(...values, 1);
  const color = category ? DOMAIN_COLOR[category] : "var(--accent)";
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const pts = values.map((v, i) => [i * step, height - 2 - (v / max) * (height - 6)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${d} L${width} ${height} L0 ${height} Z`;
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: ${total} XP over ${values.length} days`} className="block max-w-full">
      {total > 0 && <path d={area} fill={color} opacity={0.12} />}
      <path d={d} fill="none" stroke={total > 0 ? color : "var(--line)"} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      {total > 0 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.5} fill={color} />}
    </svg>
  );
}
