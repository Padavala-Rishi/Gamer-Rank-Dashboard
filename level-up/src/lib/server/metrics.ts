import type { Supa } from "../supabase/server";

const DEFAULTS = [
  { name: "Free throws", kind: "shooting" },
  { name: "Three-pointers", kind: "shooting" },
  { name: "Midrange", kind: "shooting" },
] as const;

/** Make sure the three standard shooting metrics exist. Custom metrics can be added alongside them. */
export async function ensureDefaultMetrics(supabase: Supa): Promise<void> {
  const { data } = await supabase.from("bball_metrics").select("name");
  const have = new Set((data ?? []).map((m) => m.name));
  const missing = DEFAULTS.filter((d) => !have.has(d.name));
  if (!missing.length || (data ?? []).length > 0) return; // only seed an empty list; never re-add ones the user deleted
  await supabase.from("bball_metrics").insert(missing.map((m) => ({ name: m.name, kind: m.kind })));
}
