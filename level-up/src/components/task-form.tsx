"use client";
import { useState, useTransition } from "react";
import { createTask, updateTask } from "@/app/actions/tasks";
import { CATEGORIES, DIFFICULTIES, DIFFICULTY_LABEL, PRIORITIES, QUEST_TYPES, QUEST_TYPE_LABEL, WEEKDAY_LABELS, type AnyCategory, type Difficulty, type QuestType } from "@/lib/constants";
import { addDays } from "@/lib/dates";
import { PRESETS, VERIFY_OPTIONS, type Verify } from "@/lib/presets";
import type { Task } from "@/lib/types";
import { Icon } from "./icon";
import { Field, Notice } from "./ui";
import { useUI } from "./ui-context";

export type QuickAddDefaults = Partial<{
  title: string; category: AnyCategory; date: string | null; difficulty: Difficulty; quest_type: QuestType; est_minutes: number | null;
  parent_id: string | null; subject_id: string | null; project_id: string | null; due_date: string | null; verify: Verify; subcategory: string | null;
}>;

type When = "today" | "tomorrow" | "date" | "backlog";
type Repeat = "none" | "daily" | "weekdays" | "weekly" | "monthly";
const EST = [10, 15, 20, 30, 45, 60, 90];

export function TaskForm({ today, initial, defaults, onDone }: { today: string; initial?: Task; defaults?: QuickAddDefaults; onDone: () => void }) {
  const { toast, xp, subjects, projects } = useUI();
  const editing = !!initial;
  const d = defaults ?? {};
  const startDate = initial ? initial.scheduled_date : d.date === undefined ? today : d.date;
  const [title, setTitle] = useState(initial?.title ?? d.title ?? "");
  const [category, setCategory] = useState<AnyCategory>(initial?.category ?? d.category ?? "life");
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? d.difficulty ?? "easy");
  const [questType, setQuestType] = useState<QuestType>(initial?.quest_type ?? d.quest_type ?? "daily");
  const [est, setEst] = useState<string>(String(initial?.est_minutes ?? d.est_minutes ?? ""));
  const [when, setWhen] = useState<When>(startDate === null ? "backlog" : startDate === today ? "today" : startDate === addDays(today, 1) ? "tomorrow" : "date");
  const [date, setDate] = useState<string>(startDate ?? today);
  const [priority, setPriority] = useState(initial?.priority ?? 2);
  const [time, setTime] = useState(initial?.scheduled_time?.slice(0, 5) ?? "");
  const [due, setDue] = useState(initial?.due_date ?? d.due_date ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [desc, setDesc] = useState(initial?.description ?? "");
  const [subjectId, setSubjectId] = useState(initial?.subject_id ?? d.subject_id ?? "");
  const [projectId, setProjectId] = useState(initial?.project_id ?? d.project_id ?? "");
  const [verify, setVerify] = useState<Verify>(initial?.verify ?? d.verify ?? null);
  const [repeat, setRepeat] = useState<Repeat>("none");
  const [wdays, setWdays] = useState<number[]>([]);
  const [more, setMore] = useState(!!(initial && (initial.notes || initial.description || initial.verify || initial.due_date)) || !!d.verify);
  const [error, setError] = useState<string | null>(null);
  const [suggest, setSuggest] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const whenDate = when === "today" ? today : when === "tomorrow" ? addDays(today, 1) : when === "date" ? date : null;

  const applyPreset = (p: (typeof PRESETS)[AnyCategory][number]) => {
    setTitle(p.title); setDifficulty(p.difficulty); setEst(p.est_minutes ? String(p.est_minutes) : "");
    if (p.quest_type) setQuestType(p.quest_type); else if (p.difficulty === "boss") setQuestType("boss");
    setVerify(p.verify ?? null); if (p.verify) setMore(true);
  };

  const build = () => {
    const base = {
      title, category, difficulty, quest_type: questType, priority, est_minutes: est === "" ? null : Number(est),
      scheduled_date: whenDate, scheduled_time: time || null, due_date: due || null, notes: notes || null, description: desc || null,
      subject_id: subjectId || null, project_id: projectId || null, parent_id: initial?.parent_id ?? d.parent_id ?? null,
      subcategory: initial?.subcategory ?? d.subcategory ?? null, verify: verify && verify.kind ? verify : null,
    };
    if (editing || repeat === "none") return base;
    const startOn = whenDate ?? today;
    const recurrence =
      repeat === "daily" ? { freq: "daily", interval: 1, start: startOn }
      : repeat === "weekdays" ? { freq: "weekly", interval: 1, weekdays: [1, 2, 3, 4, 5], start: startOn }
      : repeat === "weekly" ? { freq: "weekly", interval: 1, weekdays: wdays.length ? wdays : undefined, start: startOn }
      : { freq: "monthly", interval: 1, start: startOn };
    return { ...base, scheduled_date: null, recurrence };
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setSuggest(null); setFields({});
    start(async () => {
      const payload = build();
      const res = editing ? await updateTask(initial!.id, payload) : await createTask(payload);
      if (!res.ok) {
        setError(res.error); setFields(res.fields ?? {});
        const s = res.meta?.suggestedDate;
        if (typeof s === "string") setSuggest(s);
        return;
      }
      const w = (res.data as { warning: string | null }).warning;
      toast(editing ? "Quest updated" : repeat !== "none" ? "Repeating quest created" : "Quest added", "good");
      if (w) toast(w, "info");
      onDone();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="What's the quest?" htmlFor="tf-title" error={fields.title}>
        <input id="tf-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 50 free throws" autoFocus maxLength={160} aria-invalid={!!fields.title} />
      </Field>

      <div>
        <div className="label">Area</div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Area">
          {(Object.keys(CATEGORIES) as AnyCategory[]).map((k) => (
            <button type="button" key={k} className="chip" aria-pressed={category === k} onClick={() => setCategory(k)}>
              <Icon name={CATEGORIES[k].icon} size={14} />{CATEGORIES[k].short}
            </button>
          ))}
        </div>
        {!editing && (
          <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1 scroll-hide" aria-label="Quest ideas">
            {PRESETS[category].map((p) => (
              <button type="button" key={p.title} className="chip shrink-0" onClick={() => applyPreset(p)} title="Fill the form with this idea">
                <Icon name="wand-sparkles" size={12} />{p.title}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="label">Difficulty · reward</div>
        <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Difficulty">
          {DIFFICULTIES.map((k) => (
            <button type="button" key={k} className="chip justify-center !flex-col !gap-0 !py-1.5 !h-auto" aria-pressed={difficulty === k} onClick={() => { setDifficulty(k); if (k === "boss") setQuestType("boss"); else if (questType === "boss") setQuestType("daily"); }}>
              <span>{DIFFICULTY_LABEL[k]}</span>
              <span className="num text-[11px] opacity-80">+{xp[k] ?? "?"} XP</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="label">When</div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="When">
          {([["today", "Today"], ["tomorrow", "Tomorrow"], ["date", "Pick a date"], ["backlog", "Backlog"]] as const).map(([k, l]) => (
            <button type="button" key={k} className="chip" aria-pressed={when === k} onClick={() => setWhen(k)}>{l}</button>
          ))}
        </div>
        {when === "date" && <input type="date" className="input mt-2" value={date} min={today} onChange={(e) => setDate(e.target.value)} aria-label="Date" />}
        {fields.scheduled_date && <p className="err">{fields.scheduled_date}</p>}
      </div>

      <div>
        <div className="label">Estimated time <span className="font-normal text-faint">(helps keep the day realistic)</span></div>
        <div className="flex flex-wrap items-center gap-1.5">
          {EST.map((m) => (
            <button type="button" key={m} className="chip" aria-pressed={est === String(m)} onClick={() => setEst(est === String(m) ? "" : String(m))}>{m}m</button>
          ))}
          <input className="input !w-24" inputMode="numeric" type="number" min={1} max={1440} placeholder="min" value={est} onChange={(e) => setEst(e.target.value)} aria-label="Estimated minutes" />
        </div>
        {fields.est_minutes && <p className="err">{fields.est_minutes}</p>}
      </div>

      {!editing && (
        <div>
          <div className="label">Repeat</div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Repeat">
            {([["none", "Never"], ["daily", "Every day"], ["weekdays", "Weekdays"], ["weekly", "Weekly"], ["monthly", "Monthly"]] as const).map(([k, l]) => (
              <button type="button" key={k} className="chip" aria-pressed={repeat === k} onClick={() => setRepeat(k)}>{l}</button>
            ))}
          </div>
          {repeat === "weekly" && (
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Days of the week">
              {WEEKDAY_LABELS.map((l, i) => (
                <button type="button" key={l} className="chip" aria-pressed={wdays.includes(i + 1)} onClick={() => setWdays((w) => (w.includes(i + 1) ? w.filter((x) => x !== i + 1) : [...w, i + 1]))}>{l}</button>
              ))}
            </div>
          )}
          {repeat !== "none" && <p className="hint">Dated copies appear for the next two weeks. Each day counts on its own, and a missed day is simply skipped.</p>}
        </div>
      )}

      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMore((m) => !m)} aria-expanded={more}>
        <Icon name={more ? "chevron-down" : "chevron-right"} size={14} /> More options
      </button>
      {more && (
        <div className="space-y-3 rounded-xl border border-line p-3.5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" htmlFor="tf-type">
              <select id="tf-type" className="select" value={questType} onChange={(e) => setQuestType(e.target.value as QuestType)}>
                {QUEST_TYPES.map((q) => <option key={q} value={q}>{QUEST_TYPE_LABEL[q]}</option>)}
              </select>
            </Field>
            <Field label="Priority" htmlFor="tf-pri">
              <select id="tf-pri" className="select" value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </Field>
            <Field label="Time of day" htmlFor="tf-time"><input id="tf-time" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
            <Field label="Deadline" htmlFor="tf-due"><input id="tf-due" type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          </div>
          {(category === "college" || category === "dev") && (
            <div className="grid grid-cols-2 gap-3">
              {category === "college" && (
                <Field label="Subject" htmlFor="tf-subject">
                  <select id="tf-subject" className="select" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                    <option value="">None</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
              )}
              {category === "dev" && (
                <Field label="Project" htmlFor="tf-project">
                  <select id="tf-project" className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                    <option value="">None</option>{projects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
              )}
            </div>
          )}
          <Field label="Completion check" htmlFor="tf-verify" hint="Optional. The app confirms you logged it before awarding XP. It can check that something was recorded, not that it really happened.">
            <select id="tf-verify" className="select" value={verify?.kind ?? ""} onChange={(e) => setVerify(e.target.value ? { kind: e.target.value, ...(e.target.value === "focus" ? { minutes: 30, category: category === "life" ? "college" : category } : e.target.value === "shooting" ? { attempts: 50 } : {}) } : null)}>
              {VERIFY_OPTIONS.map((o) => <option key={o.kind} value={o.kind}>{o.label}</option>)}
            </select>
          </Field>
          {verify?.kind === "focus" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Minutes" htmlFor="tf-vmin"><input id="tf-vmin" type="number" className="input" min={1} max={600} value={verify.minutes ?? 30} onChange={(e) => setVerify({ ...verify, minutes: Number(e.target.value) })} /></Field>
              <Field label="Area" htmlFor="tf-vcat">
                <select id="tf-vcat" className="select" value={verify.category ?? "college"} onChange={(e) => setVerify({ ...verify, category: e.target.value })}>
                  <option value="college">College</option><option value="dev">Development</option><option value="basketball">Basketball</option>
                </select>
              </Field>
            </div>
          )}
          {verify?.kind === "shooting" && (
            <Field label="Shot attempts" htmlFor="tf-vatt"><input id="tf-vatt" type="number" className="input" min={1} max={5000} value={verify.attempts ?? 50} onChange={(e) => setVerify({ ...verify, attempts: Number(e.target.value) })} /></Field>
          )}
          <Field label="Description" htmlFor="tf-desc"><textarea id="tf-desc" className="textarea" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={2000} /></Field>
          <Field label="Notes" htmlFor="tf-notes"><textarea id="tf-notes" className="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} /></Field>
        </div>
      )}

      {error && (
        <Notice tone="warn">
          <div>{error}</div>
          {suggest && (
            <button type="button" className="btn btn-sm mt-2" onClick={() => { setWhen("date"); setDate(suggest); setError(null); setSuggest(null); }}>
              Use {suggest} instead
            </button>
          )}
        </Notice>
      )}

      <div className="sticky bottom-0 -mx-5 -mb-4 flex justify-end gap-2 border-t border-line bg-surface px-5 py-3">
        <button type="button" className="btn btn-ghost" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={pending || !title.trim()}>{pending ? "Saving…" : editing ? "Save changes" : repeat !== "none" ? "Create repeating quest" : "Add quest"}</button>
      </div>
    </form>
  );
}
