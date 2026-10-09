import { afterAll, describe, expect, it } from "vitest";
import { admin, addTask, asUser, complete, createUser, failure, ledgerTotal, summary, undo } from "./helpers";

afterAll(() => admin.end());

describe("XP awards", () => {
  it("pays the configured XP per difficulty and nothing else", async () => {
    const u = await createUser();
    const out: Record<string, number> = {};
    for (const d of ["easy", "medium", "hard", "boss"]) {
      const id = await addTask(u, { difficulty: d, category: "dev" });
      out[d] = (await complete(u, id)).xp;
    }
    expect(out).toEqual({ easy: 10, medium: 25, hard: 50, boss: 100 });
    expect(await ledgerTotal(u)).toBe(185);
  });

  it("uses the user's own XP table (server-side, not client-supplied)", async () => {
    const u = await createUser();
    await asUser(u, (tx) => tx.q(`update user_settings set xp_values='{"easy":5,"medium":15,"hard":30,"boss":60}'`));
    const id = await addTask(u, { difficulty: "hard" });
    expect((await complete(u, id)).xp).toBe(30);
  });

  it("is idempotent: completing the same quest twice pays once", async () => {
    const u = await createUser();
    const id = await addTask(u, { difficulty: "medium" });
    const first = await complete(u, id);
    const second = await complete(u, id);
    expect(first.xp).toBe(25);
    expect(second.already_done).toBe(true);
    expect(second.xp).toBe(0);
    expect(await ledgerTotal(u)).toBe(25);
  });

  it("is race-safe: 10 simultaneous requests pay exactly once", async () => {
    const u = await createUser();
    const id = await addTask(u, { difficulty: "hard" });
    const results = await Promise.all(Array.from({ length: 10 }, () => complete(u, id)));
    expect(results.filter((r) => !r.already_done)).toHaveLength(1);
    expect(await ledgerTotal(u)).toBe(50);
    const rows = await admin.query("select count(*)::int n from xp_transactions where user_id=$1", [u]);
    expect(rows.rows[0].n).toBe(1);
  });

  it("pays a focused-work bonus only when most of the planned time was logged against the quest", async () => {
    const u = await createUser();
    const a = await addTask(u, { difficulty: "medium", category: "college", est_minutes: 40 });
    await asUser(u, (tx) => tx.q("insert into focus_sessions (category, session_date, minutes, task_id) values ('college', current_date, 20, $1)", [a]));
    expect((await complete(u, a)).bonus).toBe(0);                    // 20 of 40 min: no bonus
    const b = await addTask(u, { difficulty: "medium", category: "college", est_minutes: 40 });
    await asUser(u, (tx) => tx.q("insert into focus_sessions (category, session_date, minutes, task_id) values ('college', current_date, 35, $1)", [b]));
    const r = await complete(u, b);
    expect(r.bonus).toBe(6);                                          // floor(25 * 0.25)
    expect(r.xp).toBe(31);
    const t = await admin.query("select actual_minutes from tasks where id=$1", [b]);
    expect(t.rows[0].actual_minutes).toBe(35);                        // synced from the focus log
  });

  it("refuses quests scheduled for the future (no pre-completing a month of habits)", async () => {
    const u = await createUser();
    const id = await addTask(u, { scheduled_date: "2999-01-01" });
    const e = await failure(complete(u, id));
    expect(e.code).toBe("LV004");
    expect(await ledgerTotal(u)).toBe(0);
  });

  it("refuses recurring templates and non-open quests", async () => {
    const u = await createUser();
    const tpl = await asUser(u, async (tx) => (await tx.q(`insert into tasks (title,status,recurrence) values ('R','template','{"freq":"daily"}') returning id`)).rows[0].id);
    expect((await failure(complete(u, tpl))).code).toBe("LV003");
    const d = await addTask(u, { status: "discarded" });
    expect((await failure(complete(u, d))).code).toBe("LV003");
  });

  it("makes a boss quest wait for its open sub-quests", async () => {
    const u = await createUser();
    const boss = await addTask(u, { difficulty: "boss", quest_type: "boss" });
    const child = await addTask(u, { parent_id: boss });
    expect((await failure(complete(u, boss))).code).toBe("LV002");
    await complete(u, child);
    expect((await complete(u, boss)).xp).toBe(100);
  });
});

