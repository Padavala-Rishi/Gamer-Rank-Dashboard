"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DbProblem, Splash, useLive } from "@/components/live-page";
import { getContext } from "@/lib/data/context";
import { Wizard } from "./wizard";

export default function Page() {
  const { data, error } = useLive(getContext, "onboarding");
  const router = useRouter();
  const done = data ? Boolean(data.profile.onboarded_at) : null;
  useEffect(() => { document.title = "Create your character · Level Up"; }, []);
  useEffect(() => { if (done) router.replace("/"); }, [done, router]);
  if (error && !data) return <DbProblem error={error} />;
  if (!data || done) return <Splash />;
  return <Wizard initialName={data.profile.character_name === "Player One" ? "" : data.profile.character_name} timezone={data.profile.timezone} />;
}
