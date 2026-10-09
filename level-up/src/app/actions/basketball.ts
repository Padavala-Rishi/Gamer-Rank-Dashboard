"use server";
import { revalidatePath } from "next/cache";
import { run, check, type ActionResult } from "@/lib/server/action";
import { getContext } from "@/lib/server/context";
import { ensureDefaultMetrics } from "@/lib/server/metrics";
import { performanceLogSchema, practiceSessionSchema, uuid } from "@/lib/schemas";

const refresh = () => revalidatePath("/", "layout");

function notFuture(day: string, today: string) {
  if (day > today) throw Object.assign(new Error("That date is in the future. Log it on the day."), { code: "LV001" });
}

/** Save a practice session with its drills. A session can be logged as done (with results) or saved as planned. */
export async function savePracticeSession(input: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { supabase, today } = await getContext();
    const { drills, ...s } = practiceSessionSchema.parse(input);
    if (s.status === "done") notFuture(s.session_date, today);
    const row = check(await supabase.from("practice_sessions").insert(s).select("id").single()) as { id: string };
    if (drills.length) {
      const res = await supabase.from("practice_drills").insert(drills.map((d, i) => ({ ...d, session_id: row.id, sort_order: i + 1 })), { defaultToNull: false }).select("id");
      if (res.error) {
        await supabase.from("practice_sessions").delete().eq("id", row.id); // don't leave an empty shell behind
        throw res.error;
      }
    }
    refresh();
    return { id: row.id };
  });
}

export async function deletePracticeSession(id: string): Promise<ActionResult> {
  return run(async () => {
    uuid.parse(id);
    const { supabase } = await getContext();
    check(await supabase.from("practice_sessions").delete().eq("id", id).select("id"));
    refresh();
  });
}

export async function logPerformance(input: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { supabase, today } = await getContext();
    const v = performanceLogSchema.parse(input);
    notFuture(v.logged_on, today);
    const row = check(await supabase.from("performance_logs").insert(v).select("id").single()) as { id: string };
    refresh();
    return { id: row.id };
  });
}

export async function deletePerformanceLog(id: string): Promise<ActionResult> {
  return run(async () => {
    uuid.parse(id);
    const { supabase } = await getContext();
    check(await supabase.from("performance_logs").delete().eq("id", id).select("id"));
    refresh();
  });
}

export async function seedMetrics(): Promise<ActionResult> {
  return run(async () => { const { supabase } = await getContext(); await ensureDefaultMetrics(supabase); refresh(); });
}
