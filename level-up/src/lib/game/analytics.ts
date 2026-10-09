import { addDays, diffDays, eachDay, isoWeekday, type YMD } from "../dates";
import { CATEGORY_KEYS, CATEGORIES, type AnyCategory, type CategoryKey } from "../constants";

// Pure aggregations over recorded rows. Nothing here invents data: when there is too little history the
// functions return null / empty and the UI says so.

export type XpRow = { day: YMD; category: AnyCategory; xp: number };
export type XpPoint = { day: YMD; total: number } & Record<AnyCategory, number>;

export function xpSeries(rows: XpRow[], from: YMD, to: YMD): XpPoint[] {
  const map = new Map<YMD, XpPoint>();
  for (const d of eachDay(from, to)) map.set(d, { day: d, total: 0, basketball: 0, college: 0, dev: 0, health: 0, life: 0 });
  for (const r of rows) {
    const p = map.get(r.day);
    if (!p) continue;
    p[r.category] += r.xp;
    p.total += r.xp;
  }
  return [...map.values()];
}

export function sumXpByCategory(rows: XpRow[], from: YMD, to: YMD): Record<AnyCategory, number> {
  const out: Record<AnyCategory, number> = { basketball: 0, college: 0, dev: 0, health: 0, life: 0 };
  for (const r of rows) if (r.day >= from && r.day <= to) out[r.category] += r.xp;
  return out;
}

export type TaskForRate = { status: string; scheduled_date: YMD | null };
/** Of the quests that were planned for [from, to] (up to today), how many were done. Skipped/discarded are not counted against you. */
export function completionRate(tasks: TaskForRate[], from: YMD, to: YMD, today: YMD): { done: number; planned: number; rate: number | null } {
  const end = to < today ? to : today;
  let done = 0, open = 0;
  for (const t of tasks) {
    if (!t.scheduled_date || t.scheduled_date < from || t.scheduled_date > end) continue;
    if (t.status === "done") done++;
    else if (t.status === "open") open++;
  }
  const planned = done + open;
  return { done, planned, rate: planned ? done / planned : null };
}

export type TimeInputs = {
  focus: { category: string; session_date: YMD; minutes: number }[];
  practice: { session_date: YMD; duration_min: number | null; status: string }[];
  workouts: { workout_date: YMD; duration_min: number | null }[];
  mobility: { day: YMD; mobility_min: number }[];
};

/** Minutes you actually logged per domain. These are recorded values, not estimates. */
export function timeByDomain(i: TimeInputs, from: YMD, to: YMD): Record<CategoryKey, number> {
  const inR = (d: YMD) => d >= from && d <= to;
  const out: Record<CategoryKey, number> = { basketball: 0, college: 0, dev: 0, health: 0 };
  for (const f of i.focus) if (inR(f.session_date) && f.category in out) out[f.category as CategoryKey] += f.minutes;
  for (const p of i.practice) if (p.status === "done" && inR(p.session_date)) out.basketball += p.duration_min ?? 0;
  for (const w of i.workouts) if (inR(w.workout_date)) out.health += w.duration_min ?? 0;
  for (const m of i.mobility) if (inR(m.day)) out.health += m.mobility_min;
  return out;
}

export type Lead = { status: string };
export type Outreach = { kind: string; occurred_on: YMD };
export function funnel(leads: Lead[]) {
  const c = (s: string) => leads.filter((l) => l.status === s).length;
  const reached = leads.filter((l) => l.status !== "identified").length;
  const replied = leads.filter((l) => ["replied", "meeting", "proposal", "won"].includes(l.status)).length;
  const won = c("won"), lost = c("lost");
  const decided = won + lost;
  return {
    total: leads.length, contacted: reached, replied, won, lost,
    // rates are only meaningful with a few data points; otherwise null
    replyRate: reached >= 5 ? replied / reached : null,
    winRate: decided >= 3 ? won / decided : null,
  };
}

export type Money = { id?: string; kind: "invoice" | "payment"; amount: number | string; currency: string; occurred_on: YMD; invoice_id: string | null };
export type CurrencyTotals = { currency: string; invoiced: number; received: number; outstanding: number };
/** Money comes only from records you entered. Currencies are never converted or mixed. */
export function incomeSummary(records: Money[], from?: YMD, to?: YMD): CurrencyTotals[] {
  const by = new Map<string, CurrencyTotals>();
  const get = (c: string) => { if (!by.has(c)) by.set(c, { currency: c, invoiced: 0, received: 0, outstanding: 0 }); return by.get(c)!; };
  for (const r of records) {
    if (from && r.occurred_on < from) continue;
    if (to && r.occurred_on > to) continue;
    const row = get(r.currency);
    const a = Number(r.amount);
    if (r.kind === "invoice") row.invoiced += a; else row.received += a;
  }
  // outstanding is always computed over the whole ledger: unpaid invoices don't expire
  const invoices = records.filter((r) => r.kind === "invoice");
  const paidByInvoice = new Map<string, number>();
  for (const r of records) if (r.kind === "payment" && r.invoice_id) paidByInvoice.set(r.invoice_id, (paidByInvoice.get(r.invoice_id) ?? 0) + Number(r.amount));
  for (const inv of invoices as (Money & { id?: string })[]) {
    const paid = inv.id ? paidByInvoice.get(inv.id) ?? 0 : 0;
    get(inv.currency).outstanding += Math.max(0, Number(inv.amount) - paid);
  }
  return [...by.values()];
}

