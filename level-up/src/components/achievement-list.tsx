import type { AchievementDef } from "@/lib/types";
import { Icon } from "./icon";
import { ProgressBar } from "./ui";

/** Badge grid with honest progress: bars use the same metrics the server uses to unlock them. */
export function AchievementList({ defs, unlocked, metrics, compact }: { defs: AchievementDef[]; unlocked: Map<string, string>; metrics: Record<string, number>; compact?: boolean }) {
  return (
    <ul className={compact ? "grid gap-2 sm:grid-cols-2" : "grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3"}>
      {defs.map((d) => {
        const got = unlocked.has(d.key);
        const have = Math.min(Number(metrics[d.metric] ?? 0), Number(d.threshold));
        return (
          <li key={d.key} className={`card-inset flex items-start gap-3 p-3 ${got ? "" : "opacity-80"}`} data-unlocked={got}>
            <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${got ? "bg-accent text-accent-ink" : "bg-raised text-faint"}`}><Icon name={got ? d.icon : "lock"} size={17} /></span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold leading-snug">{d.name}</div>
              <div className="text-xs text-muted">{d.description}</div>
              {got ? (
                <div className="mt-1 text-xs text-good">Unlocked{d.title ? ` · title “${d.title}”` : ""}</div>
              ) : (
                <div className="mt-1.5"><ProgressBar value={have / Number(d.threshold)} small label={`${d.name} progress`} /><div className="mt-0.5 text-[11px] text-faint"><span className="num">{Math.round(have * 10) / 10}</span> / <span className="num">{Number(d.threshold)}</span></div></div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
