"use client";
import { useState, useTransition } from "react";
import { addWater, deleteWorkout, logWorkout, saveHealthDay } from "@/app/actions/health";
import { Icon } from "@/components/icon";
import { Sheet } from "@/components/sheet";
import { Field, Notice } from "@/components/ui";
import { useUI } from "@/components/ui-context";
import type { WorkoutRoutine } from "@/lib/types";

export function WaterControls({ day, ml }: { day: string; ml: number }) {
  const { toast } = useUI();
  const [pending, start] = useTransition();
  const add = (n: number) => start(async () => { const r = await addWater(day, n); if (!r.ok) toast(r.error, "bad"); });
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Log water">
      {[250, 500, 750].map((n) => <button key={n} className="btn btn-sm" disabled={pending} onClick={() => add(n)} aria-label={`Add ${n} millilitres of water`}>+{n} ml</button>)}
      <button className="btn btn-ghost btn-sm" disabled={pending || ml <= 0} onClick={() => add(-250)} aria-label="Remove 250 millilitres (undo)">−250</button>
    </div>
  );
}

export function MobilityControls({ day, minutes }: { day: string; minutes: number }) {
  const { toast } = useUI();
  const [pending, start] = useTransition();
  const set = (m: number) => start(async () => { const r = await saveHealthDay({ day, mobility_min: Math.max(0, m) }); if (!r.ok) toast(r.error, "bad"); });
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Log mobility minutes">
      {[5, 10, 15].map((n) => <button key={n} className="btn btn-sm" disabled={pending} onClick={() => set(minutes + n)} aria-label={`Add ${n} minutes of mobility`}>+{n} min</button>)}
      <button className="btn btn-ghost btn-sm" disabled={pending || minutes <= 0} onClick={() => set(minutes - 5)} aria-label="Remove 5 minutes (undo)">−5</button>
    </div>
  );
}

export function SleepForm({ day, hours, quality, min, max }: { day: string; hours: number | null; quality: number | null; min: number; max: number }) {
  const { toast } = useUI();
  const [h, setH] = useState(hours != null ? String(hours) : "");
  const [q, setQ] = useState(quality ?? 0);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const n = h === "" ? null : Number(h);
  const note = n == null ? null : n < min ? `Below your healthy range (${min}–${max} h). Sleeping less is never rewarded.` : n > max ? `Above your usual range (${min}–${max} h).` : "In your healthy range.";
  return (
    <form className="space-y-3" noValidate onSubmit={(e) => { e.preventDefault(); setErr(null); start(async () => { const r = await saveHealthDay({ day, sleep_hours: h, sleep_quality: q || null }); if (!r.ok) setErr(r.error); else toast("Sleep saved", "good"); }); }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Hours slept" htmlFor="sl-h"><input id="sl-h" className="input" type="number" min={0} max={24} step={0.25} inputMode="decimal" value={h} onChange={(e) => setH(e.target.value)} placeholder="e.g. 7.5" /></Field>
        <Field label="Quality" htmlFor="sl-q"><div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Sleep quality">{[1, 2, 3, 4, 5].map((v) => <button key={v} type="button" role="radio" aria-checked={q === v} className="chip !px-2.5" data-active={q === v} onClick={() => setQ(q === v ? 0 : v)}>{v}</button>)}</div></Field>
      </div>
      {note && <p className={`text-xs ${n != null && n >= min && n <= max ? "text-good" : "text-warn"}`}>{note}</p>}
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn btn-sm" disabled={pending || h === ""}>{pending ? "Saving…" : "Save sleep"}</button>
    </form>
  );
}

export function RestToggle({ day, on }: { day: string; on: boolean }) {
  const { toast } = useUI();
  const [pending, start] = useTransition();
  return (
    <button className="chip" aria-pressed={on} disabled={pending} onClick={() => start(async () => { const r = await saveHealthDay({ day, is_rest_day: !on }); if (!r.ok) toast(r.error, "bad"); else toast(on ? "Rest day cleared" : "Rest day set. Recovery counts, and your streak is safe.", "info"); })}>
      <Icon name="moon-star" size={14} /> Rest day
    </button>
  );
}

type SetRow = { reps: string; weight: string };
type Ex = { name: string; sets: SetRow[] };

export function WorkoutLoggerButton({ today, routines, suggested }: { today: string; routines: WorkoutRoutine[]; suggested?: WorkoutRoutine }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)} aria-haspopup="dialog"><Icon name="dumbbell" size={14} />{suggested ? `Log ${suggested.name}` : "Log a workout"}</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Log a workout" wide>
        {open && <WorkoutForm today={today} routines={routines} initial={suggested} onDone={() => setOpen(false)} />}
      </Sheet>
    </>
  );
}

