import { PageHeader } from "@/components/ui";
import { getContext } from "@/lib/data/context";
import { AiForm, DataCard, PlanningForm, ProfileForm, TargetsForm, TimerForm, XpForm } from "./forms";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase, profile, settings } = await getContext();
  const [defs, sample] = await Promise.all([
    supabase.from("user_achievements").select("key,achievement_defs(title)").then((r) => ((r.data ?? []) as unknown as { achievement_defs: { title: string | null } | null }[]).map((x) => x.achievement_defs?.title).filter((t): t is string => !!t)),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("is_sample", true),
  ]);
  return (
    <>
      <PageHeader title="Settings" subtitle="Everything here can be changed at any time." />
      <ProfileForm profile={profile} titles={defs} />
      <PlanningForm s={settings} />
      <XpForm s={settings} />
      <TargetsForm s={settings} />
      <TimerForm s={settings} />
      <AiForm consent={settings.ai_consent} />
      <DataCard hasSample={(sample.count ?? 0) > 0} />
    </>
  );
}
