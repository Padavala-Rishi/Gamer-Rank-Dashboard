import { RECOMMENDED_FRACTION, type DayLoad } from "@/lib/game/planner";
import { formatMinutes } from "@/lib/dates";
import { cx } from "./ui";

/** How full the day is, against what you said you have time for. */
export function CapacityMeter({ load, free, limit, className }: { load: DayLoad; free: number; limit: number; className?: string }) {
  const rec = Math.round(free * RECOMMENDED_FRACTION);
  const pct = free > 0 ? Math.min(1.15, load.minutes / free) : load.count ? 1.15 : 0;
  const state = load.minutes > free || load.count > limit ? "over" : load.minutes > rec ? "full" : "ok";
  const color = state === "over" ? "var(--bad)" : state === "full" ? "var(--warn)" : "var(--good)";
  return (
    <div className={cx("space-y-1.5", className)} data-testid="capacity">
      <div className="relative h-2 rounded-full bg-raised" role="img" aria-label={`Planned ${formatMinutes(load.minutes)} of ${formatMinutes(free)} free`}>
        <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (pct / 1.15) * 100)}%`, background: color }} />
        {free > 0 && <div className="absolute -inset-y-0.5 w-px bg-faint" style={{ left: `${(RECOMMENDED_FRACTION / 1.15) * 100}%` }} title="Recommended load" />}
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 text-xs text-muted">
        <span><b className="num text-ink">{load.count}</b> quest{load.count === 1 ? "" : "s"} · <b className="num text-ink">{formatMinutes(load.minutes)}</b> planned{load.estimatedCount > 0 && <span title="Quests without an estimate count as 30 minutes"> (~{load.estimatedCount} guessed)</span>}</span>
        <span>{free > 0 ? <>realistic ≈ {formatMinutes(rec)} · free {formatMinutes(free)}</> : "no free time set for today"}</span>
      </div>
      {state !== "ok" && (
        <p className="text-xs" style={{ color }}>
          {state === "over" ? "More than you can realistically do. Move something to another day." : "A full day. Keep a buffer for things that overrun."}
        </p>
      )}
    </div>
  );
}
