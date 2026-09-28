import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Plus, Sparkles, Trophy, X } from "lucide-react";
import { useApi, useDocumentTitle, useMutate, useResource, useToday } from "../lib/hooks";
import type { Review } from "../lib/types";
import { Button, Card, ErrorState, PageHeader, Skeleton, Stat, Tabs } from "../components/ui";
import { BarList } from "../components/charts";
import { PaceBadge } from "../components/entities";
import { REVIEW_PROMPTS } from "../../shared/constants";
import { addDays, addMonths } from "../../shared/dates";
import { fmtDate, fmtMin, pct } from "../lib/format";
import { formatMoney } from "../../shared/finance";
import { ApiError, post } from "../lib/api";

type Kind = "weekly" | "monthly" | "quarterly";

interface StatsResp {
  kind: Kind;
  from: string;
  to: string;
  review: Review | null;
  stats: {
    summary: Record<string, number | null>;
    wins: { important_tasks: { id: string; title: string }[]; milestones: { id: string; title: string; goal: string }[]; goals_achieved: { id: string; title: string }[]; projects_completed: { id: string; title: string }[] };
    slipped: { overdue_tasks: { id: string; title: string; due_date: string }[]; missed_milestones: { id: string; title: string; goal: string }[] };
    bottlenecks: string[];
    goals: { id: string; title: string; progress: number | null; pace: string; horizon: string; is_focus: boolean }[];
    habits: { id: string; title: string; completed: number; target: number; rate: number | null }[];
    relationships: { interactions: number };
    journal_entries: number;
    finance: { income: number; expenses: number };
    area_time: { area: string; minutes: number }[];
  };
}

