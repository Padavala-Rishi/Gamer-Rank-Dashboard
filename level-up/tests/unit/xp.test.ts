import { describe, expect, it } from "vitest";
import { buildCharacter, DEFAULT_CATEGORY_CURVE, DEFAULT_CURVE, levelForXp, levelProgress, xpToReach } from "@/lib/game/xp";

describe("level curve", () => {
  it("starts at level 1 with 0 XP and gets steadily harder", () => {
    expect(levelForXp(0, DEFAULT_CURVE)).toBe(1);
    expect(xpToReach(1, DEFAULT_CURVE)).toBe(0);
    expect(xpToReach(2, DEFAULT_CURVE)).toBe(100);
    let prevGap = 0;
    for (let l = 2; l <= 60; l++) {
      const gap = xpToReach(l + 1, DEFAULT_CURVE) - xpToReach(l, DEFAULT_CURVE);
      expect(gap).toBeGreaterThan(prevGap);
      prevGap = gap;
    }
  });

  it("level thresholds are exact: one XP short stays, the threshold advances", () => {
    for (let l = 2; l <= 100; l++) {
      const need = xpToReach(l, DEFAULT_CURVE);
      expect(levelForXp(need - 1, DEFAULT_CURVE)).toBe(l - 1);
      expect(levelForXp(need, DEFAULT_CURVE)).toBe(l);
    }
  });

  it("is driven by configuration, not constants", () => {
    const easy = { base: 50, exponent: 1.3 }, hard = { base: 200, exponent: 1.9 };
    expect(levelForXp(1000, easy)).toBeGreaterThan(levelForXp(1000, hard));
  });

  it("reports progress inside the current level", () => {
    const p = levelProgress(150, DEFAULT_CURVE);
    expect(p.level).toBe(2);
    expect(p.floor).toBe(100);
    expect(p.ceiling).toBe(xpToReach(3, DEFAULT_CURVE));
    expect(p.into).toBe(50);
    expect(p.pct).toBeCloseTo(50 / (p.ceiling - 100), 5);
    expect(levelProgress(0, DEFAULT_CURVE).pct).toBe(0);
    expect(levelProgress(-5, DEFAULT_CURVE).level).toBe(1);
  });

  it("builds the character: overall from the sum, attributes from each category", () => {
    const c = buildCharacter({ basketball: 120, college: 0, dev: 60, health: 30, life: 10 }, DEFAULT_CURVE, DEFAULT_CATEGORY_CURVE);
    expect(c.totalXp).toBe(220);
    expect(c.overall.level).toBe(levelForXp(220, DEFAULT_CURVE));
    expect(c.categories.basketball.level).toBeGreaterThan(c.categories.college.level);
    expect(c.categories.college.level).toBe(1);
  });
});
