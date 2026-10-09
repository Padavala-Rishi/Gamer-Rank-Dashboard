import { redirect } from "next/navigation";
import { getContext } from "@/lib/server/context";
import { Wizard } from "./wizard";

export const metadata = { title: "Create your character" };

export default async function Page() {
  const { profile } = await getContext();
  if (profile.onboarded_at) redirect("/");
  return <Wizard initialName={profile.character_name === "Player One" ? "" : profile.character_name} timezone={profile.timezone} />;
}