export default function Reviews() {
  useDocumentTitle("Reviews");
  const [params, setParams] = useSearchParams();
  const kind = (params.get("kind") as Kind) || "weekly";
  const today = useToday();
  const [anchor, setAnchor] = useState(today);
  const q = useApi<StatsResp>(`/reviews/stats?kind=${kind}&date=${anchor}`);
  const past = useResource<Review>("reviews", { kind });
  const setKind = (k: Kind) => {
    params.set("kind", k);
    setParams(params, { replace: true });
    setAnchor(today);
  };
  const step = (n: number) => setAnchor(kind === "weekly" ? addDays(anchor, 7 * n) : addMonths(anchor, (kind === "monthly" ? 1 : 3) * n));

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <PageHeader title="Reviews" subtitle="Look back honestly, then decide what changes. Measure → reflect → adapt." />
      <Tabs label="Review type" value={kind} onChange={setKind} options={[["weekly", "Weekly"], ["monthly", "Monthly"], ["quarterly", "Quarterly"]]} />
      <div className="row between wrap" style={{ marginBottom: 12 }}>
        <div className="row">
          <Button icon onClick={() => step(-1)} aria-label="Previous period">
            <ChevronLeft size={16} />
          </Button>
          <span className="strong">{q.data ? `${fmtDate(q.data.from, undefined, { weekday: kind === "weekly" })} – ${fmtDate(q.data.to, undefined, { year: true })}` : "…"}</span>
          <Button icon onClick={() => step(1)} aria-label="Next period" disabled={q.data ? q.data.to >= today : true}>
            <ChevronRight size={16} />
          </Button>
        </div>
        {q.data?.review?.status === "done" && (
          <span className="badge good">
            <CheckCircle2 size={12} aria-hidden /> Completed
          </span>
        )}
      </div>
      {q.isLoading ? <Skeleton lines={10} /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : q.data ? <ReviewBody key={`${kind}:${q.data.from}`} d={q.data} /> : null}
      {(past.data ?? []).length > 0 && (
        <>
          <h2 className="section-title">Past {kind} reviews</h2>
          <div className="chips">
            {past.data!.map((r) => (
              <button key={r.id} className="chip" onClick={() => setAnchor(r.period_start)} aria-pressed={q.data?.from === r.period_start}>
                {fmtDate(r.period_start, undefined, { year: true })} {r.status === "done" ? "✓" : "(draft)"}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ReviewBody({ d }: { d: StatsResp }) {
  const s = d.stats;
  const prompts = REVIEW_PROMPTS[d.kind];
  const [answers, setAnswers] = useState<Record<string, string>>(d.review?.answers ?? {});
  const [priorities, setPriorities] = useState<string[]>(d.review?.priorities ?? []);
  const [newP, setNewP] = useState("");
  const [decisions, setDecisions] = useState<Record<string, "keep" | "change" | "drop">>((d.review?.goal_decisions as Record<string, "keep" | "change" | "drop">) ?? {});
  const [ai, setAi] = useState<string | null>(null);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const mut = useMutate();
  const status = useApi<{ configured: boolean; enabled: boolean }>("/ai/status");
  useEffect(() => {
    setAnswers(d.review?.answers ?? {});
  }, [d.review]);

  const save = (st: "draft" | "done") =>
    mut
      .create("reviews", { kind: d.kind, period_start: d.from, period_end: d.to, answers, priorities, goal_decisions: decisions, snapshot: s.summary, status: st }, { success: st === "done" ? "Review completed" : "Draft saved" })
      .catch(() => {});

  const askAi = async () => {
    setAiLoading(true);
    setAiErr(null);
    try {
      const r = await post<{ text: string }>("/ai/reflect", { kind: "weekly_review" });
      setAi(r.text);
    } catch (e) {
      setAiErr(e instanceof ApiError ? e.message : "Couldn't reach the assistant.");
    } finally {
      setAiLoading(false);
    }
  };

  const sm = s.summary;
  const wins = [...s.wins.goals_achieved.map((g) => `Goal achieved: ${g.title}`), ...s.wins.projects_completed.map((p) => `Project completed: ${p.title}`), ...s.wins.milestones.map((m) => `Milestone: ${m.title} (${m.goal})`), ...s.wins.important_tasks.map((t) => t.title)];
  return (
    <div className="col gap-16">
      <Card title="The numbers">
        <div className="stats-row">
          <Stat label="Tasks done" value={sm.tasks_done ?? 0} delta={`${sm.important_done ?? 0} important`} />
          <Stat label="Deep work" value={fmtMin(sm.focus_min)} />
          <Stat label="Learning" value={fmtMin(sm.study_min)} />
          <Stat label="Habit consistency" value={pct(sm.habit_rate)} />
          <Stat label="Exercise" value={`${sm.exercise_days ?? 0}`} unit="days" />
          <Stat label="Sleep avg" value={sm.sleep_avg ?? "—"} unit={sm.sleep_avg ? "h" : undefined} />
          <Stat label="Mood avg" value={sm.mood_avg ?? "—"} unit={sm.mood_avg ? "/5" : undefined} />
          <Stat label="Interactions" value={s.relationships.interactions} />
          <Stat label="Spent" value={formatMoney(s.finance.expenses, undefined, true)} delta={`Earned ${formatMoney(s.finance.income, undefined, true)}`} />
        </div>
      </Card>
      <div className="grid grid-2">
        <Card title="Wins" icon={<Trophy size={15} aria-hidden />}>
          {wins.length ? (
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {wins.slice(0, 12).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : (
            <p className="small muted">No important tasks, milestones or projects completed in this period. That's information, not a verdict.</p>
          )}
        </Card>
        <Card title="Slipped & bottlenecks" icon={<AlertTriangle size={15} aria-hidden />}>
          {s.slipped.overdue_tasks.length + s.slipped.missed_milestones.length + s.bottlenecks.length === 0 ? (
            <p className="small muted">Nothing slipped. 🎯</p>
          ) : (
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {s.slipped.missed_milestones.map((m) => (
                <li key={m.id}>
                  Missed milestone: {m.title} ({m.goal})
                </li>
              ))}
              {s.slipped.overdue_tasks.slice(0, 6).map((t) => (
                <li key={t.id}>Still open: {t.title}</li>
              ))}
              {s.bottlenecks.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Goals">
          <div className="list">
            {s.goals.map((g) => (
              <div key={g.id} className="item">
                <Link to={`/goals/${g.id}`} className="grow ellipsis" style={{ textDecoration: "none" }}>
                  {g.title}
                </Link>
                <span className="small muted num">{g.progress == null ? "—" : `${Math.round(g.progress * 100)}%`}</span>
                <PaceBadge pace={g.pace} />
              </div>
            ))}
            {!s.goals.length && <p className="small muted">No active goals.</p>}
          </div>
        </Card>
        <Card title="Habits">
          <BarList items={s.habits.map((h) => ({ label: h.title, value: Math.round((h.rate ?? 0) * 100), hint: `${h.completed}/${h.target}` }))} format={(v) => `${v}%`} empty="No habits." />
        </Card>
        {s.area_time.length > 0 && (
          <Card title="Where focus time went">
            <BarList items={s.area_time.map((a) => ({ label: a.area, value: a.minutes }))} format={fmtMin} />
          </Card>
        )}
      </div>

      <Card
        title="Reflect"
        actions={
          status.data?.configured && status.data.enabled ? (
            <Button size="sm" onClick={askAi} loading={aiLoading}>
              <Sparkles size={14} aria-hidden /> Help me reflect
            </Button>
          ) : undefined
        }
      >
        {ai && (
          <div className="card flat card-pad" style={{ marginBottom: 12, background: "var(--surface-2)" }}>
            <div className="row between">
              <span className="badge info">AI interpretation — may be wrong</span>
              <Button size="sm" variant="ghost" icon onClick={() => setAi(null)} aria-label="Dismiss">
                <X size={14} />
              </Button>
            </div>
            <p className="small pre-wrap mt-8">{ai}</p>
          </div>
        )}
        {aiErr && <p className="small" style={{ color: "var(--bad)" }}>{aiErr}</p>}
        <div className="col gap-16">
          {prompts.map((p) => (
            <label key={p} className="col gap-4">
              <span className="prompt-q">{p}</span>
              <textarea className="textarea serif" rows={2} value={answers[p] ?? ""} onChange={(e) => setAnswers({ ...answers, [p]: e.target.value })} />
            </label>
          ))}
        </div>
      </Card>

      {d.kind === "quarterly" && s.goals.length > 0 && (
        <Card title="Keep, change, drop">
          <p className="small muted" style={{ marginBottom: 8 }}>
            Decide for each active goal. “Drop” is applied when you complete the review; “Change” is a reminder to edit it.
          </p>
          <div className="list">
            {s.goals.map((g) => (
              <div key={g.id} className="item" style={{ flexWrap: "wrap" }}>
                <span className="grow">{g.title}</span>
                <div className="seg" role="group" aria-label={`Decision for ${g.title}`}>
                  {(["keep", "change", "drop"] as const).map((k) => (
                    <button key={k} aria-pressed={decisions[g.id] === k} onClick={() => setDecisions({ ...decisions, [g.id]: k })}>
                      {k[0].toUpperCase() + k.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <Link to="/goals?new=1" className="btn btn-sm mt-12">
            <Plus size={14} aria-hidden /> Add a goal for next quarter
          </Link>
        </Card>
      )}

      <Card title={`Priorities for next ${d.kind === "weekly" ? "week" : d.kind === "monthly" ? "month" : "quarter"}`}>
        <div className="col gap-8">
          {priorities.map((p, i) => (
            <div key={i} className="row">
              <span className="num strong">{i + 1}.</span>
              <span className="grow">{p}</span>
              <Button size="sm" variant="ghost" icon aria-label="Remove priority" onClick={() => setPriorities(priorities.filter((_, j) => j !== i))}>
                <X size={14} />
              </Button>
            </div>
          ))}
          {priorities.length < 5 && (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                if (newP.trim()) {
                  setPriorities([...priorities, newP.trim()]);
                  setNewP("");
                }
              }}
            >
              <input className="input" value={newP} onChange={(e) => setNewP(e.target.value)} placeholder="Add a priority (3 is plenty)" aria-label="New priority" maxLength={300} />
              <Button type="submit">Add</Button>
            </form>
          )}
        </div>
      </Card>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <Button onClick={() => save("draft")} loading={mut.pending}>
          Save draft
        </Button>
        <Button variant="primary" onClick={() => save("done")} loading={mut.pending}>
          Complete review
        </Button>
      </div>
    </div>
  );
}
