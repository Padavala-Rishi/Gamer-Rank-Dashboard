"use client";
import { useTransition } from "react";
import { setTitle } from "@/app/actions/profile";
import { claimReward } from "@/app/actions/rewards";
import { Icon } from "@/components/icon";
import { useUI } from "@/components/ui-context";

export function EquipTitle({ title, active }: { title: string | null; active: boolean }) {
  const { toast } = useUI();
  const [pending, start] = useTransition();
  return (
    <button className={`btn btn-sm ${active ? "btn-primary" : ""}`} disabled={pending || active} aria-pressed={active}
      onClick={() => start(async () => { const r = await setTitle(title); if (!r.ok) toast(r.error, "bad"); else toast(title ? `Title set: ${title}` : "Title cleared", "good"); })}>
      {active ? "Equipped" : "Equip"}
    </button>
  );
}

export function ClaimButton({ id, title }: { id: string; title: string }) {
  const { toast } = useUI();
  const [pending, start] = useTransition();
  return (
    <button className="btn btn-primary btn-sm" disabled={pending} aria-label={`Claim reward: ${title}`}
      onClick={() => start(async () => { const r = await claimReward(id); if (!r.ok) toast(r.error, "bad"); else toast(`Claimed: ${title}. You earned it.`, "good"); })}>
      <Icon name="gift" size={14} />Claim
    </button>
  );
}
