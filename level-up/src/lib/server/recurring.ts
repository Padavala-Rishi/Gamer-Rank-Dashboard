import type { Supa } from "../supabase/server";
import { addDays, type YMD } from "../dates";
import { occurrencesBetween, isRecurrence } from "../game/recurrence";
import type { Task } from "../types";

const COPY = ["title", "description", "notes", "category", "subcategory", "difficulty", "quest_type", "priority", "est_minutes", "scheduled_time", "subject_id", "project_id", "verify", "is_sample"] as const;

export function instanceRow(tpl: Task, date: YMD) {
  const row: Record<string, unknown> = { template_id: tpl.id, scheduled_date: date, status: "open" };
  for (const k of COPY) row[k] = (tpl as unknown as Record<string, unknown>)[k];
  return row;
}

/** Dates of the template's occurrences in [from, to] that don't exist yet. */
export function missingDates(tpl: Task, existing: Set<YMD>, from: YMD, to: YMD): YMD[] {
  if (!isRecurrence(tpl.recurrence)) return [];
  return occurrencesBetween(tpl.recurrence, from, to).filter((d) => !existing.has(d));
}

/**
 * Make sure every repeating quest has a dated instance for the next two weeks. Idempotent: the unique index on
 * (template_id, scheduled_date) plus ON CONFLICT DO NOTHING means concurrent calls cannot create duplicates.
 */
export async function ensureRecurring(supabase: Supa, today: YMD, days = 14): Promise<number> {
  const to = addDays(today, days - 1);
  const { data: templates } = await supabase.from("tasks").select("*").eq("status", "template");
  if (!templates?.length) return 0;
  const { data: existing } = await supabase.from("tasks").select("template_id,scheduled_date").in("template_id", templates.map((t) => t.id)).gte("scheduled_date", today).lte("scheduled_date", to);
  const have = new Map<string, Set<YMD>>();
  for (const e of existing ?? []) {
    if (!have.has(e.template_id)) have.set(e.template_id, new Set());
    have.get(e.template_id)!.add(e.scheduled_date);
  }
  const rows: Record<string, unknown>[] = [];
  for (const t of templates as Task[]) for (const d of missingDates(t, have.get(t.id) ?? new Set(), today, to)) rows.push(instanceRow(t, d));
  if (!rows.length) return 0;
  const { error } = await supabase.from("tasks").upsert(rows, { onConflict: "template_id,scheduled_date", ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}
