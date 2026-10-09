"use client";
import { useState, useTransition } from "react";
import { bumpFeature, setLeadStatus, setProjectStage, setRoadmapStatus } from "@/app/actions/dev";
import { Icon } from "@/components/icon";
import { useUI } from "@/components/ui-context";
import { LEAD_STATUSES, LEAD_STATUS_LABEL, PROJECT_STAGES, PROJECT_STAGE_LABEL } from "@/lib/constants";

const NEXT = { todo: "doing", doing: "done", done: "todo" } as const;
const LABEL = { todo: "To do", doing: "In progress", done: "Done" } as const;

export function RoadmapStatus({ id, status, title }: { id: string; status: "todo" | "doing" | "done"; title: string }) {
  const { toast } = useUI();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} aria-label={`${title}: ${LABEL[status]}. Click to change`} title={`${LABEL[status]} · click to change`}
      onClick={() => start(async () => { const r = await setRoadmapStatus(id, NEXT[status]); if (!r.ok) toast(r.error, "bad"); })}
      className={`grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors ${status === "done" ? "border-accent bg-accent text-accent-ink" : status === "doing" ? "border-accent" : "border-faint hover:border-accent"}`}>
      {status === "done" ? <Icon name="check" size={13} strokeWidth={3} /> : status === "doing" ? <span className="size-2 rounded-full bg-accent" /> : null}
    </button>
  );
}

export function StageSelect({ id, stage, name }: { id: string; stage: string; name: string }) {
  const { toast } = useUI();
  const [pending, start] = useTransition();
  return (
    <select className="select !min-h-9 !w-auto !py-1 text-sm" aria-label={`Stage of ${name}`} value={stage} disabled={pending}
      onChange={(e) => start(async () => { const r = await setProjectStage(id, e.target.value); if (!r.ok) toast(r.error, "bad"); })}>
      {PROJECT_STAGES.map((s) => <option key={s} value={s}>{PROJECT_STAGE_LABEL[s]}</option>)}
    </select>
  );
}

export function FeatureBump({ id, done, total, name }: { id: string; done: number; total: number; name: string }) {
  const { toast } = useUI();
  const [pending, start] = useTransition();
  const go = (d: 1 | -1) => start(async () => { const r = await bumpFeature(id, d); if (!r.ok) toast(r.error, "bad"); });
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <button className="btn btn-ghost btn-icon btn-sm" disabled={pending || done <= 0} aria-label={`One fewer feature done on ${name}`} onClick={() => go(-1)}>−</button>
      <span className="num font-semibold text-ink">{done}/{total}</span>
      <button className="btn btn-ghost btn-icon btn-sm" disabled={pending || done >= total} aria-label={`One more feature done on ${name}`} onClick={() => go(1)}>+</button>
    </span>
  );
}

export function LeadStatusSelect({ id, status, name }: { id: string; status: string; name: string }) {
  const { toast } = useUI();
  const [pending, start] = useTransition();
  const [lost, setLost] = useState(false);
  const [reason, setReason] = useState("");
  const change = (s: string, why?: string) => start(async () => {
    const r = await setLeadStatus(id, s, why);
    if (!r.ok) toast(r.error, "bad");
    else if (s === "won") toast("A client won. That's real progress.", "good");
  });
  return (
    <>
      <select className="select !min-h-9 !w-auto !py-1 text-sm" aria-label={`Status of ${name}`} value={status} disabled={pending}
        onChange={(e) => { if (e.target.value === "lost") setLost(true); else change(e.target.value); }}>
        {LEAD_STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABEL[s]}</option>)}
      </select>
      {lost && (
        <div className="mt-2 flex w-full gap-2">
          <input className="input !min-h-9" autoFocus placeholder="Why was it lost? (optional, helps next time)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          <button className="btn btn-sm" onClick={() => { setLost(false); change("lost", reason); setReason(""); }}>Mark lost</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setLost(false)}>Cancel</button>
        </div>
      )}
    </>
  );
}
