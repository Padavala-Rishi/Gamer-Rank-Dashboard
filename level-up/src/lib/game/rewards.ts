import type { Reward } from "../types";

export type RewardProgress = { have: number; need: number; pct: number; ready: boolean; label: string };

/** How close a reward's milestone is, using the same metrics the server checks when you claim it. */
export function rewardProgress(r: Pick<Reward, "unlock_kind" | "unlock_category" | "unlock_key" | "unlock_value">, metrics: Record<string, number>, unlockedKeys: Set<string>): RewardProgress {
  const need = Number(r.unlock_value ?? 1);
  if (r.unlock_kind === "achievement") {
    const ready = !!r.unlock_key && unlockedKeys.has(r.unlock_key);
    return { have: ready ? 1 : 0, need: 1, pct: ready ? 1 : 0, ready, label: "achievement" };
  }
  const have = r.unlock_kind === "level" ? metrics.level ?? 1
    : r.unlock_kind === "category_level" ? metrics[`cat_level_${r.unlock_category}`] ?? 1
    : r.unlock_kind === "streak" ? metrics.best_streak ?? 0
    : metrics.xp_total ?? 0;
  const label = { level: "overall level", category_level: "attribute level", streak: "day best streak", xp: "total XP" }[r.unlock_kind];
  return { have, need, pct: Math.min(1, have / need), ready: have >= need, label };
}
