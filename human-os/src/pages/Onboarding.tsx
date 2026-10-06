import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Sun } from "lucide-react";
import { post, ApiError } from "../lib/api";
import { Button, Field } from "../components/ui";
import { DEFAULT_LIFE_AREAS } from "../../shared/constants";
import { useDocumentTitle } from "../lib/hooks";

// Four short steps. Everything else (vision, values, projects…) can be added later.
export default function Onboarding() {
  useDocumentTitle("Welcome");
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    display_name: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    goal: "",
    goal_area: "",
    habit: "",
    habit_minimum: "",
    day_start: "07:00",
    day_end: "22:00",
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
              goals: f.goal.trim() ? [{ title: f.goal.trim(), area_key: f.goal_area || null }] : [],
              habits: f.habit.trim() ? [{ title: f.habit.trim(), minimum: f.habit_minimum || null }] : [],
              day_start: f.day_start,
              day_end: f.day_end,
              load_demo: f.load_demo,
            },
      );
      await qc.invalidateQueries();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const steps = [
    {
      title: "Welcome",
      body: (
        <div className="col gap-16">
          <p className="ink-2" style={{ fontSize: 15 }}>
            A calm place to decide what to do today, and see whether it's moving you toward what matters. Four quick questions. You can skip any of them.
          </p>
          <Field label="What should we call you?" htmlFor="ob-name">
            <input id="ob-name" className="input" value={f.display_name} onChange={(e) => set("display_name", e.target.value)} placeholder="Your first name" autoFocus />
          </Field>
        </div>
      ),
    },
    {
      title: "One thing you want to achieve",
      body: (
        <div className="col gap-16">
          <Field label="What do you want to achieve in the next three months?" htmlFor="ob-goal" hint="One goal is plenty. You can add more later.">
            <input id="ob-goal" className="input" value={f.goal} onChange={(e) => set("goal", e.target.value)} placeholder="e.g. Pass my exams with 8.5+ CGPA" autoFocus />
          </Field>
          <Field label="Which part of life is it about? (optional)" htmlFor="ob-area">
            <select id="ob-area" className="select" value={f.goal_area} onChange={(e) => set("goal_area", e.target.value)}>
              <option value="">— Not sure —</option>
              {DEFAULT_LIFE_AREAS.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ),
    },
    {
      title: "One small daily habit",
      body: (
        <div className="col gap-16">
          <Field label="Which small habit would help most?" htmlFor="ob-habit" hint="Pick something you can repeat every day.">
            <input id="ob-habit" className="input" value={f.habit} onChange={(e) => set("habit", e.target.value)} placeholder="e.g. Study Python" autoFocus />
          </Field>
          <Field label="What's the smallest version you can do on a bad day?" htmlFor="ob-min" hint="So a bad day still counts.">
            <input id="ob-min" className="input" value={f.habit_minimum} onChange={(e) => set("habit_minimum", e.target.value)} placeholder="e.g. 10 minutes" />
          </Field>
        </div>
      ),
    },
    {
      title: "Your day",
      body: (
        <div className="col gap-16">
          <div className="form-grid">
            <Field label="My day usually starts" htmlFor="ob-ds">
              <input id="ob-ds" className="input" type="time" value={f.day_start} onChange={(e) => set("day_start", e.target.value)} />
            </Field>
            <Field label="…and ends" htmlFor="ob-de">
              <input id="ob-de" className="input" type="time" value={f.day_end} onChange={(e) => set("day_end", e.target.value)} />
            </Field>
          </div>
          <div className="card flat card-pad">
            <label className="check">
              <input type="checkbox" checked={f.load_demo} onChange={(e) => set("load_demo", e.target.checked)} />
              Fill the app with example data so I can look around
            </label>
            <p className="small muted mt-4">Examples are labelled and can be removed in one tap.</p>
          </div>
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
            Get started
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
