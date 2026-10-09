import { afterAll, describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { levelForXp, xpToReach } from "@/lib/game/xp";
import { computeStreaks } from "@/lib/game/streaks";
import { admin, createUser, summary } from "./helpers";

afterAll(() => admin.end());

describe("SQL ↔ TypeScript parity", () => {
  const curves = [
    { base: 100, exponent: 1.6 }, { base: 20, exponent: 1.1 }, { base: 70, exponent: 1.35 },
    { base: 160, exponent: 2.5 }, { base: 33.3, exponent: 1.9 }, { base: 25.5, exponent: 1 }, { base: 1000, exponent: 1.1 },
  ];

  it("xp_to_reach agrees for the first 200 levels on every curve", async () => {
    for (const c of curves) {
      const { rows } = await admin.query("select l, xp_to_reach(l, $1, $2)::float8 as xp from generate_series(1,200) l", [c.base, c.exponent]);
      for (const r of rows) expect(r.xp, `${JSON.stringify(c)} level ${r.l}`).toBe(xpToReach(r.l, c));
    }
  });

  it("level_for_xp agrees, including exactly at and just below every threshold", async () => {
    for (const c of curves) {
      const probes: number[] = [0, 1, 5, 99, 100, 101, 12345, 987654];
      for (let l = 2; l <= 120; l++) { const x = xpToReach(l, c); probes.push(x - 1, x, x + 1); }
      const { rows } = await admin.query("select x, level_for_xp(x::bigint, $1, $2) as l from unnest($3::bigint[]) x", [c.base, c.exponent, probes.filter((p) => p >= 0)]);
      for (const r of rows) expect(r.l, `${JSON.stringify(c)} xp ${r.x}`).toBe(levelForXp(Number(r.x), c));
    }
  });

  it("daily streaks agree on randomised histories with rest days and rest weekdays", async () => {
    const { rows: [{ today }] } = await admin.query("select to_char((now() at time zone 'UTC')::date,'YYYY-MM-DD') today");
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let trial = 0; trial < 25; trial++) {
      const uid = await createUser("UTC");
      const active: string[] = [], rest: string[] = [];
      const span = 5 + Math.floor(rnd() * 60);
      const restWeekdays = rnd() < 0.3 ? [7] : [];
      for (let o = 0; o < span; o++) {
        const d = addDays(today, -o);
        const r = rnd();
        if (r < 0.55) active.push(d); else if (r < 0.7) rest.push(d);
      }
      if (restWeekdays.length) await admin.query("update user_settings set rest_weekdays=$2 where user_id=$1", [uid, restWeekdays]);
      for (const d of active) {
        const t = await admin.query("insert into tasks (user_id,title,category) values ($1,'t','life') returning id", [uid]);
        await admin.query("insert into task_completions (user_id, task_id, category, completed_on) values ($1,$2,'life',$3)", [uid, t.rows[0].id, d]);
      }
      for (const d of rest) await admin.query("insert into health_days (user_id, day, is_rest_day) values ($1,$2,true) on conflict do nothing", [uid, d]);
      const sql = await summary(uid);
      const ts = computeStreaks({ activeDates: active, restDates: rest, restWeekdays, today });
      expect([sql.current_streak, sql.best_streak], `trial ${trial}`).toEqual([ts.current, ts.best]);
    }
  });
});
