"use client";
import { useState, useTransition } from "react";
import { deletePerformanceLog, deletePracticeSession, logPerformance, savePracticeSession } from "@/app/actions/basketball";
import { Icon } from "@/components/icon";
import { Sheet } from "@/components/sheet";
import { Field, Notice } from "@/components/ui";
import { useUI } from "@/components/ui-context";
import type { BballMetric, Drill, PracticePlan } from "@/lib/types";

type Row = { name: string; planned_reps: string; done_reps: string; minutes: string; completed: boolean };
const blankRow = (): Row => ({ name: "", planned_reps: "", done_reps: "", minutes: "", completed: false });

export function SessionLoggerButton({ today, plans, drills, plan, label, className, status = "done" }: { today: string; plans: PracticePlan[]; drills: Drill[]; plan?: PracticePlan; label?: string; className?: string; status?: "done" | "planned" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className ?? "btn btn-primary btn-sm"} onClick={() => setOpen(true)} aria-haspopup="dialog"><Icon name={plan ? "play" : "plus"} size={14} />{label ?? (plan ? `Log ${plan.name}` : "Log a session")}</button>
      <Sheet open={open} onClose={() => setOpen(false)} title={status === "planned" ? "Plan a session" : "Log a practice session"} wide>
        {open && <SessionForm today={today} plans={plans} drills={drills} initialPlan={plan} status={status} onDone={() => setOpen(false)} />}
      </Sheet>
    </>
  );
}

