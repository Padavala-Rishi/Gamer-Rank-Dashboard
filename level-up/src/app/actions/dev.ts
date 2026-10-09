import { notifyChange } from "@/db/events";
import { z } from "zod";
import { run, check, type ActionResult } from "@/lib/data/action";
import { getContext } from "@/lib/data/context";
import { addDays } from "@/lib/dates";
import { LEAD_STATUSES, PROJECT_STAGES } from "@/lib/constants";
import { uuid } from "@/lib/schemas";

const refresh = () => notifyChange();

const OUTREACH_FOR: Record<string, "message" | "reply" | "meeting" | "proposal" | "note"> = {
  contacted: "message", replied: "reply", meeting: "meeting", proposal: "proposal", won: "note", lost: "note",
};

/** Move a lead along the pipeline. The change is logged as an outreach entry and a follow-up is scheduled where it makes sense. */
export async function setLeadStatus(id: string, status: string, lostReason?: string): Promise<ActionResult> {
  return run(async () => {
    uuid.parse(id);
    z.enum(LEAD_STATUSES).parse(status);
    const { supabase, today } = await getContext();
    const { data: lead } = await supabase.from("freelance_leads").select("status").eq("id", id).single();
    if (!lead) throw Object.assign(new Error("Not found"), { code: "P0002" });
    if (lead.status === status) return;
    const patch: Record<string, unknown> = { status, status_changed_at: new Date().toISOString() };
    if (status === "contacted" || status === "proposal") patch.next_followup_on = addDays(today, 3);
    if (status === "meeting") patch.next_followup_on = addDays(today, 2);
    if (status === "won" || status === "lost") patch.next_followup_on = null;
    if (status === "lost" && lostReason) patch.lost_reason = lostReason.slice(0, 300);
    check(await supabase.from("freelance_leads").update(patch).eq("id", id).select("id").single());
    const kind = OUTREACH_FOR[status];
    if (kind) check(await supabase.from("outreach_log").insert({ lead_id: id, kind, occurred_on: today, summary: `Status → ${status}` }).select("id"));
    refresh();
  });
}

export async function setProjectStage(id: string, stage: string): Promise<ActionResult> {
  return run(async () => {
    uuid.parse(id);
    z.enum(PROJECT_STAGES).parse(stage);
    const { supabase, today } = await getContext();
    const patch: Record<string, unknown> = { stage };
    if (stage === "building") patch.started_on = today;
    if (stage === "deployed") patch.deployed_on = today;
    if (stage === "completed") patch.completed_on = today;
    const { data: cur } = await supabase.from("projects").select("started_on,deployed_on,completed_on").eq("id", id).single();
    if (cur?.started_on && patch.started_on) delete patch.started_on;       // keep the original dates
    if (cur?.deployed_on && patch.deployed_on) delete patch.deployed_on;
    if (cur?.completed_on && patch.completed_on) delete patch.completed_on;
    check(await supabase.from("projects").update(patch).eq("id", id).select("id").single());
    refresh();
  });
}

export async function setRoadmapStatus(id: string, status: "todo" | "doing" | "done"): Promise<ActionResult> {
  return run(async () => {
    uuid.parse(id);
    z.enum(["todo", "doing", "done"]).parse(status);
    const { supabase, today } = await getContext();
    check(await supabase.from("roadmap_items").update({ status, done_on: status === "done" ? today : null }).eq("id", id).select("id").single());
    refresh();
  });
}

/** Bump the feature counter on a project. */
export async function bumpFeature(id: string, delta: 1 | -1): Promise<ActionResult> {
  return run(async () => {
    uuid.parse(id);
    const { supabase } = await getContext();
    const { data: p } = await supabase.from("projects").select("features_done,features_total").eq("id", id).single();
    if (!p) throw Object.assign(new Error("Not found"), { code: "P0002" });
    const done = Math.max(0, Math.min(p.features_total, p.features_done + delta));
    check(await supabase.from("projects").update({ features_done: done }).eq("id", id).select("id").single());
    refresh();
  });
}
