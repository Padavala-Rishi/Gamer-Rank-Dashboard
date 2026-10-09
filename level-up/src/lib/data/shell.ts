import { buildCharacter } from "../game/xp";
import { getContext, getProgress } from "./context";

/** What the app frame (sidebar, header, quick-add) needs on every screen. */
export async function loadShell() {
  const { supabase, profile, settings, today, curves } = await getContext();
  const [progress, subjects, projects] = await Promise.all([
    getProgress(),
    supabase.from("subjects").select("id,name").eq("archived", false).order("name"),
    supabase.from("projects").select("id,name").neq("stage", "completed").order("name"),
  ]);
  const character = buildCharacter(progress.xp_by_category, curves.overall, curves.category);
  return { profile, settings, today, character, subjects: subjects.data ?? [], projects: projects.data ?? [] };
}
