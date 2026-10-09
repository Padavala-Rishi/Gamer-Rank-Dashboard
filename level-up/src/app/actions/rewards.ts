"use server";
import { revalidatePath } from "next/cache";
import { run, check, type ActionResult } from "@/lib/server/action";
import { getContext } from "@/lib/server/context";
import { uuid } from "@/lib/schemas";

/** Claim a self-defined reward. The database refuses unless the milestone has genuinely been reached. */
export async function claimReward(id: string): Promise<ActionResult> {
  return run(async () => {
    uuid.parse(id);
    const { supabase } = await getContext();
    check(await supabase.rpc("claim_reward", { p_id: id }));
    revalidatePath("/", "layout");
  });
}