function WorkoutForm({ today, routines, initial, onDone }: { today: string; routines: WorkoutRoutine[]; initial?: WorkoutRoutine; onDone: () => void }) {
  const { toast } = useUI();
  const build = (r?: WorkoutRoutine): Ex[] => r ? r.exercises.map((e) => ({ name: e.name, sets: Array.from({ length: e.sets ?? 3 }, () => ({ reps: e.reps ? String(e.reps) : "", weight: e.weight_kg ? String(e.weight_kg) : "" })) })) : [{ name: "", sets: [{ reps: "", weight: "" }] }];
  const [routineId, setRoutineId] = useState(initial?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "Workout");
  const [date, setDate] = useState(today);
  const [duration, setDuration] = useState("");
  const [intensity, setIntensity] = useState(7);
  const [notes, setNotes] = useState("");
  const [ex, setEx] = useState<Ex[]>(build(initial));
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const setSet = (i: number, j: number, patch: Partial<SetRow>) => setEx((l) => l.map((e, a) => (a === i ? { ...e, sets: e.sets.map((s, b) => (b === j ? { ...s, ...patch } : s)) } : e)));
  const choose = (id: string) => { setRoutineId(id); const r = routines.find((x) => x.id === id); if (r) { setName(r.name); setEx(build(r)); } };

  return (
    <form className="space-y-4" noValidate onSubmit={(e) => {
      e.preventDefault(); setErr(null);
      start(async () => {
        const sets = ex.flatMap((x) => x.name.trim() ? x.sets.filter((s) => s.reps !== "").map((s, k) => ({ exercise: x.name, set_no: k + 1, reps: s.reps, weight_kg: s.weight === "" ? 0 : s.weight })) : []);
        const res = await logWorkout({ workout_date: date, name, routine_id: routineId || null, duration_min: duration, intensity, notes, sets });
        if (!res.ok) { setErr(res.error); return; }
        toast(res.data.prs.length ? `Workout logged. New personal record: ${res.data.prs.join(", ")}` : "Workout logged", "good");
        onDone();
      });
    }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="wl-date"><input id="wl-date" type="date" className="input" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Routine" htmlFor="wl-routine"><select id="wl-routine" className="select" value={routineId} onChange={(e) => choose(e.target.value)}><option value="">Blank workout</option>{routines.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
        <Field label="Name" htmlFor="wl-name"><input id="wl-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></Field>
        <Field label="Minutes" htmlFor="wl-dur"><input id="wl-dur" type="number" min={1} max={360} className="input" value={duration} onChange={(e) => setDuration(e.target.value)} inputMode="numeric" /></Field>
        <Field label={`Perceived intensity: ${intensity}/10`} htmlFor="wl-int" className="col-span-2" hint="Going all-out every session isn't the goal; most training sits at 6–8."><input id="wl-int" type="range" min={1} max={10} className="w-full accent-[var(--accent)]" value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} /></Field>
      </div>
      <div className="space-y-2.5">
        {ex.map((x, i) => (
          <div key={i} className="card-inset space-y-2 p-2.5">
            <div className="flex gap-2"><input className="input" aria-label={`Exercise ${i + 1}`} placeholder="Exercise" value={x.name} onChange={(e) => setEx((l) => l.map((y, a) => (a === i ? { ...y, name: e.target.value } : y)))} maxLength={80} /><button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Remove exercise ${i + 1}`} onClick={() => setEx((l) => l.filter((_, a) => a !== i))}><Icon name="x" size={14} /></button></div>
            {x.sets.map((s, j) => (
              <div key={j} className="grid grid-cols-[1.5rem_1fr_1fr_2rem] items-center gap-2">
                <span className="num text-xs text-muted">{j + 1}</span>
                <input className="input !min-h-10" type="number" min={0} inputMode="numeric" aria-label={`Exercise ${i + 1} set ${j + 1} reps`} placeholder="reps" value={s.reps} onChange={(e) => setSet(i, j, { reps: e.target.value })} />
                <input className="input !min-h-10" type="number" min={0} step="any" inputMode="decimal" aria-label={`Exercise ${i + 1} set ${j + 1} weight in kg`} placeholder="kg" value={s.weight} onChange={(e) => setSet(i, j, { weight: e.target.value })} />
                <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Remove set ${j + 1}`} onClick={() => setEx((l) => l.map((y, a) => (a === i ? { ...y, sets: y.sets.filter((_, b) => b !== j) } : y)))}><Icon name="x" size={12} /></button>
              </div>
            ))}
            <button type="button" className="btn btn-sm" onClick={() => setEx((l) => l.map((y, a) => (a === i ? { ...y, sets: [...y.sets, { ...(y.sets.at(-1) ?? { reps: "", weight: "" }) }] } : y)))}><Icon name="plus" size={13} /> Add set</button>
          </div>
        ))}
        <button type="button" className="btn btn-sm" onClick={() => setEx((l) => [...l, { name: "", sets: [{ reps: "", weight: "" }] }])}><Icon name="plus" size={13} /> Add exercise</button>
      </div>
      <Field label="Notes" htmlFor="wl-notes"><textarea id="wl-notes" className="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></Field>
      {err && <Notice tone="bad">{err}</Notice>}
      <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onDone}>Cancel</button><button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save workout"}</button></div>
    </form>
  );
}

export function DeleteWorkout({ id, name }: { id: string; name: string }) {
  const { toast } = useUI();
  const [pending, start] = useTransition();
  return <button className="btn btn-ghost btn-icon btn-sm" aria-label={`Delete workout ${name}`} disabled={pending} onClick={() => { if (confirm("Delete this workout?")) start(async () => { const r = await deleteWorkout(id); if (!r.ok) toast(r.error, "bad"); }); }}><Icon name="trash-2" size={14} /></button>;
}
