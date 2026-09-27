import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Brain, Dumbbell, HeartPulse, Home, LineChart as LineIcon, Plus, Pencil } from "lucide-react";
import { useApi, useDocumentTitle, useMutate, useResource, useToday } from "../lib/hooks";
import type { Checkin, EnvironmentCheck, Metric, MetricEntry, Workout } from "../lib/types";
import { Async, Button, Card, Empty, Modal, PageHeader, Stat, Tabs } from "../components/ui";
import { FormModal } from "../components/ResourceForm";
import { environmentFields, metricFields, workoutFields } from "../lib/fields";
import { CheckinForm } from "../components/daily";
import { LineChart, BarChart, Sparkline } from "../components/charts";
import { ENVIRONMENT_AREAS, INTENSITIES, WORKOUT_KINDS, label } from "../../shared/constants";
import { addDays, eachDay } from "../../shared/dates";
import { fmtDate, fmtMin } from "../lib/format";

type Tab = "overview" | "workouts" | "metrics" | "environment";

export default function Health() {
  useDocumentTitle("Health");
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>("overview");
  const [checkin, setCheckin] = useState(false);
  const [workout, setWorkout] = useState<Record<string, unknown> | null>(null);
  const today = useToday();
  useEffect(() => {
    if (params.get("new") === "workout") setWorkout({});
    if (params.get("checkin")) setCheckin(true);
    if (params.get("new") || params.get("checkin")) {
      params.delete("new");
      params.delete("checkin");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);
  const todayCheckin = useResource<Checkin>("checkins", { entry_date: today });

  return (
    <div className="page">
      <PageHeader
        title="Health & wellbeing"
        subtitle="Sleep, movement, recovery and mood — the foundation everything else stands on."
        actions={
          <>
            <Button onClick={() => setWorkout({})}>
              <Dumbbell size={15} aria-hidden /> Log workout
            </Button>
            <Button variant="primary" onClick={() => setCheckin(true)}>
              <HeartPulse size={15} aria-hidden /> {todayCheckin.data?.length ? "Edit check-in" : "Check in"}
            </Button>
          </>
        }
      />
      <Tabs label="Health sections" value={tab} onChange={setTab} options={[["overview", "Trends"], ["workouts", "Exercise"], ["metrics", "Custom metrics"], ["environment", "Environment"]]} />
      {tab === "overview" && <Overview />}
      {tab === "workouts" && <Workouts onEdit={setWorkout} />}
      {tab === "metrics" && <Metrics />}
      {tab === "environment" && <Environment />}
      <p className="tiny muted mt-24">
        Human OS tracks what you tell it; it doesn't give medical advice. For symptoms, persistent low mood, or anything that worries you, please talk to a doctor or mental-health professional.
      </p>
      <Modal open={checkin} onClose={() => setCheckin(false)} title="Daily check-in" wide>
        {checkin && <CheckinForm existing={todayCheckin.data?.[0] ?? null} date={today} onDone={() => setCheckin(false)} />}
      </Modal>
      <FormModal open={workout !== null} onClose={() => setWorkout(null)} title={workout?.id ? "Edit workout" : "Log workout"} resource="workouts" fields={workoutFields} initial={workout ?? {}} />
    </div>
  );
}

function Overview() {
  const today = useToday();
  const from = addDays(today, -29);
  const q = useResource<Checkin>("checkins", { from, to: today });
  const w = useResource<Workout>("workouts", { from, to: today });
  const days = eachDay(from, today);
  const series = useMemo(() => {
    const by = new Map((q.data ?? []).map((c) => [c.entry_date, c]));
    const pick = (k: keyof Checkin) => days.map((d) => (by.get(d)?.[k] as number | null | undefined) ?? null);
    return { sleep: pick("sleep_hours"), mood: pick("mood"), energy: pick("energy"), stress: pick("stress") };
  }, [q.data, days]);
  const exByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of w.data ?? []) m.set(x.occurred_on, (m.get(x.occurred_on) ?? 0) + x.duration_min);
    return days.map((d) => m.get(d) ?? 0);
  }, [w.data, days]);
  const avg = (a: (number | null)[]) => {
    const v = a.filter((x): x is number => x != null);
    return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null;
  };
  return (
    <Async q={q}>
      {(rows) =>
        rows.length === 0 ? (
          <Card>
            <Empty icon={<HeartPulse size={20} />} title="No check-ins yet">
              A 30-second daily check-in (sleep, energy, mood, stress) is enough to reveal patterns within a couple of weeks.
            </Empty>
          </Card>
        ) : (
          <div className="col gap-16">
            <Card pad>
              <div className="stats-row">
                <Stat label="Sleep (30d avg)" value={avg(series.sleep) ?? "—"} unit="h" />
                <Stat label="Mood" value={avg(series.mood) ?? "—"} unit="/5" />
                <Stat label="Energy" value={avg(series.energy) ?? "—"} unit="/5" />
                <Stat label="Stress" value={avg(series.stress) ?? "—"} unit="/5" />
                <Stat label="Exercise" value={fmtMin(exByDay.reduce((a, b) => a + b, 0))} delta={`${exByDay.filter((x) => x > 0).length} active days`} />
                <Stat label="Check-ins" value={rows.length} unit="/30 days" />
              </div>
            </Card>
            <div className="grid grid-2">
              <Card title="Sleep (hours)">
                <LineChart label="Sleep hours" dates={days} values={series.sleep} max={10} format={(v) => `${v}h`} />
              </Card>
              <Card title="Exercise (minutes)">
                <BarChart label="Exercise minutes" dates={days} values={exByDay} format={(v) => `${Math.round(v)}m`} />
              </Card>
              <Card title="Mood">
                <LineChart label="Mood" dates={days} values={series.mood} max={5} />
              </Card>
              <Card title="Stress">
                <LineChart label="Stress" dates={days} values={series.stress} max={5} color="var(--p-high)" />
              </Card>
            </div>
            <Card title="Mental check-in" icon={<Brain size={15} aria-hidden />}>
              <div className="row between wrap">
                <p className="small muted">What am I feeling? What's affecting me? What do I need? What can I control? What should I let go of?</p>
                <Link className="btn" to="/journal?new=checkin">
                  Start mental check-in
                </Link>
              </div>
            </Card>
          </div>
        )
      }
    </Async>
  );
}

