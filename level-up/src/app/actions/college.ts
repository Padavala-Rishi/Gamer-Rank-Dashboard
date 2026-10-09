"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run, check, type ActionResult } from "@/lib/server/action";
import { getContext } from "@/lib/server/context";
import { nextRevisionDate } from "@/lib/game/domain";
import { focusSessionSchema, uuid } from "@/lib/schemas";

const refresh = () => revalidatePath("/", "layout");

/** Mark a syllabus item todo / learning / done. Finishing one schedules its first revision for tomorrow. */
export async function setNodeStatus(id: string, status: "todo" | "learning" | "done"): Promise<ActionResult> {
  return run(async () => {
    uuid.parse(id);
    z.enum(["todo", "learning", "done"]).parse(status);
    const { supabase, today } = await getContext();
    const { data: n } = await supabase.from("syllabus_nodes").select("revision_count").eq("id", id).single();
    const patch = status === "done"
      ? { status, done_on: today, next_revision_on: nextRevisionDate(today, n?.revision_count ?? 0) }
      : { status, done_on: null, next_revision_on: null };
    check(await supabase.from("syllabus_nodes").update(patch).eq("id", id).select("id").single());
    refresh();
  });
}

/** Record a revision: the next one is pushed out on a spaced schedule (1, 3, 7, 14, 30, 60 days). */
export async function reviseNode(id: string): Promise<ActionResult<{ next: string; count: number }>> {
  return run(async () => {
    uuid.parse(id);
    const { supabase, today } = await getContext();
    const { data: n } = await supabase.from("syllabus_nodes").select("revision_count,status").eq("id", id).single();
    if (!n) throw Object.assign(new Error("Not found"), { code: "P0002" });
    const count = n.revision_count + 1;
    const next = nextRevisionDate(today, count);
    check(await supabase.from("syllabus_nodes").update({ revision_count: count, last_revised_on: today, next_revision_on: next, status: "done" }).eq("id", id).select("id").single());
    refresh();
    return { next, count };
  });
}

export async function logFocusSession(input: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { supabase, today } = await getContext();
    const v = focusSessionSchema.parse(input);
    if (v.session_date > today) throw Object.assign(new Error("That date is in the future."), { code: "LV001" });
    const row = check(await supabase.from("focus_sessions").insert(v).select("id").single()) as { id: string };
    refresh();
    return { id: row.id };
  });
}

export async function deleteFocusSession(id: string): Promise<ActionResult> {
  return run(async () => {
    uuid.parse(id);
    const { supabase } = await getContext();
    check(await supabase.from("focus_sessions").delete().eq("id", id).select("id"));
    refresh();
  });
}