// ───────────────────────── insights ─────────────────────────

export type Insight = {
  id: string;
  tone: "info" | "good" | "warn";
  text: string;
  /** what the statement is based on */
  basis: "recorded" | "estimate";
  evidence?: string;
};

export type InsightInput = {
  today: YMD;
  xpRows: XpRow[];            // last ≥ 28 days
  activeDates: YMD[];         // all-time distinct days with a completed quest
  restDates?: YMD[];
  lastActivity: Partial<Record<CategoryKey, YMD | null>>; // most recent XP day per domain, all-time
  weekMinutes?: Partial<Record<CategoryKey, number>>;
  weeklyTargets?: Partial<Record<CategoryKey, number>>;
};

const MIN_HISTORY_DAYS = 7;
const MIN_ACTIVE_DAYS = 4;

export function buildInsights(i: InsightInput): Insight[] {
  const out: Insight[] = [];
  const active = [...new Set(i.activeDates)].sort();
  const first = active[0];
  if (!first || diffDays(first, i.today) < MIN_HISTORY_DAYS - 1 || active.length < MIN_ACTIVE_DAYS) {
    return [{ id: "need-data", tone: "info", basis: "recorded", text: `Insights need a little history. Keep logging for about a week (at least ${MIN_ACTIVE_DAYS} active days) and they'll appear here.` }];
  }
  const rest = new Set(i.restDates ?? []);
  const act = new Set(active);
  const keptIn = (from: YMD, to: YMD) => eachDay(from, to).filter((d) => act.has(d) || rest.has(d)).length;

  // 1) consistency trend: needs two full 7-day windows of history
  if (diffDays(first, i.today) >= 13) {
    const cur = keptIn(addDays(i.today, -6), i.today), prev = keptIn(addDays(i.today, -13), addDays(i.today, -7));
    const diff = cur - prev;
    if (diff >= 2) out.push({ id: "trend-up", tone: "good", basis: "recorded", text: `Consistency is improving: ${cur} of the last 7 days kept, up from ${prev} the week before.` });
    else if (diff <= -2) out.push({ id: "trend-down", tone: "warn", basis: "recorded", text: `Consistency dipped: ${cur} of the last 7 days kept, down from ${prev}. A smaller daily minimum may help.` });
    else out.push({ id: "trend-flat", tone: "info", basis: "recorded", text: `Consistency is steady: ${cur} of the last 7 days kept (${prev} the week before).` });
  }

  // 2) neglected domains, last 14 days
  const from14 = addDays(i.today, -13);
  const xp = sumXpByCategory(i.xpRows, from14, i.today);
  const total = CATEGORY_KEYS.reduce((a, k) => a + xp[k], 0);
  if (total >= 100) {
    const strong = CATEGORY_KEYS.filter((k) => xp[k] / total >= 0.15);
    for (const k of CATEGORY_KEYS) {
      const share = xp[k] / total;
      if (share < 0.1 && strong.length >= 2 && strong.some((s) => s !== k)) {
        out.push({
          id: `neglect-${k}`, tone: "warn", basis: "recorded",
          text: `${CATEGORIES[k].name} received ${Math.round(share * 100)}% of your XP in the last 14 days.`,
          evidence: `${xp[k]} of ${total} XP`,
        });
      }
    }
  }
  // 3) gone quiet in a domain you have worked on before
  for (const k of CATEGORY_KEYS) {
    const last = i.lastActivity[k];
    if (last && diffDays(last, i.today) >= 7 && !out.some((o) => o.id === `neglect-${k}`)) {
      out.push({ id: `quiet-${k}`, tone: "warn", basis: "recorded", text: `No ${CATEGORIES[k].name} activity recorded for ${diffDays(last, i.today)} days.` });
    }
  }
  // 4) weekly time targets (recorded minutes vs the target you set)
  for (const k of CATEGORY_KEYS) {
    const target = i.weeklyTargets?.[k], got = i.weekMinutes?.[k];
    if (target && got != null && diffDays(first, i.today) >= 6) {
      const pct = Math.round((got / target) * 100);
      if (pct < 50 && isoWeekday(i.today) >= 5) out.push({ id: `target-${k}`, tone: "warn", basis: "recorded", text: `${CATEGORIES[k].name}: ${pct}% of this week's time target logged so far.`, evidence: `${got} of ${target} min` });
      if (pct >= 100) out.push({ id: `target-${k}`, tone: "good", basis: "recorded", text: `${CATEGORIES[k].name}: weekly time target reached (${pct}%).`, evidence: `${got} of ${target} min` });
    }
  }
  return out;
}

export function lastActivityByCategory(rows: { category: AnyCategory; local_date: YMD }[]): Partial<Record<CategoryKey, YMD>> {
  const out: Partial<Record<CategoryKey, YMD>> = {};
  for (const r of rows) {
    if (r.category === "life") continue;
    const k = r.category as CategoryKey;
    if (!out[k] || r.local_date > out[k]!) out[k] = r.local_date;
  }
  return out;
}
