import { afterAll, describe, expect, it } from "vitest";
import { admin, addTask, asUser, createUser, failure } from "./helpers";

afterAll(() => admin.end());

describe("schema", () => {
  it("has row level security enabled on every table in public", async () => {
    const { rows } = await admin.query(
      `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("seeds the categories and a non-trivial achievement catalog", async () => {
    const cats = await admin.query("select key from categories order by sort");
    expect(cats.rows.map((r) => r.key)).toEqual(["basketball", "college", "dev", "health", "life"]);
    const ach = await admin.query("select count(*)::int n from achievement_defs");
    expect(ach.rows[0].n).toBeGreaterThan(40);
  });

  it("creates a profile and default settings automatically on signup", async () => {
    const uid = await createUser();
    const p = await asUser(uid, (tx) => tx.q("select character_name, timezone from profiles"));
    const s = await asUser(uid, (tx) => tx.q("select level_base, daily_task_limit, currency from user_settings"));
    expect(p.rows).toHaveLength(1);
    expect(Number(s.rows[0].level_base)).toBe(100);
    expect(s.rows[0].currency).toBe("INR");
  });
});

describe("user data isolation (RLS)", () => {
  it("never shows another user's rows and rejects writes to them", async () => {
    const a = await createUser();
    const b = await createUser();
    const taskA = await addTask(a, { title: "A's private quest" });
    const subjA = await asUser(a, async (tx) => (await tx.q("insert into subjects (name) values ('Maths') returning id")).rows[0].id);

    expect((await asUser(b, (tx) => tx.q("select id from tasks"))).rows).toHaveLength(0);
    expect((await asUser(b, (tx) => tx.q("select id from subjects"))).rows).toHaveLength(0);
    // update / delete of someone else's row silently match nothing
    expect((await asUser(b, (tx) => tx.q("update tasks set title='hacked' where id=$1", [taskA]))).rowCount).toBe(0);
    expect((await asUser(b, (tx) => tx.q("delete from tasks where id=$1", [taskA]))).rowCount).toBe(0);
    // inserting a row owned by someone else is rejected
    const e1 = await failure(asUser(b, (tx) => tx.q("insert into tasks (user_id, title) values ($1,'x')", [a])));
    expect(e1.message).toMatch(/row-level security/);
    // referencing someone else's parent row is impossible (composite FK)
    const e2 = await failure(asUser(b, (tx) => tx.q("insert into tasks (title, subject_id) values ('x',$1)", [subjA])));
    expect(e2.code).toBe("23503");
    const title = await admin.query("select title from tasks where id=$1", [taskA]);
    expect(title.rows[0].title).toBe("A's private quest");
  });

  it("scopes the XP summary to the caller", async () => {
    const a = await createUser();
    const b = await createUser();
    const id = await addTask(a, { difficulty: "hard" });
    await asUser(a, (tx) => tx.q("select complete_task($1,null)", [id]));
    const sa = await asUser(a, async (tx) => (await tx.q("select progress_summary() s")).rows[0].s);
    const sb = await asUser(b, async (tx) => (await tx.q("select progress_summary() s")).rows[0].s);
    expect(sa.xp_by_category.basketball).toBe(50);
    expect(sb.xp_by_category).toEqual({});
  });

  it("cannot complete or undo another user's quest", async () => {
    const a = await createUser();
    const b = await createUser();
    const id = await addTask(a);
    const e = await failure(asUser(b, (tx) => tx.q("select complete_task($1,null)", [id])));
    expect(e.code).toBe("P0002");
  });
});

describe("clients cannot write XP or bypass the engine", () => {
  it("rejects direct inserts into trusted tables", async () => {
    const u = await createUser();
    for (const sql of [
      "insert into xp_transactions (category, amount, kind, local_date) values ('dev', 9999, 'quest', current_date)",
      "insert into task_completions (task_id, category, completed_on) values (gen_random_uuid(), 'dev', current_date)",
      "insert into user_achievements (key) values ('level_20')",
      "insert into activity_events (kind, title) values ('level_up','fake')",
    ]) {
      const e = await failure(asUser(u, (tx) => tx.q(sql)));
      expect(e.code, sql).toBe("42501");
    }
  });

  it("rejects marking a quest done (or inserting it as done) without complete_task", async () => {
    const u = await createUser();
    const id = await addTask(u);
    const e1 = await failure(asUser(u, (tx) => tx.q("update tasks set status='done' where id=$1", [id])));
    expect(e1.code).toBe("42501");
    const e2 = await failure(asUser(u, (tx) => tx.q("insert into tasks (title, status) values ('x','done')")));
    expect(e2.code).toBe("42501");
    const e3 = await failure(asUser(u, (tx) => tx.q("update xp_transactions set amount=1")));
    expect(e3.code).toBe("42501");
  });

  it("locks the reward of a completed quest and blocks deleting it", async () => {
    const u = await createUser();
    const id = await addTask(u);
    await asUser(u, (tx) => tx.q("select complete_task($1,null)", [id]));
    const e1 = await failure(asUser(u, (tx) => tx.q("update tasks set difficulty='boss' where id=$1", [id])));
    expect(e1.message).toMatch(/Undo the quest/);
    const e2 = await failure(asUser(u, (tx) => tx.q("delete from tasks where id=$1", [id])));
    expect(e2.message).toMatch(/Undo a completed quest/);
    // harmless edits are still fine
    await asUser(u, (tx) => tx.q("update tasks set notes='nice' where id=$1", [id]));
  });

  it("does not expose internal helper functions or let anon touch data", async () => {
    const u = await createUser();
    const e1 = await failure(asUser(u, (tx) => tx.q("select _user_metrics($1)", [u])));
    expect(e1.code).toBe("42501");
    const e2 = await failure(asUser(null, (tx) => tx.q("select * from tasks")));
    expect(e2.code).toBe("42501");
    const e3 = await failure(asUser(null, (tx) => tx.q("select complete_task(gen_random_uuid(), null)")));
    expect(e3.code).toBe("42501");
  });

  it("rejects out-of-range XP configuration and unknown time zones", async () => {
    const u = await createUser();
    const e1 = await failure(asUser(u, (tx) => tx.q(`update user_settings set xp_values='{"easy":10,"medium":25,"hard":50,"boss":99999}'`)));
    expect(e1.code).toBe("23514");
    const e2 = await failure(asUser(u, (tx) => tx.q("update profiles set timezone='Mars/Olympus'")));
    expect(e2.code).toBe("22023");
  });

  it("only lets payments reference invoices of the same user, and money must be positive", async () => {
    const a = await createUser();
    const b = await createUser();
    const inv = await asUser(a, async (tx) => (await tx.q("insert into income_records (kind, amount, occurred_on) values ('invoice', 5000, current_date) returning id")).rows[0].id);
    const e1 = await failure(asUser(b, (tx) => tx.q("insert into income_records (kind, amount, occurred_on, invoice_id) values ('payment', 100, current_date, $1)", [inv])));
    expect(e1.code).toBe("23503");
    const e2 = await failure(asUser(a, (tx) => tx.q("insert into income_records (kind, amount, occurred_on) values ('payment', -5, current_date)")));
    expect(e2.code).toBe("23514");
  });

  it("makes recurring occurrences unique per template and day", async () => {
    const u = await createUser();
    const tpl = await asUser(u, async (tx) => (await tx.q(`insert into tasks (title, status, recurrence) values ('Daily', 'template', '{"freq":"daily"}') returning id`)).rows[0].id);
    await asUser(u, (tx) => tx.q("insert into tasks (title, template_id, scheduled_date) values ('Daily', $1, '2026-01-01')", [tpl]));
    const e = await failure(asUser(u, (tx) => tx.q("insert into tasks (title, template_id, scheduled_date) values ('Daily', $1, '2026-01-01')", [tpl])));
    expect(e.code).toBe("23505");
    // the PostgREST upsert (ON CONFLICT DO NOTHING) form works
    const r = await asUser(u, (tx) => tx.q("insert into tasks (title, template_id, scheduled_date) values ('Daily', $1, '2026-01-01') on conflict (template_id, scheduled_date) do nothing", [tpl]));
    expect(r.rowCount).toBe(0);
  });
});