describe("undo", () => {
  it("removes exactly the XP that was paid and restores the quest", async () => {
    const u = await createUser();
    const id = await addTask(u, { difficulty: "hard" });
    await complete(u, id);
    const r = await undo(u, id);
    expect(r).toMatchObject({ undone: true, xp_removed: 50, total_xp: 0 });
    expect(await ledgerTotal(u)).toBe(0);
    const t = await admin.query("select status from tasks where id=$1", [id]);
    expect(t.rows[0].status).toBe("open");
    // history is preserved: +50 and a linked -50 reversal
    const l = await admin.query("select kind, amount from xp_transactions where user_id=$1 order by created_at, amount desc", [u]);
    expect(l.rows.map((x) => `${x.kind}:${x.amount}`)).toEqual(["quest:50", "reversal:-50"]);
  });

  it("is idempotent, and complete → undo → complete pays once overall", async () => {
    const u = await createUser();
    const id = await addTask(u, { difficulty: "medium" });
    await complete(u, id);
    await undo(u, id);
    expect((await undo(u, id)).undone).toBe(false);
    expect(await ledgerTotal(u)).toBe(0);
    const again = await complete(u, id);
    expect(again.xp).toBe(25);
    expect(await ledgerTotal(u)).toBe(25);
    // and a second round trip still nets out
    await undo(u, id);
    await complete(u, id);
    expect(await ledgerTotal(u)).toBe(25);
  });

  it("survives concurrent complete/undo storms without drifting", async () => {
    const u = await createUser();
    const id = await addTask(u, { difficulty: "easy" });
    await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? undo(u, id) : complete(u, id)).catch(() => null)));
    const st = (await admin.query("select status from tasks where id=$1", [id])).rows[0].status;
    expect(await ledgerTotal(u)).toBe(st === "done" ? 10 : 0);       // the ledger always matches the final state
  });
});

describe("levels and celebrations", () => {
  it("reports a level-up once, and not again after undo + redo", async () => {
    const u = await createUser();
    const id = await addTask(u, { difficulty: "boss", category: "dev" }); // 100 XP = level 2 at base 100
    const r = await complete(u, id);
    expect(r.level_before).toBe(1);
    expect(r.level_after).toBe(2);
    expect(r.level_ups.map((x: any) => `${x.scope}:${x.level}`).sort()).toEqual(["dev:2", "overall:2"]);
    await undo(u, id);
    const again = await complete(u, id);
    expect(again.level_after).toBe(2);
    expect(again.level_ups).toEqual([]);
    const ev = await admin.query("select count(*)::int n from activity_events where user_id=$1 and kind='level_up'", [u]);
    expect(ev.rows[0].n).toBe(2);
  });

  it("follows the configurable curve", async () => {
    const u = await createUser();
    await asUser(u, (tx) => tx.q("update user_settings set level_base=20, level_exponent=1.1"));
    const id = await addTask(u, { difficulty: "boss" });
    const r = await complete(u, id);
    expect(r.level_after).toBe(5);                                    // 100 XP on a 20-XP base curve; the default curve gives level 2
  });

  it("gives 'life' quests overall XP but no attribute level", async () => {
    const u = await createUser();
    const id = await addTask(u, { category: "life", difficulty: "boss" });
    const r = await complete(u, id);
    expect(r.level_ups.map((x: any) => x.scope)).toEqual(["overall"]);
  });
});

