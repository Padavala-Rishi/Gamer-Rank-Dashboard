import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/shell";
import { buildCharacter } from "@/lib/game/xp";
import { getContext, getProgress } from "@/lib/server/context";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { supabase, profile, settings, today, curves } = await getContext();
  if (!profile.onboarded_at) redirect("/onboarding");
  const [progress, subjects, projects] = await Promise.all([
    getProgress(),
    supabase.from("subjects").select("id,name").eq("archived", false).order("name"),
    supabase.from("projects").select("id,name").neq("stage", "completed").order("name"),
  ]);
  const character = buildCharacter(progress.xp_by_category, curves.overall, curves.category);
  return (
    <Providers today={today} xp={settings.xp_values} subjects={subjects.data ?? []} projects={projects.data ?? []}>
      <AppShell profile={profile} character={character} theme={settings.theme}>{children}</AppShell>
    </Providers>
  );
}
