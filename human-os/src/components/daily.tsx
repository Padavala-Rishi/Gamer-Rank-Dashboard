import { useState } from "react";
import { Check, Flame, Minus, MoonStar, SkipForward } from "lucide-react";
import type { Checkin, HabitView } from "../lib/types";
import { useMutate, useToday } from "../lib/hooks";
import { Button, Field, Scale } from "./ui";
import { ApiError } from "../lib/api";

/** Done / minimum / skip controls for one habit on one day. Clicking the active state clears it. */
export function HabitDayControl({ habit, date, compact = false }: { habit: HabitView; date: string; compact?: boolean }) {
  const mut = useMutate();
  const log = habit.logs.find((l) => l.date === date);
  const status = log?.status ?? null;
  const set = async (s: "done" | "minimum" | "skipped") => {
    try {
      if (status === s && log) await mut.remove("habit-logs", log.id);
      else await mut.create("habit-logs", { habit_id: habit.id, date, status: s, value: s === "done" ? habit.target_value : s === "minimum" ? habit.minimum_value : null });
    } catch {
      /* toast shown */
    }
  };
  const minLabel = habit.minimum_value != null ? `Minimum (${habit.minimum_value}${habit.unit ? " " + habit.unit : ""})` : "Minimum version";
  return (
    <div className="seg" role="group" aria-label={`Log “${habit.title}”`}>
      <button aria-pressed={status === "done"} onClick={() => set("done")} title={habit.target_value != null ? `Target: ${habit.target_value} ${habit.unit ?? ""}` : "Done"}>
        <Check size={14} aria-hidden />
        {!compact && "Done"}
        {compact && <span className="sr-only">Done</span>}
      </button>
      <button aria-pressed={status === "minimum"} onClick={() => set("minimum")} title={minLabel}>
        <Minus size={14} aria-hidden />
        {!compact && "Min"}
        {compact && <span className="sr-only">{minLabel}</span>}
      </button>
      <button aria-pressed={status === "skipped"} onClick={() => set("skipped")} title="Skip on purpose (doesn't break the streak)">
        <SkipForward size={14} aria-hidden />
        <span className="sr-only">Skip</span>
      </button>
    </div>
  );
}

export function StreakBadge({ habit }: { habit: HabitView }) {
  const s = habit.stats;
  if (!s.currentStreak) return null;
  return (
    <span className="badge" title={`Best: ${s.bestStreak} ${s.streakUnit}`}>
      <Flame size={11} aria-hidden /> {s.currentStreak} {s.streakUnit === "weeks" ? "wk" : "d"}
    </span>
  );
}

export function CheckinForm({ existing, onDone, date: dateProp }: { existing?: Checkin | null; onDone?: () => void; date?: string }) {
  const today = useToday();
  const date = dateProp ?? existing?.entry_date ?? today;
  const [v, setV] = useState<Partial<Checkin>>(
    existing ?? { sleep_hours: null, sleep_quality: null, mood: null, energy: null, stress: null, rest_day: false },
  );
  const [error, setError] = useState<string | null>(null);
  const mut = useMutate();
  const set = <K extends keyof Checkin>(k: K, val: Checkin[K] | null) => setV((s) => ({ ...s, [k]: val }));
  const save = async () => {
    setError(null);
    try {
      const { id: _id, created_at: _c, updated_at: _u, is_demo: _d, ...rest } = v as Checkin;
      void _id; void _c; void _u; void _d;
      await mut.create("checkins", { ...rest, entry_date: date }, { success: "Check-in saved", silentError: true });
      onDone?.();
    } catch (e) {
      setError(e instanceof ApiError ? Object.values(e.fields ?? {})[0] ?? e.message : "Couldn't save");
    }
  };
  return (
    <div className="col gap-12">
      <div className="form-grid">
        <Field label="Sleep (hours)" htmlFor="ci-sleep">
          <input id="ci-sleep" className="input" type="number" min={0} max={24} step={0.5} value={v.sleep_hours ?? ""} onChange={(e) => set("sleep_hours", e.target.value === "" ? null : Number(e.target.value))} />
        </Field>
        <Field label="Sleep quality">
          <Scale name="Sleep quality" value={v.sleep_quality} onChange={(x) => set("sleep_quality", x)} labels={["Poor", "Great"]} />
        </Field>
        <Field label="Mood">
          <Scale name="Mood" value={v.mood} onChange={(x) => set("mood", x)} labels={["Low", "Great"]} />
        </Field>
        <Field label="Energy">
          <Scale name="Energy" value={v.energy} onChange={(x) => set("energy", x)} labels={["Drained", "Energised"]} />
        </Field>
        <Field label="Stress">
          <Scale name="Stress" value={v.stress} onChange={(x) => set("stress", x)} labels={["Calm", "Very stressed"]} />
        </Field>
        <Field label="Nutrition">
          <Scale name="Nutrition" value={v.nutrition} onChange={(x) => set("nutrition", x)} labels={["Poor", "Nourishing"]} />
        </Field>
        <Field label="Steps" htmlFor="ci-steps">
          <input id="ci-steps" className="input" type="number" min={0} value={v.steps ?? ""} onChange={(e) => set("steps", e.target.value === "" ? null : Number(e.target.value))} />
        </Field>
        <Field label="Water (glasses)" htmlFor="ci-water">
          <input id="ci-water" className="input" type="number" min={0} max={50} value={v.water_glasses ?? ""} onChange={(e) => set("water_glasses", e.target.value === "" ? null : Number(e.target.value))} />
        </Field>
        <Field label="Screen / distraction time (min)" hint="From your phone's screen-time report, if you track it." htmlFor="ci-screen">
          <input id="ci-screen" className="input" type="number" min={0} max={1440} value={v.screen_min ?? ""} onChange={(e) => set("screen_min", e.target.value === "" ? null : Number(e.target.value))} />
        </Field>
        <div className="field" style={{ justifyContent: "flex-end" }}>
          <label className="check">
            <input type="checkbox" checked={!!v.rest_day} onChange={(e) => set("rest_day", e.target.checked)} />
            <MoonStar size={14} aria-hidden /> Rest day
          </label>
        </div>
        <Field label="Notes" full htmlFor="ci-notes">
          <textarea id="ci-notes" className="textarea" rows={2} value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Anything affecting you today?" />
        </Field>
      </div>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        {onDone && <Button onClick={onDone}>Cancel</Button>}
        <Button variant="primary" onClick={save} loading={mut.pending}>
          Save check-in
        </Button>
      </div>
      <p className="tiny muted">This is a self-check, not a medical assessment. If something feels seriously off, please talk to a professional.</p>
    </div>
  );
}