describe("requirement checks", () => {
  it("only pays a protein quest after the target is logged", async () => {
    const u = await createUser();
    const id = await addTask(u, { category: "health", verify: { kind: "protein" }, scheduled_date: null });
    const e = await failure(complete(u, id));
    expect(e.code).toBe("LV001");
    expect(e.message).toMatch(/protein/);
    await asUser(u, (tx) => tx.q("insert into nutrition_entries (logged_on, label, protein_g) values (current_date, 'Lunch', 70), (current_date, 'Dinner', 60)"));
    expect((await complete(u, id)).xp).toBe(10);
  });

  it("does not reward too little sleep", async () => {
    const u = await createUser();
    const id = await addTask(u, { category: "health", verify: { kind: "sleep" } });
    await asUser(u, (tx) => tx.q("insert into health_days (day, sleep_hours) values (current_date, 4.5)"));
    const e = await failure(complete(u, id));
    expect(e.code).toBe("LV001");
    expect(e.message).toMatch(/not rewarded/);
    await asUser(u, (tx) => tx.q("update health_days set sleep_hours=8 where day=current_date"));
    expect((await complete(u, id)).xp).toBe(10);
  });

  it("treats a planned rest day as a legitimate, rewarded quest", async () => {
    const u = await createUser();
    const id = await addTask(u, { category: "health", quest_type: "recovery", verify: { kind: "rest" } });
    expect((await failure(complete(u, id))).code).toBe("LV001");
    await asUser(u, (tx) => tx.q("insert into health_days (day, is_rest_day) values (current_date, true)"));
    expect((await complete(u, id)).xp).toBe(10);
  });

  it("checks focused minutes and shot attempts", async () => {
    const u = await createUser();
    const f = await addTask(u, { category: "college", verify: { kind: "focus", category: "college", minutes: 45 } });
    await asUser(u, (tx) => tx.q("insert into focus_sessions (category, session_date, minutes) values ('college', current_date, 30)"));
    expect((await failure(complete(u, f))).code).toBe("LV001");
    await asUser(u, (tx) => tx.q("insert into focus_sessions (category, session_date, minutes) values ('college', current_date, 20)"));
    expect((await complete(u, f)).xp).toBe(10);

    const s = await addTask(u, { verify: { kind: "shooting", attempts: 50 } });
    const m = await asUser(u, async (tx) => (await tx.q("insert into bball_metrics (name, kind) values ('Free throws','shooting') returning id")).rows[0].id);
    await asUser(u, (tx) => tx.q("insert into performance_logs (metric_id, logged_on, attempts, makes) values ($1, current_date, 50, 38)", [m]));
    expect((await complete(u, s)).xp).toBe(10);
  });

  it("rejects an unknown requirement kind rather than paying", async () => {
    const u = await createUser();
    const id = await addTask(u, { verify: { kind: "telepathy" } });
    expect((await failure(complete(u, id))).code).toBe("LV001");
  });
});

describe("time zones", () => {
  it("stamps completions with the user's local date, not the server's", async () => {
    const auckland = await createUser("Pacific/Auckland");
    const la = await createUser("America/Los_Angeles");
    const expected = async (tz: string) => (await admin.query("select to_char((now() at time zone $1)::date,'YYYY-MM-DD') d", [tz])).rows[0].d;
    for (const [uid, tz] of [[auckland, "Pacific/Auckland"], [la, "America/Los_Angeles"]] as const) {
      const id = await addTask(uid);
      await complete(uid, id);
      const r = await admin.query("select to_char(completed_on,'YYYY-MM-DD') d from task_completions where task_id=$1", [id]);
      expect(r.rows[0].d).toBe(await expected(tz));
      const x = await admin.query("select to_char(local_date,'YYYY-MM-DD') d from xp_transactions where task_id=$1", [id]);
      expect(x.rows[0].d).toBe(await expected(tz));
    }
  });
});

describe("streaks", () => {
  /** Back-date completions (arranged by the superuser) so we can test multi-day patterns. */
  async function seedDays(uid: string, offsets: number[]) {
    for (const off of offsets) {
      const id = await addTask(uid);
      await complete(uid, id);
      await admin.query("update task_completions set completed_on = current_date - $2::int where task_id=$1", [id, off]);
    }
  }
  const streak = async (u: string) => {
    const s = await summary(u);
    return [s.current_streak, s.best_streak];
  };

  it("counts consecutive active days and keeps yesterday's streak alive before today's first quest", async () => {
    const u = await createUser("UTC");
    await seedDays(u, [1, 2, 3]); // yesterday back to 3 days ago, nothing yet today
    // seedDays completes "today" then back-dates; today therefore has no completion
    expect(await streak(u)).toEqual([3, 3]);
  });

  it("breaks on a gap but remembers the best run", async () => {
    const u = await createUser("UTC");
    await seedDays(u, [0, 1, 4, 5, 6, 7]);
    expect(await streak(u)).toEqual([2, 4]);
  });

  it("lets planned rest days bridge a streak without adding to it", async () => {
    const u = await createUser("UTC");
    await seedDays(u, [0, 1, 3, 4]);       // gap on day 2
    expect(await streak(u)).toEqual([2, 2]);
    await asUser(u, (tx) => tx.q("insert into health_days (day, is_rest_day) values (current_date - 2, true)"));
    expect(await streak(u)).toEqual([4, 4]);
  });

  it("is zero with no activity", async () => {
    const u = await createUser();
    expect(await streak(u)).toEqual([0, 0]);
  });
});

