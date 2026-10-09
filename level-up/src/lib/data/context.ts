import { LOCAL_USER_ID } from "@/db/bootstrap";
import { createClient } from "@/db/client";
import { registerReset } from "@/db/events";
import { todayIn } from "../dates";
import { curvesFromSettings } from "../game/xp";
import type { Profile, ProgressSummary, Settings } from "../types";

async function build() {
  const supabase = await createClient();
  const user = { id: LOCAL_USER_ID };
  const load = () => Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
  ]);
  let [p, s] = await load();
  if (!p.data || !s.data) {
    await supabase.rpc("ensure_profile");
    [p, s] = await load();
  }
  if (!p.data || !s.data) throw new Error("Could not load your profile");
  const profile = p.data as Profile;
  const settings = s.data as Settings;
  return {
    supabase, user, profile, settings,
    today: todayIn(profile.timezone),
    curves: curvesFromSettings(settings),
  };
}

export type Ctx = Awaited<ReturnType<typeof build>>;

// Reads are memoised so a page, its layout and its helpers share one query; any write (notifyChange) clears them.
let ctx: Promise<Ctx> | null = null;
let progress: Promise<ProgressSummary> | null = null;
registerReset(() => { ctx = null; progress = null; });

/** The on-device user's profile, settings and today's date (in their time zone). */
export function getContext(): Promise<Ctx> {
  if (!ctx) {
    const p = build();
    ctx = p;
    p.catch(() => { if (ctx === p) ctx = null; });
  }
  return ctx;
}

/** XP per domain, streaks and achievement metrics: computed in the database from the ledger. */
export function getProgress(): Promise<ProgressSummary> {
  if (!progress) {
    const p = (async () => {
      const { supabase } = await getContext();
      const { data, error } = await supabase.rpc("progress_summary");
      if (error) throw error;
      return data as ProgressSummary;
    })();
    progress = p;
    p.catch(() => { if (progress === p) progress = null; });
  }
  return progress;
}
