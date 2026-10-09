"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { finishOnboarding } from "@/app/actions/profile";
import { Avatar, AVATAR_TONE_COLORS } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { Field, Notice } from "@/components/ui";
import { AVATAR_ICONS, AVATAR_TONES, CATEGORIES, CATEGORY_KEYS, CURRENCIES, WEEKDAY_LABELS, XP_PREFERENCES, type CategoryKey, type XpPreference } from "@/lib/constants";
import { WEEKDAY_KEYS } from "@/lib/dates";

const LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;
const GOAL_HINT: Record<CategoryKey, string> = {
  basketball: "e.g. Become a reliable point guard: 80% free throws, strong weak hand",
  college: "e.g. Finish the semester with an 8.5+ CGPA",
  dev: "e.g. Become job-ready full-stack and land my first paying client",
  health: "e.g. Add 5 kg of lean muscle and stay injury-free",
};
const STEPS = ["Character", "Goals", "Your week", "Training & college", "Career & finish"] as const;

type Exam = { subject: string; title: string; date: string };
type Block = { title: string; days: number[]; start: string; end: string };

export function Wizard({ initialName, timezone }: { initialName: string; timezone: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initialName);
  const [icon, setIcon] = useState<string>("swords");
  const [tone, setTone] = useState<string>("gold");
  const [tz, setTz] = useState(timezone);
  useEffect(() => { if (timezone === "UTC") setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"); }, [timezone]);

  const [goals, setGoals] = useState<Record<CategoryKey, { goal: string; level: string }>>({
    basketball: { goal: "", level: "Beginner" }, college: { goal: "", level: "Intermediate" }, dev: { goal: "", level: "Beginner" }, health: { goal: "", level: "Beginner" },
  });
  const [hours, setHours] = useState<Record<string, number>>({ mon: 3, tue: 3, wed: 3, thu: 3, fri: 3, sat: 5, sun: 4 });
  const [limit, setLimit] = useState(8);
  const [pref, setPref] = useState<XpPreference>("standard");
  const [practiceDays, setPracticeDays] = useState<number[]>([1, 3, 5]);
  const [workoutDays, setWorkoutDays] = useState<number[]>([1, 2, 4, 5]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [devGoal, setDevGoal] = useState("");
  const [income, setIncome] = useState("30000");
  const [currency, setCurrency] = useState("INR");
  const [sample, setSample] = useState(true);

  const toggleDay = (list: number[], set: (v: number[]) => void, d: number) => set(list.includes(d) ? list.filter((x) => x !== d) : [...list, d].sort());

  const submit = (skipAll = false) => {
    setError(null);
    start(async () => {
      const g = (k: CategoryKey) => ({ goal: goals[k].goal.trim() || null, level: goals[k].level.toLowerCase() });
      const res = await finishOnboarding({
        profile: { character_name: name.trim() || "Player One", avatar: { icon, tone }, timezone: tz },
        settings: skipAll ? { xp_preference: "standard" } : {
          xp_preference: pref, daily_task_limit: limit, currency,
          availability: Object.fromEntries(WEEKDAY_KEYS.map((k) => [k, Math.round((hours[k] ?? 0) * 60)])),
          commitments: blocks.filter((b) => b.title.trim() && b.days.length),
          goals: { basketball: { ...g("basketball"), days: practiceDays }, college: g("college"), dev: { ...g("dev"), goal: devGoal.trim() || goals.dev.goal.trim() || null }, health: { ...g("health"), days: workoutDays } },
        },
        extras: skipAll ? { loadSample: true } : {
          targets: { practice_weekly: practiceDays.length, workouts_weekly: workoutDays.length, income_monthly: Number(income) || 0 },
          workoutDays, exams: exams.filter((e) => e.subject.trim() && e.title.trim() && e.date), loadSample: sample,
        },
      });
      if (!res.ok) { setError(res.error); return; }
      router.replace("/");
    });
  };

  const next = () => { setError(null); if (step === 0 && !name.trim()) { setError("Give your character a name (you can change it later)."); return; } setStep((s) => s + 1); };
  const last = step === STEPS.length - 1;

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-16 pt-6">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-xl bg-accent text-accent-ink"><Icon name="swords" size={18} /></div>
          <span className="display text-lg font-semibold">Level Up</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => submit(true)} disabled={pending}>Skip setup</button>
      </div>

      <ol className="mb-1 flex gap-1.5" aria-label="Progress">
        {STEPS.map((s, i) => <li key={s} className="h-1 flex-1 rounded-full" style={{ background: i <= step ? "var(--accent)" : "var(--line)" }} aria-current={i === step ? "step" : undefined} />)}
      </ol>
      <p className="mb-5 text-xs text-muted">Step {step + 1} of {STEPS.length}: {STEPS[step]}. Everything here can be changed later.</p>

      <div className="card space-y-5 p-5">
        {step === 0 && (
          <>
            <div>
              <h1 className="text-2xl font-semibold">Create your character</h1>
              <p className="mt-1 text-sm text-muted">Level Up turns real work in basketball, college, development and fitness into XP. Nothing is awarded for opening the app, only for what you actually do.</p>
            </div>
            <Field label="Character name" htmlFor="ob-name"><input id="ob-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Rishi" autoFocus /></Field>
            <div>
              <div className="label">Avatar</div>
              <div className="flex items-center gap-4">
                <Avatar avatar={{ icon, tone }} size={64} />
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Avatar icon">
                    {AVATAR_ICONS.map((i) => <button key={i} type="button" className="chip !px-2" aria-pressed={icon === i} aria-label={i} onClick={() => setIcon(i)}><Icon name={i} size={16} /></button>)}
                  </div>
                  <div className="flex gap-2" role="group" aria-label="Avatar colour">
                    {AVATAR_TONES.map((t) => <button key={t} type="button" aria-label={t} aria-pressed={tone === t} onClick={() => setTone(t)} className="size-7 rounded-full border-2" style={{ background: AVATAR_TONE_COLORS[t], borderColor: tone === t ? "var(--text)" : "transparent" }} />)}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div><h1 className="text-2xl font-semibold">What are you aiming for?</h1><p className="mt-1 text-sm text-muted">One line per area. Skip any you like.</p></div>
            {CATEGORY_KEYS.map((k) => (
              <div key={k} className="card-inset space-y-2.5 p-3.5">
                <div className="flex items-center gap-2 text-sm font-semibold"><Icon name={CATEGORIES[k].icon} size={16} />{CATEGORIES[k].name} <span className="badge">{CATEGORIES[k].attribute}</span></div>
                <input className="input" aria-label={`${CATEGORIES[k].name} goal`} value={goals[k].goal} onChange={(e) => setGoals((g) => ({ ...g, [k]: { ...g[k], goal: e.target.value } }))} placeholder={GOAL_HINT[k]} maxLength={200} />
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`${CATEGORIES[k].name} current level`}>
                  <span className="text-xs text-muted">Where are you now?</span>
                  {LEVELS.map((l) => <button key={l} type="button" className="chip" aria-pressed={goals[k].level === l} onClick={() => setGoals((g) => ({ ...g, [k]: { ...g[k], level: l } }))}>{l}</button>)}
                </div>
              </div>
            ))}
          </>
        )}

        {step === 2 && (
          <>
            <div><h1 className="text-2xl font-semibold">Your week</h1><p className="mt-1 text-sm text-muted">How many hours can you realistically give to your goals each day, after classes and everything else? The planner uses this to stop you overloading a day.</p></div>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAY_KEYS.map((k, i) => (
                <div key={k} className="text-center">
                  <label htmlFor={`h-${k}`} className="label !mb-1 text-center">{WEEKDAY_LABELS[i]}</label>
                  <input id={`h-${k}`} className="input !px-1 text-center" type="number" min={0} max={16} step={0.5} value={hours[k]} onChange={(e) => setHours((h) => ({ ...h, [k]: Math.max(0, Math.min(16, Number(e.target.value))) }))} />
                </div>
              ))}
            </div>
            <p className="hint -mt-2">Hours per day</p>
            <Field label="Most quests in a single day" htmlFor="ob-limit" hint="A hard stop on over-planning. 6–8 is realistic for most people.">
              <input id="ob-limit" className="input !w-28" type="number" min={1} max={30} value={limit} onChange={(e) => setLimit(Math.max(1, Math.min(30, Number(e.target.value))))} />
            </Field>
            <div>
              <div className="label">How fast should levels come?</div>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="XP pace">
                {(Object.keys(XP_PREFERENCES) as XpPreference[]).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={pref === k} className="card-inset p-3 text-left" style={pref === k ? { borderColor: "var(--accent)" } : undefined} onClick={() => setPref(k)}>
                    <div className="text-sm font-semibold">{XP_PREFERENCES[k].label}</div>
                    <div className="mt-0.5 text-xs text-muted">{XP_PREFERENCES[k].blurb}</div>
                  </button>
                ))}
              </div>
            </div>
            <Field label="Time zone" htmlFor="ob-tz" hint="Days start and end at midnight here, so streaks respect your day."><input id="ob-tz" className="input" value={tz} onChange={(e) => setTz(e.target.value)} /></Field>
          </>
        )}

        {step === 3 && (
          <>
            <div><h1 className="text-2xl font-semibold">Training & college</h1></div>
            <div>
              <div className="label">Basketball days</div>
              <DayPicker value={practiceDays} onToggle={(d) => toggleDay(practiceDays, setPracticeDays, d)} label="Basketball days" />
            </div>
            <div>
              <div className="label">Workout days <span className="font-normal text-faint">(the other days are recovery, and recovery counts)</span></div>
              <DayPicker value={workoutDays} onToggle={(d) => toggleDay(workoutDays, setWorkoutDays, d)} label="Workout days" />
            </div>
            <div className="space-y-2">
              <div className="label">College timetable <span className="font-normal text-faint">(optional)</span></div>
              {blocks.map((b, i) => (
                <div key={i} className="card-inset space-y-2 p-3">
                  <div className="flex gap-2">
                    <input className="input" aria-label="Class name" placeholder="Class or commitment" value={b.title} onChange={(e) => setBlocks((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                    <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove" onClick={() => setBlocks((l) => l.filter((_, j) => j !== i))}><Icon name="x" size={16} /></button>
                  </div>
                  <DayPicker value={b.days} label="Days" onToggle={(d) => setBlocks((l) => l.map((x, j) => (j === i ? { ...x, days: x.days.includes(d) ? x.days.filter((y) => y !== d) : [...x.days, d].sort() } : x)))} />
                  <div className="flex items-center gap-2">
                    <input type="time" className="input" aria-label="Starts" value={b.start} onChange={(e) => setBlocks((l) => l.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                    <span className="text-muted">to</span>
                    <input type="time" className="input" aria-label="Ends" value={b.end} onChange={(e) => setBlocks((l) => l.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn-sm" onClick={() => setBlocks((l) => [...l, { title: "", days: [1, 2, 3, 4, 5], start: "09:00", end: "15:00" }])}><Icon name="plus" size={14} /> Add a block</button>
            </div>
            <div className="space-y-2">
              <div className="label">Exam dates <span className="font-normal text-faint">(optional)</span></div>
              {exams.map((e, i) => (
                <div key={i} className="card-inset grid grid-cols-[1fr_1fr_auto] gap-2 p-3">
                  <input className="input" aria-label="Subject" placeholder="Subject" value={e.subject} onChange={(ev) => setExams((l) => l.map((x, j) => (j === i ? { ...x, subject: ev.target.value } : x)))} />
                  <input className="input" aria-label="Exam name" placeholder="Mid-term" value={e.title} onChange={(ev) => setExams((l) => l.map((x, j) => (j === i ? { ...x, title: ev.target.value } : x)))} />
                  <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove" onClick={() => setExams((l) => l.filter((_, j) => j !== i))}><Icon name="x" size={16} /></button>
                  <input type="date" className="input col-span-3" aria-label="Exam date" value={e.date} onChange={(ev) => setExams((l) => l.map((x, j) => (j === i ? { ...x, date: ev.target.value } : x)))} />
                </div>
              ))}
              <button type="button" className="btn btn-sm" onClick={() => setExams((l) => [...l, { subject: "", title: "", date: "" }])}><Icon name="plus" size={14} /> Add an exam</button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div><h1 className="text-2xl font-semibold">Career & finish</h1></div>
            <Field label="Full-stack learning goal" htmlFor="ob-dev" hint="Used as your headline goal in the Development area.">
              <input id="ob-dev" className="input" value={devGoal} onChange={(e) => setDevGoal(e.target.value)} placeholder="e.g. Ship 3 projects and land my first client" maxLength={200} />
            </Field>
            <div className="grid grid-cols-[1fr_8rem] gap-3">
              <Field label="Monthly freelance income target" htmlFor="ob-inc" hint="A target only. Income is counted when you record a real payment.">
                <input id="ob-inc" className="input" type="number" min={0} inputMode="numeric" value={income} onChange={(e) => setIncome(e.target.value)} />
              </Field>
              <Field label="Currency" htmlFor="ob-cur">
                <select id="ob-cur" className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
              </Field>
            </div>
            <label className="card-inset flex cursor-pointer items-start gap-3 p-3.5">
              <input type="checkbox" className="mt-1 size-4 accent-[var(--accent)]" checked={sample} onChange={(e) => setSample(e.target.checked)} />
              <span>
                <span className="block text-sm font-semibold">Add sample quests so I can see how it works</span>
                <span className="block text-xs text-muted">Clearly marked “Sample”. Remove them anytime in Settings, together with any XP they earned.</span>
              </span>
            </label>
          </>
        )}

        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex items-center justify-between pt-1">
          <button className="btn btn-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}>Back</button>
          <div className="flex gap-2">
            {!last && step > 0 && <button className="btn btn-ghost" onClick={() => setStep((s) => s + 1)}>Skip</button>}
            {last ? <button className="btn btn-primary" onClick={() => submit(false)} disabled={pending}>{pending ? "Creating…" : "Start playing"}</button> : <button className="btn btn-primary" onClick={next}>Continue</button>}
          </div>
        </div>
      </div>
    </main>
  );
}

function DayPicker({ value, onToggle, label }: { value: number[]; onToggle: (d: number) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {WEEKDAY_LABELS.map((l, i) => <button key={l} type="button" className="chip" aria-pressed={value.includes(i + 1)} onClick={() => onToggle(i + 1)}>{l}</button>)}
    </div>
  );
}
