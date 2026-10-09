"use client";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Series } from "@/lib/chart-config";
import { formatDay } from "@/lib/dates";

// Charts follow one spec: 2px lines, bars ≤ 24px with a 4px rounded data end, hairline solid grid, text in text tokens
// (never the series colour), a legend whenever there are ≥ 2 series, a hover tooltip, and a table view for every chart.

export type { Series };

const AXIS = { fill: "var(--muted)", fontSize: 11 } as const;

export function ChartFrame({ title, subtitle, legend, table, children, empty }: {
  title: string; subtitle?: ReactNode; legend?: Series[]; table?: { columns: string[]; rows: (string | number)[][] }; children: ReactNode; empty?: string | null;
}) {
  return (
    <figure className="card min-w-0 overflow-hidden p-4">
      <figcaption className="mb-3">
        <div className="text-sm font-semibold">{title}</div>
        {subtitle && <div className="text-xs text-muted">{subtitle}</div>}
      </figcaption>
      {empty ? <div className="grid h-40 place-items-center rounded-xl border border-dashed border-line px-4 text-center text-sm text-muted">{empty}</div> : children}
      {legend && legend.length > 1 && !empty && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
          {legend.map((s) => <li key={s.key} className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />{s.label}</li>)}
        </ul>
      )}
      {table && !empty && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-muted hover:text-ink">View as table</summary>
          <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-line">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-raised text-muted"><tr>{table.columns.map((c) => <th key={c} scope="col" className="px-2.5 py-1.5 font-semibold">{c}</th>)}</tr></thead>
              <tbody>{table.rows.map((r, i) => <tr key={i} className="border-t border-line">{r.map((v, j) => <td key={j} className="num px-2.5 py-1">{v}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  );
}

type TipProps = { active?: boolean; payload?: { dataKey?: string | number; value?: number | string; color?: string; payload?: Record<string, unknown> }[]; label?: string | number };

function makeTooltip(series: Series[], fmtLabel: (l: string) => string, unit = "") {
  return function Tip({ active, payload, label }: TipProps) {
    if (!active || !payload?.length) return null;
    const rows = payload.filter((p) => p.value != null);
    if (!rows.length) return null;
    return (
      <div className="rounded-lg border border-line bg-raised px-3 py-2 text-xs shadow-xl">
        <div className="mb-1 font-semibold text-ink">{fmtLabel(String(label))}</div>
        {rows.map((p) => {
          const s = series.find((x) => x.key === p.dataKey);
          return (
            <div key={String(p.dataKey)} className="flex items-center justify-between gap-4 text-muted">
              <span className="inline-flex items-center gap-1.5"><span className="inline-block size-2 rounded-full" style={{ background: s?.color ?? p.color }} />{s?.label ?? String(p.dataKey)}</span>
              <span className="num font-semibold text-ink">{typeof p.value === "number" ? Math.round(p.value * 10) / 10 : p.value}{unit}</span>
            </div>
          );
        })}
      </div>
    );
  };
}

const dayLabel = (l: string) => (/^\d{4}-\d{2}-\d{2}$/.test(l) ? formatDay(l) : l);
const tickDay = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? formatDay(v, { day: "numeric", month: "short" }) : v);

/** Stacked columns (one segment per series). Segments are separated by a 2px surface gap. */
export function StackedBars({ data, series, xKey = "day", height = 220, unit = "", rounded = true }: { data: Record<string, number | string>[]; series: Series[]; xKey?: string; height?: number; unit?: string; rounded?: boolean }) {
  const Tip = makeTooltip(series, dayLabel, unit);
  return (
    <div className="min-w-0 max-w-full overflow-hidden" style={{ height }} role="img" aria-label="Stacked bar chart; the table view below has the same numbers">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height }}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }} barCategoryGap="22%">
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS} tickFormatter={tickDay} axisLine={{ stroke: "var(--line)" }} tickLine={false} minTickGap={24} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
          <Tooltip content={<Tip />} cursor={{ fill: "var(--surface-2)", opacity: 0.6 }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} stroke="var(--surface)" strokeWidth={1} maxBarSize={24} isAnimationActive={false}
              radius={rounded && i === series.length - 1 ? [4, 4, 0, 0] : 0} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleBars({ data, dataKey, color = "var(--accent)", xKey = "day", height = 200, unit = "", label, target }: { data: Record<string, number | string>[]; dataKey: string; color?: string; xKey?: string; height?: number; unit?: string; label: string; target?: number }) {
  const series = [{ key: dataKey, label, color }];
  const Tip = makeTooltip(series, dayLabel, unit);
  return (
    <div className="min-w-0 max-w-full overflow-hidden" style={{ height }} role="img" aria-label={`${label} bar chart; the table view below has the same numbers`}>
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height }}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }} barCategoryGap="22%">
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS} tickFormatter={tickDay} axisLine={{ stroke: "var(--line)" }} tickLine={false} minTickGap={24} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} />
          <Tooltip content={<Tip />} cursor={{ fill: "var(--surface-2)", opacity: 0.6 }} />
          {target ? <ReferenceLine y={target} stroke="var(--faint)" strokeWidth={1} label={{ value: "target", fill: "var(--muted)", fontSize: 11, position: "insideTopRight" }} /> : null}
          <Bar dataKey={dataKey} fill={color} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Lines for one or more series with a crosshair tooltip and a ringed end-dot. Gaps in the data stay gaps. */
export function Lines({ data, series, xKey = "day", height = 220, unit = "", yDomain, target, label }: { data: Record<string, number | string | null>[]; series: Series[]; xKey?: string; height?: number; unit?: string; yDomain?: [number | "auto", number | "auto"]; target?: number; label: string }) {
  const Tip = makeTooltip(series, dayLabel, unit);
  return (
    <div className="min-w-0 max-w-full overflow-hidden" style={{ height }} role="img" aria-label={`${label} line chart; the table view below has the same numbers`}>
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height }}>
        <LineChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS} tickFormatter={tickDay} axisLine={{ stroke: "var(--line)" }} tickLine={false} minTickGap={28} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} domain={yDomain ?? ["auto", "auto"]} />
          <Tooltip content={<Tip />} cursor={{ stroke: "var(--faint)", strokeWidth: 1 }} />
          {target != null ? <ReferenceLine y={target} stroke="var(--faint)" strokeWidth={1} label={{ value: "target", fill: "var(--muted)", fontSize: 11, position: "insideTopRight" }} /> : null}
          {series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" connectNulls isAnimationActive={false}
              dot={{ r: 4, fill: s.color, stroke: "var(--surface)", strokeWidth: 2 }} activeDot={{ r: 5, fill: s.color, stroke: "var(--surface)", strokeWidth: 2 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
