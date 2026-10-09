import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TABLES = [
  "profiles", "user_settings", "tasks", "task_completions", "xp_transactions", "activity_events", "user_achievements", "day_plans", "rewards",
  "subjects", "syllabus_nodes", "exams", "focus_sessions",
  "drills", "practice_plans", "practice_sessions", "practice_drills", "bball_metrics", "performance_logs",
  "roadmap_items", "projects", "freelance_leads", "outreach_log", "income_records",
  "workout_routines", "workouts", "workout_sets", "body_metrics", "health_days", "nutrition_entries", "coach_runs",
] as const;

/** Everything the signed-in user owns, as one JSON download. Row-level security scopes every table to them. */
export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const out: Record<string, unknown> = {};
  const failures: string[] = [];
  await Promise.all(TABLES.map(async (t) => {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await supabase.from(t).select("*").range(from, from + 999);
      if (error) { failures.push(`${t}: ${error.message}`); break; }
      rows.push(...(page ?? []));
      if (!page || page.length < 1000) break;
    }
    out[t] = rows;
  }));
  if (failures.length) return NextResponse.json({ error: "Export failed", failures }, { status: 500 });

  const body = JSON.stringify({ app: "level-up", exported_at: new Date().toISOString(), format: 1, tables: out }, null, 2);
  return new NextResponse(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="level-up-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
