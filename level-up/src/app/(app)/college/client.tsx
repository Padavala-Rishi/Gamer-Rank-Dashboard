"use client";
import { useTransition } from "react";
import { deleteFocusSession, reviseNode, setNodeStatus } from "@/app/actions/college";
import { Icon } from "@/components/icon";
import { useUI } from "@/components/ui-context";

const NEXT = { todo: "learning", learning: "done", done: "todo" } as const;
const LABEL = { todo: "Not started", learning: "Learning", done: "Done" } as const;

export function NodeStatus({ id, status, title }: { id: string; status: "todo" | "learning" | "done"; title: string }) {
  const { toast } = useUI();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => { const r = await setNodeStatus(id, NEXT[status]); if (!r.ok) toast(r.error, "bad"); })}
      aria-label={`${title}: ${LABEL[status]}. Click to change`} title={`${LABEL[status]} · click to change`}
      className={`grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors ${status === "done" ? "border-accent bg-accent text-accent-ink" : status === "learning" ? "border-accent" : "border-faint hover:border-accent"}`}>
      {status === "done" ? <Icon name="check" size={13} strokeWidth={3} /> : status === "learning" ? <span className="size-2 rounded-full bg-accent" /> : null}
    </button>
  );
}

export function ReviseButton({ id, title, due }: { id: string; title: string; due?: boolean }) {
  const { toast } = useUI();
  const [pending, start] = useTransition();
  return (
    <button type="button" className={`btn btn-sm ${due ? "btn-primary" : ""}`} disabled={pending} aria-label={`Mark “${title}” as revised`}
      onClick={() => start(async () => { const r = await reviseNode(id); if (!r.ok) toast(r.error, "bad"); else toast(`Revised. Next review ${r.data.next}.`, "good"); })}>
      <Icon name="repeat" size={13} />Revised
    </button>
  );
}

export function DeleteSession({ id }: { id: string }) {
  const { toast } = useUI();
  const [pending, start] = useTransition();
  return <button className="btn btn-ghost btn-icon btn-sm" aria-label="Delete focus session" disabled={pending} onClick={() => { if (confirm("Delete this focus session?")) start(async () => { const r = await deleteFocusSession(id); if (!r.ok) toast(r.error, "bad"); }); }}><Icon name="trash-2" size={14} /></button>;
}
