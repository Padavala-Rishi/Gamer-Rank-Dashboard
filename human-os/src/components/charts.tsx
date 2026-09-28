// Small, dependency-free SVG charts.
// Specs: 2px lines with a ~10% area wash, bars ≤24px with 4px rounded data-ends,
// hairline solid gridlines, text in ink tokens, hover tooltip on every chart.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => setW(Math.max(120, entries[0].contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
}

const shortDate = (d: string) => {
  const dt = new Date(d + "T00:00:00Z");
  return dt.toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
};

interface SeriesProps {
  dates: string[];
  values: (number | null)[];
  height?: number;
  format?: (v: number) => string;
  /** Fixed y maximum (e.g. 5 for a 1–5 scale, 1 for rates) */
  max?: number;
  label: string;
  color?: string;
  /** Custom x-axis label per index (defaults to the date) */
  xLabel?: (i: number) => string;
}

export function LineChart({ dates, values, height = 160, format = (v) => String(Math.round(v * 10) / 10), max, label, color = "var(--accent)", xLabel }: SeriesProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId();
  const pad = { l: 34, r: 8, t: 10, b: 22 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const valid = values.filter((v): v is number => v != null);
  const ymax = max ?? niceMax(Math.max(1, ...valid));
  const x = (i: number) => pad.l + (dates.length <= 1 ? w / 2 : (i / (dates.length - 1)) * w);
  const y = (v: number) => pad.t + h - (v / ymax) * h;
  // Break the line at missing values instead of inventing data.
  const segs: string[] = [];
  let cur = "";
  values.forEach((v, i) => {
    if (v == null) {
      if (cur) segs.push(cur);
      cur = "";
    } else cur += `${cur ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (cur) segs.push(cur);
  const area = segs.map((s) => {
    const pts = s.slice(1).split("L").map((p) => p.split(",").map(Number));
    return `${s}L${pts[pts.length - 1][0]},${pad.t + h}L${pts[0][0]},${pad.t + h}Z`;
  });
  const ticks = [0, ymax / 2, ymax];
  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round((px / rect.width) * (dates.length - 1));
    setHover(Math.max(0, Math.min(dates.length - 1, i)));
  };
  const lastIdx = values.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0).pop();
  if (!valid.length) return <EmptyChart height={height} label={label} />;
  return (
    <div className="chart" ref={ref}>
      <svg height={height} role="img" aria-label={`${label}: line chart over ${dates.length} points`}>
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.14" />
            <stop offset="1" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={pad.l + w} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth="1" />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--muted)" className="num">
              {format(t)}
            </text>
          </g>
        ))}
        {area.map((a, i) => (
          <path key={i} d={a} fill={`url(#${gid})`} />
        ))}
        {segs.map((s, i) => (
          <path key={i} d={s} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {lastIdx != null && <circle cx={x(lastIdx)} cy={y(values[lastIdx]!)} r="4" fill={color} stroke="var(--surface)" strokeWidth="2" />}
        <XLabels dates={dates} x={x} y={height - 6} xLabel={xLabel} />
        {hover != null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + h} stroke="var(--axis)" strokeWidth="1" />
            {values[hover] != null && <circle cx={x(hover)} cy={y(values[hover]!)} r="4.5" fill={color} stroke="var(--surface)" strokeWidth="2" />}
          </>
        )}
        <rect x={pad.l} y={pad.t} width={w} height={h} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hover != null && (
        <div className="chart-tip" style={{ left: x(hover), top: values[hover] != null ? y(values[hover]!) : pad.t + h / 2 }}>
          <strong>{values[hover] == null ? "No data" : format(values[hover]!)}</strong> · {xLabel ? xLabel(hover) : shortDate(dates[hover])}
        </div>
      )}
    </div>
  );
}