function Workouts({ onEdit }: { onEdit: (w: Record<string, unknown>) => void }) {
  const q = useResource<Workout>("workouts", { limit: 200 });
  const today = useToday();
  return (
    <Async q={q}>
      {(ws) =>
        ws.length === 0 ? (
          <Card>
            <Empty icon={<Dumbbell size={20} />} title="No workouts logged" action={<Button variant="primary" onClick={() => onEdit({})}>Log a workout</Button>}>
              Strength, cardio, mobility, sport, or a walk — all of it counts.
            </Empty>
          </Card>
        ) : (
          <Card>
            <div className="list">
              {ws.map((w) => (
                <button key={w.id} className="item clickable" style={{ background: "none", border: 0, borderBottom: "1px solid var(--border)", width: "100%", textAlign: "left" }} onClick={() => onEdit(w as unknown as Record<string, unknown>)}>
                  <Dumbbell size={15} className="muted" aria-hidden />
                  <span className="grow">
                    <span className="item-title">{label(WORKOUT_KINDS, w.kind)}</span>
                    <span className="meta">
                      <span>{label(INTENSITIES, w.intensity)}</span>
                      {w.notes && <span className="ellipsis">{w.notes}</span>}
                    </span>
                  </span>
                  <span className="small">{fmtMin(w.duration_min)}</span>
                  <span className="small muted" style={{ width: 80, textAlign: "right" }}>
                    {fmtDate(w.occurred_on, today)}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        )
      }
    </Async>
  );
}

function Metrics() {
  const q = useResource<Metric>("metrics");
  const entries = useResource<MetricEntry>("metric-entries", { limit: 2000 });
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const mut = useMutate();
  const today = useToday();
  return (
    <div className="col gap-16">
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <Button onClick={() => setEditing({})}>
          <Plus size={15} aria-hidden /> New metric
        </Button>
      </div>
      <Async q={q}>
        {(ms) =>
          ms.length === 0 ? (
            <Card>
              <Empty icon={<LineIcon size={20} />} title="No custom metrics">
                Track anything that matters to you: weight, resting heart rate, pages read, hours practised…
              </Empty>
            </Card>
          ) : (
            <div className="grid grid-auto">
              {ms.map((m) => {
                const es = (entries.data ?? []).filter((e) => e.metric_id === m.id).sort((a, b) => a.entry_date.localeCompare(b.entry_date));
                const last = es[es.length - 1];
                return (
                  <Card key={m.id} title={m.name} actions={<Button size="sm" variant="ghost" icon aria-label={`Edit ${m.name}`} onClick={() => setEditing(m as unknown as Record<string, unknown>)}><Pencil size={14} /></Button>}>
                    <div className="row between">
                      <Stat label={last ? `Latest · ${fmtDate(last.entry_date, today)}` : "No entries"} value={last ? last.value : "—"} unit={m.unit ?? undefined} delta={m.target != null ? `Target ${m.target}${m.unit ? " " + m.unit : ""} (${m.direction === "lower" ? "lower is better" : m.direction === "higher" ? "higher is better" : "closer is better"})` : null} />
                      <Sparkline values={es.slice(-20).map((e) => e.value)} />
                    </div>
                    <form
                      className="row mt-12"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const v = values[m.id];
                        if (v === undefined || v === "") return;
                        await mut.create("metric-entries", { metric_id: m.id, entry_date: today, value: Number(v) }, { success: "Logged" }).catch(() => {});
                        setValues({ ...values, [m.id]: "" });
                      }}
                    >
                      <input className="input" type="number" step="any" value={values[m.id] ?? ""} onChange={(e) => setValues({ ...values, [m.id]: e.target.value })} placeholder={`Today's ${m.unit ?? "value"}`} aria-label={`Today's value for ${m.name}`} />
                      <Button type="submit">Log</Button>
                    </form>
                  </Card>
                );
              })}
            </div>
          )
        }
      </Async>
      <FormModal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? "Edit metric" : "New metric"} resource="metrics" fields={metricFields} initial={editing ?? {}} deleteConfirm={{ title: "Delete this metric?", body: "All its entries are deleted too." }} />
    </div>
  );
}