function SessionForm({ today, plans, drills, initialPlan, status, onDone }: { today: string; plans: PracticePlan[]; drills: Drill[]; initialPlan?: PracticePlan; status: "done" | "planned"; onDone: () => void }) {
  const { toast } = useUI();
  const fromPlan = (p?: PracticePlan): Row[] => p ? p.items.map((i) => ({ name: i.name, planned_reps: i.reps ? String(i.reps) : "", done_reps: "", minutes: i.minutes ? String(i.minutes) : "", completed: status === "done" })) : [blankRow()];
  const [planId, setPlanId] = useState(initialPlan?.id ?? "");
  const [title, setTitle] = useState(initialPlan?.name ?? "Practice");
  const [date, setDate] = useState(today);
  const [duration, setDuration] = useState(initialPlan ? String(initialPlan.items.reduce((a, i) => a + (i.minutes ?? 0), 0) || "") : "");
  const [intensity, setIntensity] = useState(6);
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>(fromPlan(initialPlan));
  const [err, setErr] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const upd = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const choosePlan = (id: string) => {
    setPlanId(id);
    const p = plans.find((x) => x.id === id);
    if (p) { setTitle(p.name); setRows(fromPlan(p)); setDuration(String(p.items.reduce((a, i) => a + (i.minutes ?? 0), 0) || "")); }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setFe({});
    start(async () => {
      const res = await savePracticeSession({
        session_date: date, title, plan_id: planId || null, duration_min: duration, intensity: status === "done" ? intensity : null, notes, status,
        drills: rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name, planned_reps: r.planned_reps, done_reps: r.done_reps, minutes: r.minutes, completed: r.completed })),
      });
      if (!res.ok) { setErr(res.error); setFe(res.fields ?? {}); return; }
      toast(status === "done" ? "Session logged" : "Session planned", "good");
      onDone();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <datalist id="drill-names">{drills.filter((d) => !d.archived).map((d) => <option key={d.id} value={d.name} />)}</datalist>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="ps-date" error={fe.session_date}><input id="ps-date" type="date" className="input" value={date} max={status === "done" ? today : undefined} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Start from a plan" htmlFor="ps-plan">
          <select id="ps-plan" className="select" value={planId} onChange={(e) => choosePlan(e.target.value)}>
            <option value="">Blank session</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Title" htmlFor="ps-title" error={fe.title} className="col-span-2"><input id="ps-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} /></Field>
        <Field label="Total minutes" htmlFor="ps-dur" error={fe.duration_min}><input id="ps-dur" type="number" min={1} max={600} className="input" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 60" /></Field>
        {status === "done" && (
          <Field label={`Perceived intensity: ${intensity}/10`} htmlFor="ps-int" hint="1 = easy, 10 = all-out. Most practice sits at 5–7.">
            <input id="ps-int" type="range" min={1} max={10} className="w-full accent-[var(--accent)]" value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} />
          </Field>
        )}
      </div>
      <div>
        <div className="label">Drills</div>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="card-inset space-y-2 p-2.5">
              <div className="flex gap-2">
                <input className="input" list="drill-names" aria-label={`Drill ${i + 1} name`} placeholder="Drill" value={r.name} onChange={(e) => upd(i, { name: e.target.value })} maxLength={100} />
                <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Remove drill ${i + 1}`} onClick={() => setRows((l) => l.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button>
              </div>
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
                <input className="input !min-h-10" type="number" min={1} aria-label={`Drill ${i + 1} planned reps`} placeholder="Target reps" value={r.planned_reps} onChange={(e) => upd(i, { planned_reps: e.target.value })} />
                {status === "done" ? <input className="input !min-h-10" type="number" min={0} aria-label={`Drill ${i + 1} reps done`} placeholder="Reps done" value={r.done_reps} onChange={(e) => upd(i, { done_reps: e.target.value })} /> : <span />}
                <input className="input !min-h-10" type="number" min={1} aria-label={`Drill ${i + 1} minutes`} placeholder="Min" value={r.minutes} onChange={(e) => upd(i, { minutes: e.target.value })} />
                {status === "done" && <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={r.completed} onChange={(e) => upd(i, { completed: e.target.checked })} />Done</label>}
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-sm" onClick={() => setRows((l) => [...l, blankRow()])}><Icon name="plus" size={13} /> Add drill</button>
        </div>
      </div>
      <Field label="Notes" htmlFor="ps-notes"><textarea id="ps-notes" className="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="What clicked? What needs work?" /></Field>
      {err && <Notice tone="bad">{err}</Notice>}
      <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onDone}>Cancel</button><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : status === "done" ? "Save session" : "Save plan"}</button></div>
    </form>
  );
}

export function ShotLoggerButton({ today, metrics, metricId, label }: { today: string; metrics: BballMetric[]; metricId?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-sm" onClick={() => setOpen(true)} aria-haspopup="dialog"><Icon name="target" size={14} />{label ?? "Log shots / a result"}</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Log shooting or a result">
        {open && <ShotForm today={today} metrics={metrics} initialId={metricId} onDone={() => setOpen(false)} />}
      </Sheet>
    </>
  );
}

function ShotForm({ today, metrics, initialId, onDone }: { today: string; metrics: BballMetric[]; initialId?: string; onDone: () => void }) {
  const { toast } = useUI();
  const [metricId, setMetricId] = useState(initialId ?? metrics[0]?.id ?? "");
  const metric = metrics.find((m) => m.id === metricId);
  const [date, setDate] = useState(today);
  const [attempts, setAttempts] = useState("");
  const [makes, setMakes] = useState("");
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  if (!metrics.length) return <Notice>Add a metric first (Drills & metrics tab).</Notice>;
  const pct = attempts && makes && Number(attempts) > 0 ? Math.round((Number(makes) / Number(attempts)) * 100) : null;
  return (
    <form className="space-y-3.5" noValidate onSubmit={(e) => {
      e.preventDefault(); setErr(null); setFe({});
      start(async () => {
        const res = await logPerformance(metric?.kind === "shooting" ? { metric_id: metricId, logged_on: date, attempts, makes, notes } : { metric_id: metricId, logged_on: date, value, notes });
        if (!res.ok) { setErr(res.error); setFe(res.fields ?? {}); return; }
        toast("Logged", "good"); onDone();
      });
    }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Metric" htmlFor="sl-metric"><select id="sl-metric" className="select" value={metricId} onChange={(e) => setMetricId(e.target.value)}>{metrics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        <Field label="Date" htmlFor="sl-date"><input id="sl-date" type="date" className="input" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
        {metric?.kind === "shooting" ? (
          <>
            <Field label="Attempts" htmlFor="sl-att" error={fe.attempts}><input id="sl-att" type="number" min={1} className="input" value={attempts} onChange={(e) => setAttempts(e.target.value)} inputMode="numeric" /></Field>
            <Field label="Makes" htmlFor="sl-make" error={fe.makes} hint={pct != null ? `${pct}%` : undefined}><input id="sl-make" type="number" min={0} className="input" value={makes} onChange={(e) => setMakes(e.target.value)} inputMode="numeric" /></Field>
          </>
        ) : (
          <Field label={`Value${metric?.unit ? ` (${metric.unit})` : ""}`} htmlFor="sl-val" error={fe.attempts} className="col-span-2"><input id="sl-val" type="number" step="any" className="input" value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" /></Field>
        )}
        <Field label="Note" htmlFor="sl-note" className="col-span-2"><input id="sl-note" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} /></Field>
      </div>
      {err && <Notice tone="bad">{err}</Notice>}
      <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onDone}>Cancel</button><button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button></div>
    </form>
  );
}

export function DeleteButton({ kind, id, label }: { kind: "session" | "shot"; id: string; label: string }) {
  const { toast } = useUI();
  const [pending, start] = useTransition();
  return (
    <button className="btn btn-ghost btn-icon btn-sm" aria-label={label} disabled={pending} onClick={() => { if (!confirm("Delete this entry?")) return; start(async () => { const r = kind === "session" ? await deletePracticeSession(id) : await deletePerformanceLog(id); if (!r.ok) toast(r.error, "bad"); }); }}>
      <Icon name="trash-2" size={14} />
    </button>
  );
}
