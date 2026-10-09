import { notifyChange } from "@/db/events";
import { run, check, type ActionResult } from "@/lib/data/action";
import { getContext } from "@/lib/data/context";
import { loadSampleData } from "@/lib/data/sample";

const refresh = () => notifyChange();

export async function loadSample(): Promise<ActionResult<{ loaded: boolean }>> {
  return run(async () => { const r = await loadSampleData(); refresh(); return r; });
}

export async function removeSample(): Promise<ActionResult<{ quests_removed: number; xp_removed: number }>> {
  return run(async () => {
    const { supabase } = await getContext();
    const r = check(await supabase.rpc("remove_sample_data")) as unknown as { quests_removed: number; xp_removed: number };
    refresh();
    return r;
  });
}

/** Wipe all progress and records (account, profile and settings are kept). */
export async function resetAllData(confirm: string): Promise<ActionResult> {
  return run(async () => {
    if (confirm !== "RESET") throw Object.assign(new Error('Type RESET to confirm.'), { code: "LV001" });
    const { supabase } = await getContext();
    check(await supabase.rpc("reset_my_data"));
    refresh();
  });
}
