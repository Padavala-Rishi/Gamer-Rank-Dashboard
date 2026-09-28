import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Plus, Sun, Trash2 } from "lucide-react";
import { post, ApiError } from "../lib/api";
import { Button, Field } from "../components/ui";
import { DEFAULT_LIFE_AREAS, SUGGESTED_VALUES } from "../../shared/constants";
import { useDocumentTitle } from "../lib/hooks";

interface Commitment {
  title: string;
  days: number[];
  start: string;
  end: string;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Onboarding() {
  useDocumentTitle("Welcome");
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    display_name: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    identity: "",
    ideal_life: "",
    what_matters: "",
    current_reality: "",
    constraints: "",
    values: [] as string[],
    customValue: "",
    attention_areas: [] as string[],
    goals: [{ title: "", area_key: "", why: "" }] as { title: string; area_key: string; why: string }[],
    habits: [{ title: "", minimum: "" }] as { title: string; minimum: string }[],
    day_start: "07:00",
    day_end: "22:00",
    fixed: [] as Commitment[],
    load_demo: false,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const finish = async (skip = false) => {
    setBusy(true);
    setError(null);
    try {
      await post(
        "/onboarding",
        skip
          ? { timezone: f.timezone, load_demo: f.load_demo }
          : {
              display_name: f.display_name || null,
              timezone: f.timezone,
              identity: f.identity,
              ideal_life: f.ideal_life,
              what_matters: f.what_matters,
              current_reality: f.current_reality,
              constraints: f.constraints,
              values: f.values,
              attention_areas: f.attention_areas,
              goals: f.goals.filter((g) => g.title.trim()).map((g) => ({ title: g.title.trim(), area_key: g.area_key || null, why: g.why || null })),
              habits: f.habits.filter((h) => h.title.trim()).map((h) => ({ title: h.title.trim(), minimum: h.minimum || null })),
              day_start: f.day_start,
              day_end: f.day_end,
              fixed_commitments: f.fixed.filter((c) => c.title.trim() && c.days.length && c.end > c.start),
              load_demo: f.load_demo,
            },
      );
      await qc.invalidateQueries();
    } catch (e) {
      setError(e instanceof ApiError ? (e.fields ? Object.entries(e.fields).map(([k, v]) => `${k}: ${v}`).join(" · ") : e.message) : "Couldn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const steps = [
    {
      title: "Welcome to Human OS",
      body: (
        <div className="col gap-16">
          <p className="ink-2" style={{ fontSize: 15 }}>
            This isn't a to-do list. It connects who you want to become with what you do today — and shows you honestly whether it's working. The next few questions take about five minutes. You can skip any of them.
          </p>
          <Field label="What should we call you?" htmlFor="ob-name">
            <input id="ob-name" className="input" value={f.display_name} onChange={(e) => set("display_name", e.target.value)} placeholder="Your first name" autoFocus />
          </Field>
          <Field label="Timezone" hint="Used for your days, habits and reminders." htmlFor="ob-tz">
            <input id="ob-tz" className="input" value={f.timezone} onChange={(e) => set("timezone", e.target.value)} />
          </Field>
        </div>
      ),
    },
    {
      title: "Identity",
      body: (
        <Prompt q="Who are you trying to become?" hint="Describe the person, not the achievements. “Someone who keeps promises to themselves…”" value={f.identity} onChange={(v) => set("identity", v)} />
      ),
    },
    {
      title: "Vision",
      body: (
        <div className="col gap-16">
          <Prompt q="What does your ideal life look like, a few years from now?" value={f.ideal_life} onChange={(v) => set("ideal_life", v)} />
          <Prompt q="What matters most to you right now?" value={f.what_matters} onChange={(v) => set("what_matters", v)} rows={3} />
        </div>
      ),
    },
    {
      title: "Current reality",
      body: (
        <div className="col gap-16">
          <Prompt q="Where are you now, honestly?" hint="No judgement — a clear starting point makes progress visible." value={f.current_reality} onChange={(v) => set("current_reality", v)} />
          <Prompt q="What limits you? (time, money, health, obligations…)" value={f.constraints} onChange={(v) => set("constraints", v)} rows={3} />
        </div>
      ),
    },
    {
      title: "Values",
      body: (
        <div className="col gap-12">
          <p className="prompt-q">Which values do you want to live by? Pick up to five.</p>
          <div className="chips">
            {[...new Set([...SUGGESTED_VALUES, ...f.values])].map((v) => {
              const on = f.values.includes(v);
              return (
                <button key={v} type="button" className="chip" aria-pressed={on} onClick={() => set("values", on ? f.values.filter((x) => x !== v) : f.values.length < 10 ? [...f.values, v] : f.values)}>
                  {v}
                </button>
              );
            })}
          </div>
          <div className="row">
            <input className="input" value={f.customValue} onChange={(e) => set("customValue", e.target.value)} placeholder="Add your own" aria-label="Custom value" maxLength={60} />
            <Button
              onClick={() => {
                const v = f.customValue.trim();
                if (v && !f.values.includes(v) && f.values.length < 10) setF((s) => ({ ...s, values: [...s.values, v], customValue: "" }));
              }}
            >
              Add
            </Button>
          </div>
        </div>
      ),
    },
    {
      title: "Life areas",
      body: (
        <div className="col gap-12">
          <p className="prompt-q">Which areas of life need your attention most right now?</p>
          <div className="chips">
            {DEFAULT_LIFE_AREAS.map((a) => {
              const on = f.attention_areas.includes(a.key);
              return (
                <button key={a.key} type="button" className="chip" aria-pressed={on} onClick={() => set("attention_areas", on ? f.attention_areas.filter((x) => x !== a.key) : [...f.attention_areas, a.key])}>
                  <span className="dot" style={{ background: a.color }} aria-hidden /> {a.name}
                </button>
              );
            })}
          </div>
          <p className="small muted">You can rename, add or archive areas later.</p>
        </div>
      ),
    },
    {
      title: "Goals",
      body: (
        <div className="col gap-12">
          <p className="prompt-q">What do you want to achieve in the next three months?</p>
          <p className="small muted">One to three is plenty. They'll become your focus goals.</p>
          {f.goals.map((g, i) => (
            <div key={i} className="card flat card-pad col gap-8">
              <div className="row">
                <input className="input" value={g.title} onChange={(e) => set("goals", f.goals.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="e.g. Pass my exams with 8.5+ CGPA" aria-label={`Goal ${i + 1}`} />
                {f.goals.length > 1 && (
                  <Button variant="ghost" icon onClick={() => set("goals", f.goals.filter((_, j) => j !== i))} aria-label="Remove goal">
                    <Trash2 size={15} />
                  </Button>
                )}
              </div>
              <div className="form-grid">
                <select className="select" value={g.area_key} onChange={(e) => set("goals", f.goals.map((x, j) => (j === i ? { ...x, area_key: e.target.value } : x)))} aria-label="Life area">
                  <option value="">Life area…</option>
                  {DEFAULT_LIFE_AREAS.map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <input className="input" value={g.why} onChange={(e) => set("goals", f.goals.map((x, j) => (j === i ? { ...x, why: e.target.value } : x)))} placeholder="Why it matters" aria-label="Why it matters" />
              </div>
            </div>
          ))}
          {f.goals.length < 3 && (
            <Button onClick={() => set("goals", [...f.goals, { title: "", area_key: "", why: "" }])} style={{ alignSelf: "flex-start" }}>
              <Plus size={15} aria-hidden /> Another goal
            </Button>
          )}
        </div>
      ),
    },
    {
      title: "Habits",
      body: (
        <div className="col gap-12">
          <p className="prompt-q">Which small daily habits would move you forward?</p>
          <p className="small muted">Give each a minimum version — so a bad day still counts. “Study 60 min” → minimum “10 min”.</p>
          {f.habits.map((h, i) => (
            <div key={i} className="form-grid">
              <input className="input" value={h.title} onChange={(e) => set("habits", f.habits.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="Habit, e.g. Study Python" aria-label={`Habit ${i + 1}`} />
              <input className="input" value={h.minimum} onChange={(e) => set("habits", f.habits.map((x, j) => (j === i ? { ...x, minimum: e.target.value } : x)))} placeholder="Minimum, e.g. 10 minutes" aria-label={`Minimum for habit ${i + 1}`} />
            </div>
          ))}
          {f.habits.length < 3 && (
            <Button onClick={() => set("habits", [...f.habits, { title: "", minimum: "" }])} style={{ alignSelf: "flex-start" }}>
              <Plus size={15} aria-hidden /> Another habit
            </Button>
          )}
        </div>
      ),
    },
    {
      title: "Your week",
      body: (
        <div className="col gap-12">
          <p className="prompt-q">What does a typical week look like?</p>
          <div className="form-grid">
            <Field label="My day usually starts" htmlFor="ob-ds">
              <input id="ob-ds" className="input" type="time" value={f.day_start} onChange={(e) => set("day_start", e.target.value)} />
            </Field>
            <Field label="…and ends" htmlFor="ob-de">
              <input id="ob-de" className="input" type="time" value={f.day_end} onChange={(e) => set("day_end", e.target.value)} />
            </Field>
          </div>
          <p className="small muted">Fixed commitments (classes, work, gym) — so plans never pretend that time is free.</p>
          {f.fixed.map((c, i) => (
            <div key={i} className="card flat card-pad col gap-8">
              <div className="row">
                <input className="input" value={c.title} onChange={(e) => set("fixed", f.fixed.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="e.g. Classes" aria-label="Commitment" />
                <Button variant="ghost" icon onClick={() => set("fixed", f.fixed.filter((_, j) => j !== i))} aria-label="Remove">
                  <Trash2 size={15} />
                </Button>
              </div>
              <div className="chips">
                {DAYS.map((d, di) => (
                  <button key={d} type="button" className="chip" aria-pressed={c.days.includes(di)} onClick={() => set("fixed", f.fixed.map((x, j) => (j === i ? { ...x, days: x.days.includes(di) ? x.days.filter((y) => y !== di) : [...x.days, di] } : x)))}>
                    {d}
                  </button>
                ))}
              </div>
              <div className="row">
                <input className="input" type="time" value={c.start} onChange={(e) => set("fixed", f.fixed.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} aria-label="Start time" />
                <span className="muted">to</span>
                <input className="input" type="time" value={c.end} onChange={(e) => set("fixed", f.fixed.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} aria-label="End time" />
              </div>
            </div>
          ))}
          <Button onClick={() => set("fixed", [...f.fixed, { title: "", days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }])} style={{ alignSelf: "flex-start" }}>
            <Plus size={15} aria-hidden /> Add a commitment
          </Button>
        </div>
      ),
    },
    {
      title: "Your Life OS is ready",
      body: (
        <div className="col gap-16">
          <p className="ink-2" style={{ fontSize: 15 }}>
            We'll create your vision, values, focus goals, habits and weekly schedule from your answers. Everything is editable.
          </p>
          <div className="card flat card-pad">
            <label className="check">
              <input type="checkbox" checked={f.load_demo} onChange={(e) => set("load_demo", e.target.checked)} />
              Also load demo data to explore every feature
            </label>
            <p className="small muted mt-4">Demo items are tagged separately and can be removed in one click from the banner or Settings.</p>
          </div>
          <p className="small muted">
            The loop you'll live in: <strong>Vision → Goals → Plan → Execute → Measure → Reflect → Adapt</strong>.
          </p>
        </div>
      ),
    },
  ];

  const last = step === steps.length - 1;
  return (
    <div className="onboarding">
      <div className="row between" style={{ marginBottom: 24 }}>
        <span className="row strong">
          <span className="brand-mark" aria-hidden>
            <Sun size={16} />
          </span>
          Human OS
        </span>
        <Button variant="ghost" size="sm" onClick={() => finish(true)} disabled={busy}>
          Skip setup
        </Button>
      </div>
      <div className="steps" aria-hidden>
        {steps.map((_, i) => (
          <span key={i} className={i <= step ? "on" : ""} />
        ))}
      </div>
      <p className="small muted">
        Step {step + 1} of {steps.length}
      </p>
      <h1 style={{ margin: "4px 0 20px" }}>{steps[step].title}</h1>
      {steps[step].body}
      {error && (
        <div className="form-error mt-16" role="alert">
          {error}
        </div>
      )}
      <div className="row between mt-24">
        <Button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft size={15} aria-hidden /> Back
        </Button>
        {last ? (
          <Button variant="primary" size="lg" onClick={() => finish(false)} loading={busy}>
            Build my Life OS
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setStep((s) => s + 1)}>
            Continue <ArrowRight size={15} aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}

function Prompt({ q, hint, value, onChange, rows = 4 }: { q: string; hint?: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div className="col gap-4">
      <label className="prompt-q">
        {q}
        <textarea className="textarea serif mt-8" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} maxLength={4000} style={{ display: "block" }} />
      </label>
      {hint && <span className="small muted">{hint}</span>}
    </div>
  );
}
