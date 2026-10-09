"use client";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { DbProblem, Splash, useLive } from "@/components/live-page";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/shell";
import { loadShell } from "@/lib/data/shell";
import { applyTheme } from "@/lib/theme";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { data, error } = useLive(loadShell, "shell");
  const router = useRouter();
  const onboarded = data ? Boolean(data.profile.onboarded_at) : null;

  useEffect(() => { if (onboarded === false) router.replace("/onboarding"); }, [onboarded, router]);
  useEffect(() => { if (data) applyTheme(data.settings.theme); }, [data]);

  if (error && !data) return <DbProblem error={error} />;
  if (!data || !onboarded) return <Splash />;
  return (
    <Providers today={data.today} xp={data.settings.xp_values} subjects={data.subjects} projects={data.projects}>
      <AppShell profile={data.profile} character={data.character} theme={data.settings.theme}>{children}</AppShell>
    </Providers>
  );
}