export function BarChart({ dates, values, height = 160, format = (v) => String(Math.round(v)), max, label, color = "var(--accent)", xLabel }: SeriesProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 34, r: 8, t: 10, b: 22 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const valid = values.filter((v): v is number => v != null);
  const ymax = max ?? niceMax(Math.max(1, ...valid));
  const slot = w / Math.max(1, dates.length);
  const bw = Math.max(2, Math.min(24, slot - 2));
  const x = (i: number) => pad.l + i * slot + slot / 2;
  const y = (v: number) => pad.t + h - (v / ymax) * h;
  const ticks = [0, ymax / 2, ymax];
  if (!valid.some((v) => v > 0)) return <EmptyChart height={height} label={label} />;
  return (
    <div className="chart" ref={ref}>
      <svg height={height} role="img" aria-label={`${label}: bar chart over ${dates.length} periods`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={pad.l + w} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth="1" />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--muted)" className="num">
              {format(t)}
            </text>
          </g>
        ))}
        {values.map((v, i) => {
          if (!v) return null;
          const top = y(v);
          const bh = pad.t + h - top;
          const r = Math.min(4, bw / 2, bh);
          const x0 = x(i) - bw / 2;
          // Rounded data-end, square at the baseline.
          const d = `M${x0},${pad.t + h}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + bw - r}Q${x0 + bw},${top} ${x0 + bw},${top + r}V${pad.t + h}Z`;
          return <path key={i} d={d} fill={color} opacity={hover == null || hover === i ? 1 : 0.55} />;
        })}
        <line x1={pad.l} x2={pad.l + w} y1={pad.t + h} y2={pad.t + h} stroke="var(--axis)" strokeWidth="1" />
        <XLabels dates={dates} x={x} y={height - 6} xLabel={xLabel} />
        {dates.map((_, i) => (
          <rect key={i} x={pad.l + i * slot} y={pad.t} width={slot} height={h} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
      </svg>
      {hover != null && (
        <div className="chart-tip" style={{ left: x(hover), top: values[hover] ? y(values[hover]!) : pad.t + h }}>
          <strong>{format(values[hover] ?? 0)}</strong> · {xLabel ? xLabel(hover) : shortDate(dates[hover])}
        </div>
      )}
    </div>
  );
}

function XLabels({ dates, x, y, xLabel }: { dates: string[]; x: (i: number) => number; y: number; xLabel?: (i: number) => string }) {
  if (!dates.length) return null;
  const idx = dates.length <= 2 ? dates.map((_, i) => i) : [0, Math.floor((dates.length - 1) / 2), dates.length - 1];
  return (
    <>
      {idx.map((i, k) => (
        <text key={i} x={x(i)} y={y} fontSize="10" fill="var(--muted)" textAnchor={k === 0 ? "start" : k === idx.length - 1 ? "end" : "middle"}>
          {xLabel ? xLabel(i) : shortDate(dates[i])}
        </text>
      ))}
    </>
  );
}

function EmptyChart({ height, label }: { height: number; label: string }) {
  return (
    <div className="empty small" style={{ height, justifyContent: "center" }} role="img" aria-label={`${label}: no data yet`}>
      No data in this period yet.
    </div>
  );
}

export function Sparkline({ values, width = 90, height = 26, color = "var(--accent)" }: { values: (number | null)[]; width?: number; height?: number; color?: string }) {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length < 2) return null;
  const max = Math.max(...valid, 1);
  const min = Math.min(...valid, 0);
  const x = (i: number) => (i / (values.length - 1)) * (width - 4) + 2;
  const y = (v: number) => height - 2 - ((v - min) / (max - min || 1)) * (height - 4);
  let d = "";
  values.forEach((v, i) => {
    if (v == null) return;
    d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} aria-hidden style={{ display: "block" }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}

/** Labelled horizontal bars: identity is carried by the text label, never colour alone. */
export function BarList({ items, format = (v) => String(v), empty = "Nothing yet." }: { items: { label: ReactNode; value: number; color?: string; hint?: string }[]; format?: (v: number) => string; empty?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="muted small">{empty}</p>;
  return (
    <div className="col" style={{ gap: 10 }}>
      {items.map((it, i) => (
        <div key={i} title={it.hint}>
          <div className="row between small">
            <span className="row gap-4 ellipsis">
              {it.color && <span className="dot" style={{ background: it.color }} aria-hidden />}
              {it.label}
            </span>
            <span className="num ink-2">{format(it.value)}</span>
          </div>
          <div className="progress mt-4" style={{ height: 6 }} aria-hidden>
            <span style={{ width: `${(it.value / max) * 100}%`, background: it.color ?? "var(--accent)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
