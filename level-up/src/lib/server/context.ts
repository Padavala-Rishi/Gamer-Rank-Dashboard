import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import { todayIn } from "../dates";
import { curvesFromSettings } from "../game/xp";
import type { Profile, ProgressSummary, Settings } from "../types";

/** The signed-in user's context for this request (deduplicated across layout + page). Redirects to /login if signed out. */
export const getContext = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) redirect("/login");

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
});

export type Ctx = Awaited<ReturnType<typeof getContext>>;

/** XP per domain, streaks and achievement metrics: computed in the database from the ledger. */
export const getProgress = cache(async (): Promise<ProgressSummary> => {
  const { supabase } = await getContext();
  const { data, error } = await supabase.rpc("progress_summary");
  if (error) throw error;
  return data as ProgressSummary;
});
