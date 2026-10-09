"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { run, check, type ActionResult } from "@/lib/server/action";
import { getContext } from "@/lib/server/context";
import { z } from "zod";
import { profileSchema, settingsPatchSchema, text, ymd } from "@/lib/schemas";
import { ensureDefaultMetrics } from "@/lib/server/metrics";
import { isValidTimeZone } from "@/lib/dates";
import { XP_PREFERENCES } from "@/lib/constants";

const refresh = () => revalidatePath("/", "layout");

export async function setTheme(theme: "dark" | "light"): Promise<ActionResult> {
  return run(async () => {
    const t = theme === "light" ? "light" : "dark";
    (await cookies()).set("theme", t, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    const { supabase, user } = await getContext();
    check(await supabase.from("user_settings").update({ theme: t }).eq("user_id", user.id).select("user_id"));
  });
}

export async function saveProfile(input: unknown): Promise<ActionResult> {
  return run(async () => {
    const { supabase, user } = await getContext();
    const v = profileSchema.parse(input);
    if (!isValidTimeZone(v.timezone)) throw Object.assign(new Error("Unknown time zone"), { code: "22023" });
    check(await supabase.from("profiles").update(v).eq("id", user.id).select("id"));
    refresh();
  });
}

export async function setTitle(title: string | null): Promise<ActionResult> {
  return run(async () => {
    const { supabase, user } = await getContext();
    // the database refuses titles that haven't been earned
    check(await supabase.from("profiles").update({ active_title: title || null }).eq("id", user.id).select("id"));
    refresh();
  });
}

/** Partial settings update. Everything is validated server-side; the database re-checks ranges. */
export async function saveSettings(input: unknown): Promise<ActionResult> {
  return run(async () => {
    const { supabase, user } = await getContext();
    const patch = settingsPatchSchema.parse(input);
    const row: Record<string, unknown> = { ...patch };
    if (patch.xp_preference && !patch.level_base) {
      const p = XP_PREFERENCES[patch.xp_preference];
      row.level_base = p.base;
      row.category_level_base = p.category_base;
    }
    if (patch.theme) (await cookies()).set("theme", patch.theme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    check(await supabase.from("user_settings").update(row).eq("user_id", user.id).select("user_id"));
    refresh();
  });
}

const onboardingExtras = z.object({
  targets: z.object({ practice_weekly: z.number().int().min(0).max(14).optional(), workouts_weekly: z.number().int().min(0).max(14).optional(), income_monthly: z.number().min(0).max(1e9).optional() }).default({}),
  workoutDays: z.array(z.number().int().min(1).max(7)).max(7).default([]),
  exams: z.array(z.object({ subject: text(80, "Subject"), title: text(120, "Exam"), date: ymd })).max(20).default([]),
  loadSample: z.boolean().default(false),
});

export async function finishOnboarding(input: { profile: unknown; settings: unknown; extras: unknown }): Promise<ActionResult> {
  return run(async () => {
    const { supabase, user, settings: current } = await getContext();
    const p = profileSchema.parse(input.profile);
    if (!isValidTimeZone(p.timezone)) throw Object.assign(new Error("Unknown time zone"), { code: "22023" });
    const s = settingsPatchSchema.parse(input.settings);
    const x = onboardingExtras.parse(input.extras);
    const row: Record<string, unknown> = { ...s };
    if (s.xp_preference) { row.level_base = XP_PREFERENCES[s.xp_preference].base; row.category_level_base = XP_PREFERENCES[s.xp_preference].category_base; }
    row.targets = { ...current.targets, ...x.targets };
    check(await supabase.from("user_settings").update(row).eq("user_id", user.id).select("user_id"));
    check(await supabase.from("profiles").update({ ...p, onboarded_at: new Date().toISOString() }).eq("id", user.id).select("id"));
    await ensureDefaultMetrics(supabase);

    if (x.workoutDays.length) {
      check(await supabase.from("workout_routines").insert({ name: "Training", weekdays: x.workoutDays, exercises: [] }).select("id"));
    }
    if (x.exams.length) {
      const names = [...new Set(x.exams.map((e) => e.subject))];
      const subs = check(await supabase.from("subjects").insert(names.map((name) => ({ name }))).select("id,name")) as { id: string; name: string }[];
      const byName = new Map(subs.map((sub) => [sub.name, sub.id]));
      check(await supabase.from("exams").insert(x.exams.map((e) => ({ subject_id: byName.get(e.subject), title: e.title, exam_date: e.date }))).select("id"));
    }
    if (x.loadSample) {
      try {
        const { loadSampleData } = await import("@/lib/server/sample");
        await loadSampleData();
      } catch (e) {
        console.error("[onboarding] sample data failed; continuing without it", e); // never block the account on examples
      }
    }
    refresh();
  });
}