describe("achievements, titles and rewards", () => {
  it("unlocks on the first quest and revokes when that quest is undone", async () => {
    const u = await createUser();
    const id = await addTask(u);
    const r = await complete(u, id);
    expect(r.achievements.map((a: any) => a.key)).toContain("first_quest");
    expect((await admin.query("select 1 from user_achievements where user_id=$1 and key='first_quest'", [u])).rowCount).toBe(1);
    await undo(u, id);
    expect((await admin.query("select 1 from user_achievements where user_id=$1 and key='first_quest'", [u])).rowCount).toBe(0);
  });

  it("only allows equipping titles that were earned", async () => {
    const u = await createUser();
    const e = await failure(asUser(u, (tx) => tx.q("update profiles set active_title='Champion'")));
    expect(e.code).toBe("42501");
    await asUser(u, (tx) => tx.q("update profiles set active_title='Rookie'"));
    // earn 'Adventurer' (overall level 5): 2 boss quests ≈ 200 XP isn't enough; push via a cheap curve
    await asUser(u, (tx) => tx.q("update user_settings set level_base=20"));
    for (let i = 0; i < 3; i++) await complete(u, await addTask(u, { difficulty: "boss" }));
    await asUser(u, (tx) => tx.q("update profiles set active_title='Adventurer'"));
    expect((await asUser(u, (tx) => tx.q("select active_title from profiles"))).rows[0].active_title).toBe("Adventurer");
  });

  it("only lets a reward be claimed once its milestone is reached", async () => {
    const u = await createUser();
    const rid = await asUser(u, async (tx) => (await tx.q("insert into rewards (title, unlock_kind, unlock_value) values ('New shoes','level',2) returning id")).rows[0].id);
    const claim = () => asUser(u, async (tx) => (await tx.q("select claim_reward($1) r", [rid])).rows[0].r);
    expect((await failure(claim())).code).toBe("LV005");
    await complete(u, await addTask(u, { difficulty: "boss" })); // 100 XP → level 2
    expect((await claim()).claimed).toBe(true);
    expect((await claim()).already).toBe(true);
    // clients cannot mark a reward claimed themselves
    const e1 = await failure(asUser(u, (tx) => tx.q("insert into rewards (title, unlock_kind, unlock_value, claimed_at) values ('x','level',99, now())")));
    expect(e1.code).toBe("42501");
    const locked = await asUser(u, async (tx) => (await tx.q("insert into rewards (title, unlock_kind, unlock_value) values ('y','level',99) returning id")).rows[0].id);
    const e2 = await failure(asUser(u, (tx) => tx.q("update rewards set claimed_at = now() where id=$1", [locked])));
    expect(e2.code).toBe("42501");
  });
});

describe("sample data and reset", () => {
  it("removes sample quests together with the XP they earned, leaving real progress alone", async () => {
    const u = await createUser();
    const real = await addTask(u, { difficulty: "medium", is_sample: false });
    const sample = await addTask(u, { difficulty: "hard", is_sample: true });
    await complete(u, real);
    await complete(u, sample);
    expect(await ledgerTotal(u)).toBe(75);
    const r = await asUser(u, async (tx) => (await tx.q("select remove_sample_data() r")).rows[0].r);
    expect(r).toMatchObject({ quests_removed: 1, xp_removed: 50 });
    expect(await ledgerTotal(u)).toBe(25);
    expect((await admin.query("select count(*)::int n from tasks where user_id=$1", [u])).rows[0].n).toBe(1);
  });

  it("reset_my_data wipes everything the user owns but keeps the account", async () => {
    const u = await createUser();
    await complete(u, await addTask(u));
    await asUser(u, (tx) => tx.q("insert into subjects (name) values ('Physics')"));
    await asUser(u, (tx) => tx.q("select reset_my_data()"));
    for (const t of ["tasks", "xp_transactions", "task_completions", "subjects", "activity_events", "user_achievements"]) {
      expect((await admin.query(`select count(*)::int n from ${t} where user_id=$1`, [u])).rows[0].n, t).toBe(0);
    }
    expect((await admin.query("select 1 from profiles where id=$1", [u])).rowCount).toBe(1);
  });
});
