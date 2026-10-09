"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run, check, type ActionResult } from "@/lib/server/action";
import { getContext } from "@/lib/server/context";
import { newPersonalRecords, type SetRow } from "@/lib/game/domain";
import { healthDaySchema, uuid, workoutSchema, ymd } from "@/lib/schemas";

const refresh = () => revalidatePath("/", "layout");

function notFuture(day: string, today: string) {
  if (day > today) throw Object.assign(new Error("That date is in the future. Log it on the day."), { code: "LV001" });
}

/** Add (or subtract) water for a day; clamps between 0 and 15 L. */
export async function addWater(day: string, ml: number): Promise<ActionResult<{ water_ml: number }>> {
  return run(async () => {
    ymd.parse(day);
    const delta = z.number().int().min(-5000).max(5000).parse(ml);
    const { supabase, user, today } = await getContext();
    notFuture(day, today);
    const { data: cur } = await supabase.from("health_days").select("water_ml").eq("day", day).maybeSingle();
    const next = Math.max(0, Math.min(15000, (cur?.water_ml ?? 0) + delta));
    check(await supabase.from("health_days").upsert({ user_id: user.id, day, water_ml: next }, { onConflict: "user_id,day" }).select("day"));
    refresh();
    return { water_ml: next };
  });
}

/** Save sleep, mobility, notes or the rest-day flag for a day. Only the fields you pass are changed. */
export async function saveHealthDay(input: unknown): Promise<ActionResult> {
  return run(async () => {
    const { supabase, user, today } = await getContext();
    const v = healthDaySchema.parse(input);
    notFuture(v.day, today);
    const row: Record<string, unknown> = { user_id: user.id };
    for (const [k, val] of Object.entries(v)) if (val !== undefined) row[k] = val;
    check(await supabase.from("health_days").upsert(row, { onConflict: "user_id,day" }).select("day"));
    refresh();
  });
}

/** Log a workout with its sets. Returns exercises where a set beat everything logged before (a personal record). */
export async function logWorkout(input: unknown): Promise<ActionResult<{ id: string; prs: string[] }>> {
  return run(async () => {
    const { supabase, today } = await getContext();
    const { sets, ...w } = workoutSchema.parse(input);
    notFuture(w.workout_date, today);
    let history: SetRow[] = [];
    const names = [...new Set(sets.map((s) => s.exercise.trim()))];
    if (names.length) {
      const { data } = await supabase.from("workout_sets").select("exercise,reps,weight_kg").in("exercise", names);
      history = (data ?? []).map((r) => ({ exercise: r.exercise, reps: r.reps, weight_kg: Number(r.weight_kg) }));
    }
    const row = check(await supabase.from("workouts").insert(w).select("id").single()) as { id: string };
    if (sets.length) {
      const res = await supabase.from("workout_sets").insert(sets.map((s) => ({ ...s, workout_id: row.id })), { defaultToNull: false }).select("id");
      if (res.error) { await supabase.from("workouts").delete().eq("id", row.id); throw res.error; }
    }
    refresh();
    return { id: row.id, prs: newPersonalRecords(history, sets) };
  });
}

export async function deleteWorkout(id: string): Promise<ActionResult> {
  return run(async () => {
    uuid.parse(id);
    const { supabase } = await getContext();
    check(await supabase.from("workouts").delete().eq("id", id).select("id"));
    refresh();
  });
}
