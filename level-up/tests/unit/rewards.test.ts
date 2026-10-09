import { describe, expect, it } from "vitest";
import { rewardProgress } from "@/lib/game/rewards";

describe("reward progress", () => {
  const metrics = { level: 4, cat_level_basketball: 7, best_streak: 5, xp_total: 640 };
  it("tracks each milestone kind with the server's metrics", () => {
    expect(rewardProgress({ unlock_kind: "level", unlock_value: 5, unlock_category: null, unlock_key: null }, metrics, new Set())).toMatchObject({ have: 4, need: 5, ready: false });
    expect(rewardProgress({ unlock_kind: "category_level", unlock_category: "basketball", unlock_value: 6, unlock_key: null }, metrics, new Set())).toMatchObject({ ready: true });
    expect(rewardProgress({ unlock_kind: "streak", unlock_value: 7, unlock_category: null, unlock_key: null }, metrics, new Set())).toMatchObject({ have: 5, pct: 5 / 7 });
    expect(rewardProgress({ unlock_kind: "xp", unlock_value: 500, unlock_category: null, unlock_key: null }, metrics, new Set())).toMatchObject({ ready: true, pct: 1 });
  });
  it("achievement rewards unlock only with that achievement", () => {
    const r = { unlock_kind: "achievement" as const, unlock_key: "boss_1", unlock_value: null, unlock_category: null };
    expect(rewardProgress(r, metrics, new Set()).ready).toBe(false);
    expect(rewardProgress(r, metrics, new Set(["boss_1"])).ready).toBe(true);
  });
});
