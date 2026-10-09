import { CATEGORY_KEYS, type AnyCategory, type CategoryKey } from "../constants";

// The level curve. XP needed to REACH level L = round(base × (L−1)^exponent); level 1 starts at 0 XP.
// This mirrors public.xp_to_reach / level_for_xp in SQL (tests/db/parity.test.ts proves they agree).

export type Curve = { base: number; exponent: number };

export const DEFAULT_CURVE: Curve = { base: 100, exponent: 1.6 };
export const DEFAULT_CATEGORY_CURVE: Curve = { base: 60, exponent: 1.6 };
const MAX_LEVEL = 999;

export function xpToReach(level: number, { base, exponent }: Curve): number {
  if (level <= 1) return 0;
  return Math.floor(base * Math.pow(level - 1, exponent) + 0.5);
}

export function levelForXp(xp: number, curve: Curve): number {
  if (!(xp > 0)) return 1;
  let l = Math.max(1, Math.floor(Math.pow(xp / curve.base, 1 / curve.exponent)) + 1);
  l = Math.min(l, MAX_LEVEL);
  while (l < MAX_LEVEL && xpToReach(l + 1, curve) <= xp) l++;
  while (l > 1 && xpToReach(l, curve) > xp) l--;
  return l;
}

export type LevelProgress = {
  level: number;
  xp: number;
  /** XP at the start of this level */
  floor: number;
  /** XP at which the next level starts */
  ceiling: number;
  into: number;
  needed: number;
  remaining: number;
  /** 0..1 */
  pct: number;
};

export function levelProgress(xp: number, curve: Curve): LevelProgress {
  const total = Math.max(0, Math.floor(xp));
  const level = levelForXp(total, curve);
  const floor = xpToReach(level, curve);
  const ceiling = xpToReach(level + 1, curve);
  const needed = Math.max(1, ceiling - floor);
  const into = total - floor;
  return { level, xp: total, floor, ceiling, into, needed, remaining: Math.max(0, ceiling - total), pct: Math.min(1, Math.max(0, into / needed)) };
}

export type XpByCategory = Partial<Record<AnyCategory, number>>;

export type Character = {
  overall: LevelProgress;
  categories: Record<CategoryKey, LevelProgress>;
  totalXp: number;
};

export function buildCharacter(xp: XpByCategory, overall: Curve, category: Curve): Character {
  const total = Object.values(xp).reduce((a, b) => a + (b ?? 0), 0);
  const categories = {} as Record<CategoryKey, LevelProgress>;
  for (const k of CATEGORY_KEYS) categories[k] = levelProgress(xp[k] ?? 0, category);
  return { overall: levelProgress(total, overall), categories, totalXp: total };
}

export function curvesFromSettings(s: { level_base: number | string; level_exponent: number | string; category_level_base: number | string }): { overall: Curve; category: Curve } {
  return {
    overall: { base: Number(s.level_base), exponent: Number(s.level_exponent) },
    category: { base: Number(s.category_level_base), exponent: Number(s.level_exponent) },
  };
}

/** Rough pace estimate to show how long the next level should take. Clearly an estimate. */
export function daysToNextLevel(remainingXp: number, avgXpPerActiveDay: number): number | null {
  if (!(avgXpPerActiveDay > 0)) return null;
  return Math.ceil(remainingXp / avgXpPerActiveDay);
}