const ENV_SUGGESTIONS: Record<string, string[]> = {
  workspace: ["Clear the desk except for what this session needs", "Face away from foot traffic; use headphones", "Keep water and notes within reach"],
  digital: ["Close every tab you're not using", "Move distracting apps off the home screen", "One browser profile for work, another for leisure"],
  notifications: ["Turn off all non-human notifications", "Schedule Focus / Do Not Disturb during deep work", "Batch messaging to 2–3 set times"],
  sleep: ["Charge the phone outside the bedroom", "Same wake time every day, even weekends", "Dim screens and lights an hour before bed"],
  study: ["A dedicated study spot your brain associates with focus", "Everything prepared the night before", "Library or café when home is noisy"],
  social: ["Tell people your focus hours", "Spend time with people who share your goals", "Reduce time with people who drain you"],
};

function Environment() {
  const q = useResource<EnvironmentCheck>("environment-checks");
  const focusStats = useApi<{ distractions_by_kind: Record<string, number> }>("/focus/stats");
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const today = useToday();
  const latest = (area: string) => (q.data ?? []).find((c) => c.area === area);
  const d = focusStats.data?.distractions_by_kind ?? {};
  const phoneHeavy = (d.phone ?? 0) + (d.social ?? 0) + (d.messaging ?? 0) + (d.youtube ?? 0);
  return (
    <div className="col gap-16">
      {phoneHeavy >= 5 && (
        <Card className="accent" pad>
          <p className="small">
            <strong>Pattern from your distraction log:</strong> {phoneHeavy} of your recent distractions came from your phone, social media, video or messaging. The single most effective change is usually physical distance — put the phone in another room during focus sessions.
          </p>
        </Card>
      )}
      <div className="grid grid-3">
        {ENVIRONMENT_AREAS.map(([k, l]) => {
          const c = latest(k);
          return (
            <Card key={k} title={l} icon={<Home size={14} aria-hidden />} actions={<Button size="sm" variant="ghost" onClick={() => setEditing({ area: k })}>Check</Button>}>
              {c ? (
                <div className="col gap-4">
                  <span className="small">
                    Rated <strong>{c.rating}/5</strong> · {fmtDate(c.checked_on, today)}
                  </span>
                  {c.note && <span className="small muted">{c.note}</span>}
                  {c.change_idea && <span className="small">Trying: {c.change_idea}</span>}
                </div>
              ) : (
                <p className="small muted">Not assessed yet.</p>
              )}
              {(!c || c.rating <= 3) && (
                <ul className="small muted mt-8" style={{ margin: "8px 0 0", paddingLeft: 16 }}>
                  {ENV_SUGGESTIONS[k].map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
      <p className="tiny muted">Environment beats willpower: small changes to your surroundings make the right behaviour the easy one.</p>
      <FormModal open={editing !== null} onClose={() => setEditing(null)} title="Environment check" resource="environment-checks" fields={environmentFields} initial={editing ?? {}} />
    </div>
  );
}
